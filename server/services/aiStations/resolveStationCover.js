/**
 * Resolve the cover-art URL for each AI station card.
 *
 * Three-tier preference order, walked top-to-bottom per station:
 *
 *   1. Pre-baked Gemini cover at
 *      `public/images/stations/<genreId>-<stationId>.png` — written by
 *      `scripts/seed-station-covers.js`. The "editorial" tier:
 *      bespoke per-station artwork that captures the genre + era +
 *      DJ persona in one image. Not every station has one (only a
 *      handful have been baked so far), so the next tier is what
 *      most cards hit today.
 *
 *   2. The station's DJ avatar at `public/images/djs/<djSlug>.png` —
 *      every station pins a `djId` in the catalog, and every DJ has a
 *      portrait baked by `scripts/seed-dj-avatars.js`. This is the
 *      "always-works" tier: 28 portraits cover 100% of stations.
 *
 *   3. `null` — only reached if a DJ portrait is missing on disk too.
 *      The client falls back to its gradient swatch in that case so
 *      no card ever renders broken.
 *
 * Returns a flat map keyed by `"<genreId>/<stationId>"`. The client
 * fetches this once at app load via `GET /api/stations/covers` and
 * merges it into the hardcoded `client/Components/tabs/aiStations.js`
 * catalog at render time.
 *
 * NOTE: we intentionally don't try Spotify album art here. Cached
 * album-art URLs live in `AIStation.tracks[0].image` once a station
 * has been generated for the current week, but (a) those URLs rot
 * (Spotify CDN tokens expire), (b) we'd need an auth context to
 * decide whose cache to read, and (c) the DJ-portrait fallback is
 * already strong enough visually. If we want to layer it in later
 * it slots in cleanly between tiers 1 and 2.
 */

const fs = require('node:fs')
const path = require('node:path')
const { CATALOG } = require('./catalog')
const { loadPersonaMetadata } = require('../utl/loadPersonas')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public')
const STATIONS_DIR = path.join(PUBLIC_DIR, 'images', 'stations')
const DJS_DIR = path.join(PUBLIC_DIR, 'images', 'djs')

// Build the `djId → image filename` map once at module load. The
// roster is static between deploys (it lives in personas/*.md) so
// there's no reason to re-parse the markdown on every catalog
// request. We key on `image` (not `slug`) because the on-disk
// portrait filename is set per-persona in frontmatter and doesn't
// always equal the slug — e.g. slug `m-quake` writes to `mquake.png`.
let djImageById = null
function getDjImageById() {
  if (djImageById) return djImageById
  djImageById = new Map()
  for (const meta of loadPersonaMetadata()) {
    if (meta.image) djImageById.set(meta.id, meta.image)
  }
  return djImageById
}

function bakedCoverFilename(genreId, stationId) {
  return `${genreId}-${stationId}.png`
}

// Extensions tried for pre-baked covers, in preference order. PNG is
// listed first for historical continuity (the Gemini-baked covers
// from the painterly-illustration era were PNGs). JPG comes next
// because photo-style covers (sourced from Unsplash / Wikimedia in
// the photo-discovery flow) compress to ~10x smaller as JPG with no
// perceptible quality loss at thumbnail size. WEBP is included as a
// future-proofing tier in case we ever export with `sharp`.
const COVER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

/**
 * Resolve the cover URL for one station, walking the preference order
 * above. Exported so the bake script + tests can call it without
 * rebuilding the whole catalog map.
 */
function resolveStationCover({ genreId, stationId, djId }) {
  // Tier 1: pre-baked Gemini cover OR human-picked photo cover.
  // Both flows write into the same `public/images/stations/` dir;
  // we just allow either png/jpg/jpeg/webp so picking from Unsplash
  // (jpg) and from the Gemini bake (png) can coexist.
  for (const ext of COVER_EXTENSIONS) {
    const name = `${genreId}-${stationId}.${ext}`
    if (fs.existsSync(path.join(STATIONS_DIR, name))) {
      return `/images/stations/${name}`
    }
  }
  // Tier 2: DJ portrait
  const djImage = getDjImageById().get(djId)
  if (djImage) {
    if (fs.existsSync(path.join(DJS_DIR, djImage))) {
      return `/images/djs/${djImage}`
    }
  }
  // Tier 3: nothing on disk — client falls back to gradient
  return null
}

/**
 * Build the full `"<genre>/<station>" → url` map for every station
 * in the server-side catalog. Re-walks `fs.existsSync` on every call
 * so newly-baked covers picked up by a running dev server show up on
 * the next browse refresh (no nodemon restart needed).
 */
function resolveAllStationCovers() {
  const result = {}
  for (const [genreId, genre] of Object.entries(CATALOG)) {
    for (const station of genre.stations || []) {
      const key = `${genreId}/${station.id}`
      result[key] = resolveStationCover({
        genreId,
        stationId: station.id,
        djId: station.djId,
      })
    }
  }
  return result
}

module.exports = {
  resolveStationCover,
  resolveAllStationCovers,
  bakedCoverFilename,
}
