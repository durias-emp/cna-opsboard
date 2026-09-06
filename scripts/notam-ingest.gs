/**
 * CNA NOTAM Ingest — Gmail → Supabase notam_raw
 *
 * Corre en Google Apps Script bajo la cuenta cielonorteaviacion@gmail.com.
 * Captura todo hilo con la etiqueta NOTAM-AIS (puesta por el filtro de Gmail)
 * y sube cada mensaje crudo a notam_raw. No interpreta nada, a propósito:
 * el parser de la fase 2 se escribe contra estos correos reales.
 *
 * INSTALACIÓN (una vez):
 *   1. script.google.com con la cuenta de CNA → proyecto "CNA NOTAM Ingest"
 *   2. Pegar este archivo.
 *   3. Project Settings → Script Properties:
 *        SUPABASE_URL          https://<proyecto>.supabase.co
 *        SUPABASE_SERVICE_KEY  la llave service_role   ← SOLO aquí. Nunca en
 *                              el código, nunca en el repo, nunca en el front.
 *        ALERT_EMAIL           correo que recibe avisos de falla
 *   4. Correr testConnection() a mano → debe registrar HTTP 200.
 *   5. Triggers → ingestNotams, time-driven, cada 15 minutos.
 *
 * Idempotencia: notam_raw.gmail_message_id es UNIQUE y el insert va con
 * Prefer: resolution=ignore-duplicates, así que re-procesar un hilo no
 * duplica filas. Además, cada hilo ya subido recibe la etiqueta
 * NOTAM-INGESTED para no releerlo.
 *
 * Fallas: visibles, nunca silenciosas. Cualquier error manda correo a
 * ALERT_EMAIL y deja el hilo SIN etiqueta de ingestado para reintentarlo
 * en la próxima corrida.
 */

var SOURCE_LABEL = 'NOTAM-AIS';
var DONE_LABEL = 'NOTAM-INGESTED';
var BATCH_THREADS = 40; // por corrida; el trigger de 15 min drena el resto

function props_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SUPABASE_URL');
  var key = p.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en Script Properties');
  return { url: url.replace(/\/$/, ''), key: key, alert: p.getProperty('ALERT_EMAIL') };
}

function testConnection() {
  var c = props_();
  var res = UrlFetchApp.fetch(c.url + '/rest/v1/notam_raw?select=id&limit=1', {
    headers: { apikey: c.key, Authorization: 'Bearer ' + c.key },
    muteHttpExceptions: true,
  });
  Logger.log('HTTP ' + res.getResponseCode() + ' — ' + res.getContentText().slice(0, 200));
  if (res.getResponseCode() !== 200) throw new Error('Conexión falló: HTTP ' + res.getResponseCode());
}

/**
 * Correr UNA vez tras actualizar el script: quita la etiqueta NOTAM-INGESTED
 * de todos los hilos para que la próxima corrida de ingestNotams los vuelva a
 * subir, ahora con adjuntos. No duplica nada (merge-duplicates + id único).
 */
function resetIngestLabels() {
  var done = GmailApp.getUserLabelByName(DONE_LABEL);
  if (!done) { Logger.log('No hay etiqueta ' + DONE_LABEL); return; }
  var threads = GmailApp.search('label:' + DONE_LABEL, 0, 200);
  threads.forEach(function (t) { t.removeLabel(done); });
  Logger.log('Etiqueta quitada de ' + threads.length + ' hilos. Ahora corre ingestNotams.');
}

function ingestNotams() {
  var c = props_();
  var done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  var threads = GmailApp.search('label:' + SOURCE_LABEL + ' -label:' + DONE_LABEL, 0, BATCH_THREADS);
  if (!threads.length) return;

  var ok = 0, failures = [];
  threads.forEach(function (thread) {
    try {
      var rows = thread.getMessages().map(function (m) {
        // Adjuntos reales (sin imágenes inline: firmas y logos no son NOTAMs).
        // Crudos en base64 — el parser de fase 2 decodifica; aquí no se
        // interpreta nada. Tope 4 MB por adjunto para no reventar la fila.
        var atts = m.getAttachments({ includeInlineImages: false, includeAttachments: true })
          .map(function (a) {
            var size = a.getSize();
            return {
              filename: a.getName(),
              mime: a.getContentType(),
              size_bytes: size,
              data_b64: size <= 4 * 1024 * 1024 ? Utilities.base64Encode(a.getBytes()) : null,
            };
          });
        return {
          gmail_message_id: m.getId(),
          gmail_thread_id: thread.getId(),
          from_address: m.getFrom(),
          subject: m.getSubject(),
          received_at: m.getDate().toISOString(),
          body_text: m.getPlainBody(),
          body_html: m.getBody(),
          attachments: atts,
        };
      });
      // merge-duplicates: re-correr sobre un hilo ya subido ACTUALIZA la fila
      // (así el histórico ganó adjuntos sin duplicarse)
      var res = UrlFetchApp.fetch(c.url + '/rest/v1/notam_raw?on_conflict=gmail_message_id', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          apikey: c.key,
          Authorization: 'Bearer ' + c.key,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        payload: JSON.stringify(rows),
        muteHttpExceptions: true,
      });
      var code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        thread.addLabel(done);   // solo tras subir con éxito
        ok += rows.length;
      } else {
        failures.push('HTTP ' + code + ' en "' + thread.getFirstMessageSubject() + '": ' +
          res.getContentText().slice(0, 300));
      }
    } catch (e) {
      failures.push('"' + thread.getFirstMessageSubject() + '": ' + e.message);
    }
  });

  if (failures.length && c.alert) {
    MailApp.sendEmail(c.alert, 'CNA NOTAM Ingest: ' + failures.length + ' hilo(s) fallaron',
      'Subidos OK: ' + ok + ' mensajes.\n\nFallas (se reintentan solas en la próxima corrida):\n\n' +
      failures.join('\n\n'));
  }
  Logger.log('Subidos: ' + ok + ' mensajes · Fallas: ' + failures.length);
  parseNotams();   // fase 2 corre en el mismo ciclo de 15 min
}

/* ── FASE 2: extracción de texto y parser ICAO ─────────────────────────────
 *
 * REQUIERE el servicio avanzado "Drive API" (v2): en el editor, menú
 * izquierdo "Services" → + → Drive API → Add. Los PDF/DOCX se convierten a
 * Google Doc temporal (con OCR para PDF), se lee el texto y se borra el Doc.
 *
 * El parser es determinista: regex sobre el formato ICAO (Q/A/B/C/D/E/F/G),
 * desarrollado y validado contra los 10 NOTAMs reales del histórico de AIS.
 * Nada generativo. El campo E se guarda tal como lo emitió AIS.
 */

function extractAttachmentText_(att) {
  if (!att.data_b64) return '';
  var mime = att.mime || '';
  if (mime.indexOf('pdf') < 0 && mime.indexOf('word') < 0 && mime.indexOf('text') < 0) return '';
  var blob = Utilities.newBlob(Utilities.base64Decode(att.data_b64), mime, att.filename);
  if (mime.indexOf('text') >= 0) return blob.getDataAsString();
  // Drive convierte a Doc temporal y de ahí se lee el texto. Falla intermitente
  // por límites de tasa → 3 intentos con pausa creciente, OCR como plan B.
  var lastErr = null;
  for (var i = 0; i < 3; i++) {
    if (i > 0) Utilities.sleep(2000 * i);
    var opts = i < 2 ? { convert: true } : { ocr: true, ocrLanguage: 'es' };
    try {
      var doc = Drive.Files.insert(
        { title: 'tmp-notam-extract', mimeType: 'application/vnd.google-apps.document' },
        blob, opts);
      try {
        return DocumentApp.openById(doc.id).getBody().getText();
      } finally {
        Drive.Files.remove(doc.id);
      }
    } catch (ex) { lastErr = ex; }
  }
  throw lastErr;
}

/** Corre esto a mano para reintentar los correos que quedaron en 'failed'. */
function reparseFailed() {
  var c = props_();
  var res = UrlFetchApp.fetch(c.url + '/rest/v1/notam_raw?parse_status=eq.failed', {
    method: 'patch', contentType: 'application/json',
    headers: { apikey: c.key, Authorization: 'Bearer ' + c.key },
    payload: JSON.stringify({ parse_status: 'pending', parse_error: null }),
    muteHttpExceptions: true,
  });
  Logger.log('Marcados como pending: HTTP ' + res.getResponseCode() + '. Ahora corre parseNotams.');
  parseNotams();
}

function parseNotamText_(text) {
  var out = [];
  var blocks = text.split(/(?=[A-Z]\d{4}\/\d{2}\s*\n?\s*NOTAM[NRC])/);
  blocks.forEach(function (b) {
    var m = b.match(/([A-Z]\d{4}\/\d{2})\s*\n?\s*NOTAM([NRC])(?:\s+([A-Z]\d{4}\/\d{2}))?/);
    if (!m) return;
    var n = { notam_id: m[1], type: 'NOTAM' + m[2], replaces_id: m[3] || null, is_permanent: false };
    var q = b.match(/Q\)\s*([A-Z]{4})\/(Q[A-Z]{4})\/[^\/]*\/[^\/]*\/[^\/]*\/(\d{3})\/(\d{3})\/(\d{4})([NS])(\d{5})([EW])(\d{3})/);
    if (q) {
      n.fir = q[1]; n.q_code = q[2];
      var lat = parseInt(q[5].slice(0,2),10) + parseInt(q[5].slice(2),10)/60;
      var lng = parseInt(q[7].slice(0,3),10) + parseInt(q[7].slice(3),10)/60;
      n.center_lat = q[6] === 'N' ? lat : -lat;
      n.center_lng = q[8] === 'W' ? -lng : lng;
      n.radius_nm = parseInt(q[9],10);
      n.lower_limit = q[3] + '00FT'; n.upper_limit = q[4] + '00FT';
    }
    var a = b.match(/A\)\s*([A-Z]{4})/);      if (a) n.location = a[1];
    var ts = function (s) { return '20' + s.slice(0,2) + '-' + s.slice(2,4) + '-' + s.slice(4,6) +
      'T' + s.slice(6,8) + ':' + s.slice(8,10) + ':00Z'; };
    var bb = b.match(/B\)\s*(\d{10})/);       if (bb) n.effective_from = ts(bb[1]);
    var cc = b.match(/C\)\s*(\d{10}|PERM)/);
    if (cc) { if (cc[1] === 'PERM') n.is_permanent = true; else n.effective_to = ts(cc[1]); }
    var d = b.match(/D\)\s*([^\n]+)/);
    if (d && d[1].trim().indexOf('E)') !== 0) n.schedule = d[1].trim();
    var e = b.match(/E\)\s*([\s\S]*?)(?:\n?\s*F\)|$)/);
    if (e) n.body = e[1].replace(/\s+/g, ' ').trim();
    var ec = b.match(/(\d{6})([NS])(\d{7})([EW])/);   // centro preciso del campo E
    if (ec) {
      var la = parseInt(ec[1].slice(0,2),10) + parseInt(ec[1].slice(2,4),10)/60 + parseInt(ec[1].slice(4,6),10)/3600;
      var lo = parseInt(ec[3].slice(0,3),10) + parseInt(ec[3].slice(3,5),10)/60 + parseInt(ec[3].slice(5,7),10)/3600;
      n.center_lat = ec[2] === 'N' ? la : -la;
      n.center_lng = ec[4] === 'W' ? -lo : lo;
    }
    var er = b.match(/WI\s+(\d+)\s*NM\s+RADIUS/);   if (er) n.radius_nm = parseInt(er[1],10);
    var f = b.match(/F\)\s*([A-Z0-9 ]+?)\s*G\)/);   if (f) n.lower_limit = f[1].trim();
    var g = b.match(/G\)\s*([A-Z0-9 ]+)/);            if (g) n.upper_limit = g[1].trim();
    if (n.body) out.push(n);
  });
  return out;
}

function scoreNotam_(n, rules) {
  var best = null;
  rules.forEach(function (r) {
    var hay = { location: n.location, fir: n.fir, q_code: n.q_code, body: n.body }[r.field] || '';
    var hit = r.is_regex ? new RegExp(r.pattern, 'i').test(hay)
                         : hay.toUpperCase().indexOf(r.pattern.toUpperCase()) >= 0;
    if (hit && (!best || r.score > best.score)) best = r;
  });
  if (best) { n.relevance_score = best.score; n.relevance_rule = best.label; }
  return n;
}

function parseNotams() {
  var c = props_();
  var H = { apikey: c.key, Authorization: 'Bearer ' + c.key };
  var rules = JSON.parse(UrlFetchApp.fetch(
    c.url + '/rest/v1/notam_rules?is_active=eq.true&select=label,field,pattern,is_regex,score',
    { headers: H }).getContentText());
  var raws = JSON.parse(UrlFetchApp.fetch(
    c.url + '/rest/v1/notam_raw?parse_status=eq.pending&select=id,subject,body_text,attachments&order=received_at&limit=12',
    { headers: H }).getContentText());
  if (!raws.length) { Logger.log('Nada pendiente.'); return; }

  var parsedRows = 0, notamCount = 0, failures = [];
  raws.forEach(function (raw) {
    var status = 'not_notam', err = null;
    try {
      var text = raw.body_text || '';
      (raw.attachments || []).forEach(function (att) {
        try { text += '\n' + extractAttachmentText_(att); }
        catch (ex) { err = 'adjunto ' + att.filename + ': ' + ex.message; }
      });
      var notams = parseNotamText_(text).map(function (n) {
        n.notam_raw_id = raw.id;
        return scoreNotam_(n, rules);
      });
      if (notams.length) {
        var res = UrlFetchApp.fetch(c.url + '/rest/v1/notams?on_conflict=notam_id,location', {
          method: 'post', contentType: 'application/json',
          headers: { apikey: c.key, Authorization: 'Bearer ' + c.key,
                     Prefer: 'resolution=merge-duplicates,return=minimal' },
          payload: JSON.stringify(notams), muteHttpExceptions: true });
        if (res.getResponseCode() >= 300) throw new Error('insert notams HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0,200));
        // NOTAMR reemplaza, NOTAMC cancela al anterior
        notams.forEach(function (n) {
          if ((n.type === 'NOTAMR' || n.type === 'NOTAMC') && n.replaces_id) {
            UrlFetchApp.fetch(c.url + '/rest/v1/notams?notam_id=eq.' + encodeURIComponent(n.replaces_id), {
              method: 'patch', contentType: 'application/json',
              headers: H,
              payload: JSON.stringify({ status: n.type === 'NOTAMR' ? 'replaced' : 'cancelled' }),
              muteHttpExceptions: true });
          }
        });
        status = 'parsed'; notamCount += notams.length;
      }
      if (err && status !== 'parsed') { status = 'failed'; }
    } catch (ex) { status = 'failed'; err = ex.message; failures.push(raw.subject + ': ' + ex.message); }
    UrlFetchApp.fetch(c.url + '/rest/v1/notam_raw?id=eq.' + raw.id, {
      method: 'patch', contentType: 'application/json', headers: H,
      payload: JSON.stringify({ parse_status: status, parse_error: err, parsed_at: new Date().toISOString() }),
      muteHttpExceptions: true });
    parsedRows++;
  });
  Logger.log('Procesados: ' + parsedRows + ' correos · NOTAMs extraídos: ' + notamCount + ' · Fallas: ' + failures.length);
  if (failures.length && c.alert) {
    MailApp.sendEmail(c.alert, 'CNA NOTAM Parse: ' + failures.length + ' falla(s)', failures.join('\n\n'));
  }
  if (raws.length === 12) parseNotams();   // drena el backlog en tandas
}
