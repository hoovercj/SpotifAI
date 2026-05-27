/**
 * Artist seed generator — "artist radio".
 *
 * Pipeline:
 *   1. Fetch the seed artist from Spotify so we have name + image
 *      (needed by the orchestrator for the session descriptor and
 *      intro prompt).
 *   2. Render `session-tracks-artist.md` with the artist name.
 *   3. Run the Gemini → Spotify pipeline to get ~30 tracks blending
 *      the artist's own work with sonically adjacent artists.
 *
 * Unlike `fromTrack`, we do NOT prepend a specific seed track — the
 * generator's job is to assemble a station-shaped queue from the
 * artist's full world. Gemini is instructed (in the prompt) to include
 * ~8-12 of the artist's own songs out of the 30.
 *
 * Returns:
 *   {
 *     tracks: Array<{ uri, name, artists[], image, durationMs }>,
 *     meta:   {
 *       name,          // e.g. "Queen Radio"
 *       imageUrl,      // artist's image
 *       artistName,    // exact artist name — used for intro prompt
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

function extractArtistId(uri) {
  if (!uri) return null
  const parts = String(uri).split(":")
  return parts.length === 3 && parts[1] === "artist" ? parts[2] : null
}

async function fromArtist({ seed, spotifyAccessToken, excludeUris = [] }) {
  const artistId = extractArtistId(seed.spotifyUri)
  if (!artistId) {
    const err = new Error(`fromArtist: invalid Spotify URI "${seed.spotifyUri}"`)
    err.status = 400
    throw err
  }

  const api = new SpotifyWebApi()
  api.setAccessToken(spotifyAccessToken)

  let seedArtist
  try {
    const res = await api.getArtist(artistId)
    seedArtist = res?.body
  } catch (err) {
    const wrapped = new Error(`fromArtist: could not fetch seed artist: ${err?.message || err}`)
    wrapped.status = err?.statusCode === 404 ? 404 : 502
    throw wrapped
  }
  if (!seedArtist?.name) {
    const err = new Error(`fromArtist: seed artist ${artistId} returned no name`)
    err.status = 404
    throw err
  }

  const artistName = seedArtist.name
  const artistImage = seedArtist.images?.[0]?.url || null

  const prompt = loadPrompt("session-tracks-artist", {
    seedArtist: artistName,
    candidateCount: DEFAULT_CANDIDATE_COUNT,
    excludeUris,
    excludeList: (excludeUris || []).slice(0, 30),
  })

  const tracks = await geminiToSpotifyTracks({
    prompt,
    spotifyAccessToken,
    targetTracks: DEFAULT_TARGET_TRACKS,
    excludeUris,
  })

  return {
    tracks,
    meta: {
      name: `${artistName} Radio`,
      imageUrl: artistImage,
      artistName,
    },
  }
}

module.exports = { fromArtist }
