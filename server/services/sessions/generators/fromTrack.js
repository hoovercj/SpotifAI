/**
 * Track seed generator — "more like this song" radio.
 *
 * Pipeline:
 *   1. Fetch the seed track from Spotify so we have its title + primary
 *      artist + album image (needed by the orchestrator for the session
 *      descriptor and the intro prompt).
 *   2. Render `session-tracks-track.md` with the seed's title + artist.
 *   3. Run the Gemini → Spotify pipeline to get ~30 similar tracks.
 *   4. Prepend the seed track itself so the user hears the song they
 *      tapped first (per user-confirmed design: "play the clicked song
 *      first, DJ takes over from outro").
 *
 * Returns:
 *   {
 *     tracks: Array<{ uri, name, artists[], image, durationMs }>,
 *     meta:   {
 *       name,           // e.g. "Songs like Bohemian Rhapsody"
 *       imageUrl,       // seed track's album art
 *       artistName,     // primary credited artist — used for intro prompt
 *       seedTitle,      // exact title — used for intro prompt
 *     },
 *   }
 */
const SpotifyWebApi = require("spotify-web-api-node")
const { loadPrompt } = require("../../utl/loadPrompt")
const {
  geminiToSpotifyTracks,
  DEFAULT_TARGET_TRACKS,
  DEFAULT_CANDIDATE_COUNT,
} = require("../geminiToSpotifyTracks")

function extractTrackId(uri) {
  if (!uri) return null
  const parts = String(uri).split(":")
  return parts.length === 3 && parts[1] === "track" ? parts[2] : null
}

function toTrackPayload(track) {
  if (!track) return null
  return {
    uri: track.uri,
    name: track.name,
    artists: (track.artists || []).map((a) => a.name),
    image: track.album?.images?.[0]?.url || null,
    durationMs: track.duration_ms ?? null,
  }
}

async function fromTrack({ seed, spotifyAccessToken, excludeUris = [] }) {
  const trackId = extractTrackId(seed.spotifyUri)
  if (!trackId) {
    const err = new Error(`fromTrack: invalid Spotify URI "${seed.spotifyUri}"`)
    err.status = 400
    throw err
  }

  const api = new SpotifyWebApi()
  api.setAccessToken(spotifyAccessToken)

  // 1. Fetch the seed track for prompt vars + descriptor.
  let seedTrack
  try {
    const res = await api.getTrack(trackId)
    seedTrack = res?.body
  } catch (err) {
    const wrapped = new Error(`fromTrack: could not fetch seed track: ${err?.message || err}`)
    wrapped.status = err?.statusCode === 404 ? 404 : 502
    throw wrapped
  }
  if (!seedTrack?.name) {
    const err = new Error(`fromTrack: seed track ${trackId} returned no name`)
    err.status = 404
    throw err
  }

  const seedTitle = seedTrack.name
  const seedArtist =
    (seedTrack.artists && seedTrack.artists[0]?.name) || "unknown artist"
  const seedAlbumImage = seedTrack.album?.images?.[0]?.url || null

  // The seed track itself is always excluded from Gemini's output (the
  // prompt asks for "not the seed") and from the final list (we prepend
  // it). Also exclude whatever the caller passed in for refill.
  const fullExcludes = [seed.spotifyUri, ...(excludeUris || [])]

  // 2. Render prompt.
  const prompt = loadPrompt("session-tracks-track", {
    seedTitle,
    seedArtist,
    candidateCount: DEFAULT_CANDIDATE_COUNT,
    excludeUris: fullExcludes,
    excludeList: fullExcludes.slice(0, 30),
  })

  // 3. Run pipeline. Reserve a slot for the seed track itself, so the
  // final queue is exactly TARGET_TRACKS long.
  const similar = await geminiToSpotifyTracks({
    prompt,
    spotifyAccessToken,
    targetTracks: Math.max(1, DEFAULT_TARGET_TRACKS - 1),
    excludeUris: fullExcludes,
  })

  // 4. Prepend the seed track.
  const seedPayload = toTrackPayload(seedTrack)
  const tracks = seedPayload ? [seedPayload, ...similar] : similar

  return {
    tracks,
    meta: {
      name: `Songs like ${seedTitle}`,
      imageUrl: seedAlbumImage,
      artistName: seedArtist,
      seedTitle,
    },
  }
}

module.exports = { fromTrack }
