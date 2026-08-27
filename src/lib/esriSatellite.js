// Esri satellite imagery, with labels, ready to drop into another product.
//
// Extracted from AVIARA on 27 August 2026. Everything in here was measured
// against live tiles rather than read off a blog, and the measurements are
// kept in the comments because they are the part that took the day.
//
// Framework agnostic at the core. OpsBoard uses MapLibre GL, so the Leaflet
// adapter from AVIARA's original was deleted per its own instruction.
//
// ---------------------------------------------------------------------------
// READ THIS BEFORE SHIPPING IT. THE DEFAULT ENDPOINT IS NOT LICENSED FOR
// COMMERCIAL USE.
//
// With no key this uses Esri's anonymous World Imagery service. It works
// immediately, needs no account, and Esri's own community answers state it is
// not licensed for commercial use. AVIARA runs on it today ONLY because AVIARA
// takes no payment today, and that is recorded in writing with a removal
// condition attached.
//
// If OpsBoard is a commercial product, or will be, get a key first. It is free
// to start: an ArcGIS Location Platform account gives a referrer restricted
// key on a free tier with pay as you go beyond it. Pass it to createEsriLayers
// and every request below switches to the licensed endpoint.
//
// Do not do what we did with a different supplier and compile one personal
// non-commercial key into a shipped bundle. That is one licence spent on every
// user at once, and undoing it later is a worse afternoon than getting it
// right now.
// ---------------------------------------------------------------------------

/* ── Endpoints ─────────────────────────────────────────────────────────── */

// The anonymous service. No key, works at once, non-commercial only.
const ESRI_ANON =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

// The licensed service, ArcGIS Location Platform. NOTE: this is the documented
// URL shape rather than one we have personally seen return a tile, because
// Esri's developer documentation would not load while this was written.
// Confirm it against your own key's docs at signup and correct it here.
const ESRI_KEYED =
  'https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/arcgis/imagery/static/{z}/{y}/{x}'

// A SECOND IMAGERY SERVICE, AND IT IS NOT OPTIONAL IF YOU FLY IN LATIN AMERICA.
//
// Standard World Imagery does not reach its sharp commercial imagery over
// Central America until z12, while it is already there by z11 over the US.
// Tiles pulled 26 Aug 2026, same hour:
//
//   Miami           z11 sharp, street grid legible
//   San Salvador    z11 coarse mosaic, no streets     z12 sharp
//   Guatemala City  z11 coarse mosaic, no streets     z12 sharp
//
// Clarity is sharp at z11 in all three. If your users are north of the border
// you can skip it; if they are not, it is the difference between a map and a
// smear.
const ESRI_CLARITY =
  'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

// The reference layers. Bare imagery has no street names, no district names
// and no road network, which is the single biggest complaint you will get.
// Esri publishes these two to sit over World Imagery, free, same terms.
const ESRI_REF_ROADS =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'
const ESRI_REF_PLACES =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

/* ── Attribution, which is a licence condition rather than a courtesy ──── */

// Read from each service's own copyrightText on 26 Aug 2026, not copied from
// anywhere. Re-read them at review: the imagery line said Maxar for months and
// now says Vantor, because Maxar renamed. An attribution naming a company that
// no longer exists is not attribution.
export const ESRI_ATTRIBUTION =
  'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community'

// The reference layers have a DIFFERENT supply chain from the imagery, and one
// link in it is copyleft. OpenStreetMap's ODbL requires the credit rather than
// inviting it. Show these as two lines, not one merged sentence: they are two
// chains and only one of them is a licence you can breach.
export const ESRI_REFERENCE_ATTRIBUTION =
  'Roads and names: Esri, HERE, Garmin, OpenStreetMap contributors'

/* ── Zoom limits, every one of them probed ─────────────────────────────── */

// Imagery runs out at z19. Esri answers deeper requests with a grey "no
// coverage" tile rather than a 404, so a viewer that trusts the network will
// happily replace a sharp picture with a blank one. Probed over Ilopango:
// z17, z18 and z19 return real imagery of 18 to 26 KB; z20 and z21 return a
// 2,521 byte placeholder.
export const IMAGERY_MAX_NATIVE_ZOOM = 18   // Leaflet adds zoomOffset AFTER
                                            // clamping, so this asks for z19.

// THE REFERENCE LAYERS STOP EARLIER THAN THE IMAGERY, AND NOT AT THE SAME
// PLACE AS EACH OTHER. Past their data Esri returns an 872 byte fully
// transparent PNG, which loads without error and draws nothing, so setting
// these too deep makes your labels FADE OUT as the user zooms IN. Probed over
// Nuevo Cuscatlan: roads have ink to z17, places to z16.
export const ROADS_MAX_NATIVE_ZOOM = 16     // asks for z17
export const PLACES_MAX_NATIVE_ZOOM = 15    // asks for z16

// Where Clarity hands over to standard imagery, as a MAP zoom.
//
// Clarity resolves each tile to whichever archive release is best, and past
// z13 it does that with a redirect. Timed over three capitals, six tiles each:
//
//   z11   Clarity 321 ms, no redirects   standard 320 ms
//   z16   Clarity 984 ms, 2 redirects    standard 186 ms
//
// Five times slower for imagery that is no better: at z16 the two are
// indistinguishable. So Clarity takes the wide views it wins and stops before
// the redirects start.
export const CLARITY_MAX_MAP_ZOOM = 12

/* ── The road recolour, if you want it ─────────────────────────────────── */

// Esri paints the road network salmon, into the PNG, before it reaches you.
// There is no property to set. There is a filter, and the salmon is a
// saturated hue at about 17 degrees while yellow is about 55. Sampled off
// twelve loaded tiles, the three commonest road colours are rgb(232,152,120),
// rgb(248,184,168) and rgb(216,136,104).
//
// THE SATURATION IS BELOW ONE ON PURPOSE. The first attempt used
// saturate(1.5), which made a good yellow road and turned every road LABEL
// yellow-green with it. The labels are white in the tile but not PURE white,
// they are a warm off white, and saturate above one amplifies that faint
// warmth into a colour. Below one pulls the text back to neutral while the
// road, genuinely saturated, keeps plenty to rotate.
//
// Apply to the PANE or container, not to each tile: one composite instead of a
// hundred. And know the limit: roads and their labels are one picture, so any
// global adjustment touches both. If you need real control, the answer is
// vector labels, not a better filter.
export const ROAD_RECOLOUR_FILTER = 'hue-rotate(46deg) saturate(0.85)'

/* ── Resolvers ─────────────────────────────────────────────────────────── */

export function satelliteTiles(key) {
  return key ? `${ESRI_KEYED}?token=${encodeURIComponent(key)}` : ESRI_ANON
}
export function clarityTiles() { return ESRI_CLARITY }
export function referenceTiles() {
  return { roads: ESRI_REF_ROADS, places: ESRI_REF_PLACES }
}

/* ── MapLibre GL adapter ───────────────────────────────────────────────── */

// Sources and layers for a MapLibre style, imagery at the bottom and the two
// reference layers over it. Spread into your style, or pass the whole thing to
// addEsriToMapLibre below.
//
// tileSize 128 here for the same reason as Leaflet: it is the CSS width a tile
// is painted at, not the size of the image, and 256 on a 3x screen is one
// source pixel over nine device pixels. MapLibre fetches the next zoom level
// to fill the smaller box.
//
// No Clarity in this adapter: MapLibre has no per-source map-zoom cutoff as
// clean as Leaflet's maxZoom, and mixing them needs a maxzoom/minzoom pair per
// source that is easy to get subtly wrong. If you need Clarity here, add it as
// a second raster source with maxzoom 13 above the floor and test the seam.
export function esriMapLibreSources(opts = {}) {
  const { key = null, labels = true } = opts
  const ref = referenceTiles()
  const sources = {
    'esri-imagery': {
      type: 'raster', tiles: [satelliteTiles(key)], tileSize: 128,
      maxzoom: 19, attribution: ESRI_ATTRIBUTION,
    },
  }
  const layers = [{ id: 'esri-imagery', type: 'raster', source: 'esri-imagery' }]
  if (labels) {
    sources['esri-roads'] = {
      type: 'raster', tiles: [ref.roads], tileSize: 128,
      maxzoom: 17, attribution: ESRI_REFERENCE_ATTRIBUTION,
    }
    sources['esri-places'] = {
      type: 'raster', tiles: [ref.places], tileSize: 128, maxzoom: 16,
    }
    layers.push({ id: 'esri-roads', type: 'raster', source: 'esri-roads' })
    layers.push({ id: 'esri-places', type: 'raster', source: 'esri-places' })
  }
  return { sources, layers }
}

// Adds them to a running map, under `beforeId` if you want your own overlays
// to stay on top.
export function addEsriToMapLibre(map, opts = {}) {
  const { sources, layers } = esriMapLibreSources(opts)
  for (const [id, src] of Object.entries(sources)) {
    if (!map.getSource(id)) map.addSource(id, src)
  }
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, opts.beforeId)
  }
  return { sources, layers }
}

/* ── What is deliberately NOT in here ──────────────────────────────────── */
//
// A globe. AVIARA wears this imagery on a MapLibre globe projection at far
// zoom, and that is a different file with its own sky, atmosphere and a
// separate raster style. Ask if OpsBoard wants it.
//
// Any caching. Both viewers already cache tiles through the browser, and a
// second cache in front of that is a way to serve a stale picture.
//
// A fallback provider. If Esri is down this draws nothing, on purpose. A map
// that silently swaps to a different vendor's imagery is a map whose
// attribution has quietly become wrong.
