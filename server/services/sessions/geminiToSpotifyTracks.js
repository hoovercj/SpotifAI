/**
 * Shared Gemini → Spotify pipeline used by mood / track / artist
 * generators. The legacy `generateStationTracks` does the same thing for
 * station seeds but is tied to the catalog's `(genre, station)` shape;
 * this helper accepts a pre-built prompt + per-call config so each
 * generator owns its own prompt template without re-implementing the
 * pipeline.
 *
 *   const tracks = await geminiToSpotifyTracks({
 *     prompt,              // already-rendered Gemini prompt string
 *     spotifyAccessToken,
 *     targetTracks?: 30,
 *     candidateCount?: 40, // how many to ask Gemini for (we trim later)
 *     excludeUris?: [],    // already-played URIs — filtered out post-Spotify
 *   })
 *
 * Pipeline:
 *   1. Gemini in JSON mode → array of { title, artist }.
 *   2. Spotify Web API `searchTracks` per candidate, sequentially with a
 *      120ms gap (the same throttle generateStationTracks tuned to).
 *   3. Dedupe by URI, drop any URI in `excludeUris`, trim to targetTracks.
 *
 * Failure modes:
 *   - Gemini returns garbage JSON → log + return [].
 *   - Spotify 429 across the batch → throw { status: 429, message }.
 *   - Sub-target after dedupe → return what we have (caller decides if
 *     that's playable).
 */
const { GoogleGenAI } = require("@google/genai")
const SpotifyWebApi = require("spotify-web-api-node")

const DEFAULT_TARGET_TRACKS = 30
const DEFAULT_CANDIDATE_COUNT = 40
const SPOTIFY_THROTTLE_MS = 120

let aiClient
function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY env var is required to generate session tracks")
    }
    aiClient = new GoogleGenAI({ apiKey })
  }
  return aiClient
}

async function askGemini(prompt) {
  const ai = getClient()
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-3.1-flash-lite"
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.9,
    },
  })
  return parseCandidates(res?.text ?? "")
}

function parseCandidates(text) {
  if (!text) return []
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/```$/i, "")
    .trim()
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    console.warn("Gemini session response not valid JSON; got:", trimmed.slice(0, 200))
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

const RATE_LIMITED = Symbol("spotify_rate_limited")

async function resolveOnSpotify(api, candidate, { onRateLimit } = {}) {
  const q = `${candidate.title} ${candidate.artist}`
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

async function geminiToSpotifyTracks({
  prompt,
  spotifyAccessToken,
  targetTracks = DEFAULT_TARGET_TRACKS,
  excludeUris = [],
}) {
  if (!prompt) throw new Error("geminiToSpotifyTracks: prompt is required")
  if (!spotifyAccessToken) {
    throw new Error("geminiToSpotifyTracks: spotifyAccessToken is required")
  }

  const candidates = await askGemini(prompt)
  if (candidates.length === 0) return []

  const api = new SpotifyWebApi()
  api.setAccessToken(spotifyAccessToken)

  let rateLimited = false
  const resolved = []
  for (let i = 0; i < candidates.length; i++) {
    const track = await resolveOnSpotify(api, candidates[i], {
      onRateLimit: () => {
        rateLimited = true
      },
    })
    if (track === RATE_LIMITED) {
      const err = new Error(
        "Spotify rate-limited the session generation. Wait a minute and try again."
      )
      err.status = 429
      throw err
    }
    resolved.push(track)
    if (i < candidates.length - 1) await sleep(SPOTIFY_THROTTLE_MS)
  }

  const excludeSet = new Set(excludeUris || [])
  const seen = new Set()
  const out = []
  for (const track of resolved) {
    if (!track?.uri) continue
    if (excludeSet.has(track.uri)) continue
    if (seen.has(track.uri)) continue
    seen.add(track.uri)
    out.push(track)
    if (out.length >= targetTracks) break
  }

  if (rateLimited && out.length < targetTracks / 2) {
    const err = new Error(
      "Spotify rate-limited the session generation. Wait a minute and try again."
    )
    err.status = 429
    throw err
  }

  return out
}

module.exports = {
  geminiToSpotifyTracks,
  DEFAULT_TARGET_TRACKS,
  DEFAULT_CANDIDATE_COUNT,
}
