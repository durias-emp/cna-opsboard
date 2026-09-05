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

function ingestNotams() {
  var c = props_();
  var done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  var threads = GmailApp.search('label:' + SOURCE_LABEL + ' -label:' + DONE_LABEL, 0, BATCH_THREADS);
  if (!threads.length) return;

  var ok = 0, failures = [];
  threads.forEach(function (thread) {
    try {
      var rows = thread.getMessages().map(function (m) {
        return {
          gmail_message_id: m.getId(),
          gmail_thread_id: thread.getId(),
          from_address: m.getFrom(),
          subject: m.getSubject(),
          received_at: m.getDate().toISOString(),
          body_text: m.getPlainBody(),
          body_html: m.getBody(),
        };
      });
      var res = UrlFetchApp.fetch(c.url + '/rest/v1/notam_raw', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          apikey: c.key,
          Authorization: 'Bearer ' + c.key,
          Prefer: 'resolution=ignore-duplicates,return=minimal',
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
}
