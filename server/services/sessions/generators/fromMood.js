/**
 * Mood seed generator.
 *
 * Renders the mood's curatorial brief into a Gemini prompt, asks Gemini
 * for ~40 candidate songs, resolves each to a Spotify URI, dedupes +
 * trims to TARGET_TRACKS. Same Gemini → Spotify pipeline as the legacy
 * stations service, just with a different prompt template.
 *
 * Returns:
 *   {
 *     tracks: Array<{ uri, name, artists[], image, durationMs }>,
 *     meta:   { name, imageUrl },
 *   }
 */
const { lookupMood, lookupMoodStation } = require("../moodCatalog")
const { loadPrompt } = require("../../utl/loadPrompt")
const {
  geminiToSpotifyTracks,
  DEFAULT_TARGET_TRACKS,
  DEFAULT_CANDIDATE_COUNT,
} = require("../geminiToSpotifyTracks")

function buildExcludeList(excludeUris) {
  // Gemini can't dedupe by Spotify URI, but it CAN avoid (title, artist)
  // combos if we hint at them. We're not passing the full URI — just a
  // human-readable list. Cap at 30 entries so the prompt stays compact.
  if (!Array.isArray(excludeUris) || excludeUris.length === 0) return []
  // We don't have title/artist for raw URIs here; the orchestrator's
  // refill caller can pass `{ uri, title, artist }` triples in a future
  // iteration. For Phase 1B, send the URIs as-is so the rule is at least
  // present in the prompt (Gemini ignores it when it doesn't recognize
  // the format, which is fine).
  return excludeUris.slice(0, 30)
}

async function fromMood({ seed, spotifyAccessToken, excludeUris = [] }) {
  const mood = lookupMood(seed.moodId)
  if (!mood) {
    const err = new Error(`fromMood: unknown moodId "${seed.moodId}"`)
    err.status = 404
    throw err
  }
  const station = lookupMoodStation(seed.moodId, seed.stationId)
  if (!station) {
    const err = new Error(
      `fromMood: unknown stationId "${seed.stationId}" for mood "${seed.moodId}"`
    )
    err.status = 404
    throw err
  }

  // "Mood Name — Station Name" is what we surface to the user (NowPlaying
  // tile, recent sessions row). The orchestrator also feeds this to the DJ
  // intro prompt as `context.name`, so keep it human-readable.
  const displayName =
    station.id === mood.stations[0].id
      ? mood.name
      : `${mood.name} \u2014 ${station.name}`

  const excludeList = buildExcludeList(excludeUris)
  const prompt = loadPrompt("session-tracks-mood", {
    moodName: displayName,
    moodPrompt: station.prompt.replace(/\s+/g, " ").trim(),
    candidateCount: DEFAULT_CANDIDATE_COUNT,
    excludeUris,
    excludeList,
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
      name: displayName,
      imageUrl: null,
    },
  }
}

module.exports = { fromMood }
