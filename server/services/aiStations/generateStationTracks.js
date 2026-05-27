/**
 * Generate a station's track list:
 *   1. Ask Gemini for ~30 (title, artist) candidates matching the station prompt.
 *   2. Resolve each candidate to a Spotify track via the Web API search endpoint
 *      using the caller-supplied access token.
 *   3. De-dupe by URI and trim to TARGET_TRACKS.
 *
 * Each step is best-effort: we tolerate Gemini returning malformed JSON, we
 * tolerate Spotify returning no match for a given (title, artist), etc.
 * Whatever survives all three steps is what the station plays this week.
 */
const { GoogleGenAI } = require("@google/genai")
const SpotifyWebApi = require("spotify-web-api-node")
const { loadPrompt } = require("../utl/loadPrompt")

const TARGET_TRACKS = 30
// Ask Gemini for a few extra so we still hit 30 after Spotify mismatches.
const GEMINI_CANDIDATES = 40

let aiClient
function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error(
        "GOOGLE_API_KEY env var is required to generate AI station setlists"
      )
    }
    aiClient = new GoogleGenAI({ apiKey })
  }
  return aiClient
}

function buildPrompt(genre, station) {
  return loadPrompt("station-tracks", {
    genreName: genre.name,
    stationName: station.name,
    stationBrief: station.prompt.replace(/\s+/g, " ").trim(),
    candidateCount: GEMINI_CANDIDATES,
  })
}

async function askGemini(genre, station) {
  const ai = getClient()
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-3.1-flash-lite"
  const res = await ai.models.generateContent({
    model,
    contents: buildPrompt(genre, station),
    config: {
      responseMimeType: "application/json",
      temperature: 0.9,
    },
  })
  const text = res?.text ?? ""
  return parseCandidates(text)
}

function parseCandidates(text) {
  if (!text) return []
  // Gemini in JSON mode usually returns clean JSON, but defensively strip
  // any surrounding markdown fence in case it slips through.
  const trimmed = text.trim().replace(/^```(?:json)?\n?/i, "").replace(/```$/i, "").trim()
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    console.warn("Gemini station response not valid JSON; got:", trimmed.slice(0, 200))
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((row) => ({
      title: String(row?.title || "").trim(),
      artist: String(row?.artist || "").trim(),
    }))
    .filter((row) => row.title && row.artist)
}

// Symbol returned by `resolveOnSpotify` when Spotify rate-limits us. The
// caller treats this differently from a generic miss: if we see it, the
// whole generation aborts so the user gets a clear retry message instead
// of an empty/half-baked playlist.
const RATE_LIMITED = Symbol("spotify_rate_limited")

async function resolveOnSpotify(api, candidate, { onRateLimit } = {}) {
  // Spotify's search is forgiving — passing artist + title as a plain query
  // is the most reliable approach. Using `track:"..." artist:"..."` field
  // filters actually hurts recall here in practice.
  const q = `${candidate.title} ${candidate.artist}`

  // Up to one transparent retry on 429. After that, bubble RATE_LIMITED so
  // the caller can stop the whole batch.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await api.searchTracks(q, { limit: 1 })
      const item = res?.body?.tracks?.items?.[0]
      if (!item) return null
      return {
        uri: item.uri,
        name: item.name,
        artists: (item.artists || []).map((a) => a.name),
        image: item.album?.images?.[0]?.url || null,
        durationMs: item.duration_ms ?? null,
      }
    } catch (err) {
      const status = err?.statusCode
      if (status === 429) {
        const retryAfter = Number(err?.headers?.["retry-after"]) || 1
        if (typeof onRateLimit === "function") onRateLimit(retryAfter)
        if (attempt === 0) {
          await sleep(Math.min(retryAfter, 5) * 1000)
          continue
        }
        return RATE_LIMITED
      }
      // Any other failure (404-style miss, network blip, etc.) is just a
      // single-track miss — log compactly and move on.
      console.warn(
        "Spotify resolve failed for",
        q,
        err?.body?.error?.message || err?.message || `status=${status}`
      )
      return null
    }
  }
  return null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Public API: returns a deduped list of up to TARGET_TRACKS Spotify tracks
 * for the given station, using `spotifyAccessToken` to call the Spotify
 * Web API on the caller's behalf.
 */
async function generateStationTracks({ genre, station, spotifyAccessToken }) {
  if (!spotifyAccessToken) {
    throw new Error("generateStationTracks requires a spotifyAccessToken")
  }
  const candidates = await askGemini(genre, station)
  if (candidates.length === 0) return []

  const api = new SpotifyWebApi()
  api.setAccessToken(spotifyAccessToken)

  // Resolve sequentially with a small inter-request delay. Spotify's rate
  // limit is a rolling 30s window per client_id — bursting 40 calls at
  // concurrency 5 was reliably triggering 429s in development. A short
  // serial sweep with a ~120ms gap finishes in ~5s and stays well under
  // the documented thresholds.
  let rateLimited = false
  const resolved = []
  for (const candidate of candidates) {
    const track = await resolveOnSpotify(api, candidate, {
      onRateLimit: () => {
        rateLimited = true
      },
    })
    if (track === RATE_LIMITED) {
      const err = new Error(
        "Spotify rate-limited the station generation. Wait a minute and try again."
      )
      err.status = 429
      throw err
    }
    resolved.push(track)
    // Soft throttle. Skip the delay on the last iteration.
    if (candidate !== candidates[candidates.length - 1]) {
      await sleep(120)
    }
  }

  const seen = new Set()
  const out = []
  for (const track of resolved) {
    if (!track?.uri || seen.has(track.uri)) continue
    seen.add(track.uri)
    out.push(track)
    if (out.length >= TARGET_TRACKS) break
  }

  if (rateLimited && out.length < TARGET_TRACKS / 2) {
    const err = new Error(
      "Spotify rate-limited the station generation. Wait a minute and try again."
    )
    err.status = 429
    throw err
  }

  return out
}

module.exports = {
  generateStationTracks,
  // Exposed for the prompt-lab CLI and Promptfoo evals so they reuse the
  // exact same prompt the production path sends to Gemini.
  buildStationTracksPrompt: buildPrompt,
  askGemini,
  parseCandidates,
}
