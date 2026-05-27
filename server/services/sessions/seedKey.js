/**
 * Stable identifier for a session seed.
 *
 * Every Home click — a genre tile, mood tile, recent track, top artist,
 * playlist — collapses into one of five seed shapes:
 *
 *   { type: "station",  genreId,   stationId }
 *   { type: "mood",     moodId }
 *   { type: "track",    spotifyUri }     // spotify:track:XYZ
 *   { type: "artist",   spotifyUri }     // spotify:artist:XYZ
 *   { type: "playlist", spotifyUri }     // spotify:playlist:XYZ
 *
 * `seedKey()` reduces any of those to a deterministic string suitable for
 * use as a session ID, an in-memory job-store key, or (eventually) a DB
 * cache key. Keys are stable across requests so concurrent callers asking
 * for the same seed coalesce onto a single generation job.
 *
 * Keep the output free of characters that would mangle when shoved into
 * an HTTP path segment (no leading slash, no `#`, no spaces).
 */

function seedKey(seed) {
  if (!seed || typeof seed !== "object") {
    throw new Error("seedKey: seed must be an object")
  }
  switch (seed.type) {
    case "station": {
      if (!seed.genreId || !seed.stationId) {
        throw new Error("seedKey: station seed requires genreId + stationId")
      }
      return `station:${seed.genreId}/${seed.stationId}`
    }
    case "mood": {
      if (!seed.moodId) throw new Error("seedKey: mood seed requires moodId")
      return `mood:${seed.moodId}`
    }
    case "track":
    case "artist":
    case "playlist": {
      if (!seed.spotifyUri) {
        throw new Error(`seedKey: ${seed.type} seed requires spotifyUri`)
      }
      return `${seed.type}:${seed.spotifyUri}`
    }
    default:
      throw new Error(`seedKey: unknown seed type "${seed.type}"`)
  }
}

module.exports = { seedKey }
