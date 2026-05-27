/**
 * LLM-based DJ picker. Given seed metadata (genre tags, playlist name,
 * artist name, etc.) and the full DJ roster, ask Gemini to pick the
 * best-fit host as a JSON `{ djId, reason }` response.
 *
 * This sits between the catalog/mood pin (which never needs an LLM —
 * it's just a table lookup) and the regex fallback in
 * `resolveSessionDj.js`. Callers should use it for free-form seeds
 * (tracks, artists, playlists) where a hand-tuned mapping would be
 * impossibly long.
 *
 * Failure modes are non-fatal: any throw or invalid response returns
 * `null` and the caller is expected to fall back to its own default
 * (HOUSE_DJ_ID). We log warnings but never block playback on this.
 */
'use strict'

const { GoogleGenAI } = require('@google/genai')
const { loadPersonaMetadata } = require('../utl/loadPersonas')

let aiClient
function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      // Don't throw — picker is non-essential. Caller falls back.
      return null
    }
    aiClient = new GoogleGenAI({ apiKey })
  }
  return aiClient
}

// Build a compact DJ catalog string for the prompt. We strip the heavy
// markdown sections (appearance, scene, ttsDirection) — those are for
// presentation, not selection. The LLM only needs slug, id, name, genre
// tags, and a one-paragraph style sentence to pick well.
function summarizePersonas(personas) {
  return personas.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.djName,
    genres: p.genres || [],
    style: p.djStyle?.split('\n')[0]?.slice(0, 240) || '',
  }))
}

function buildPrompt({ seed, candidates }) {
  const seedSummary = {
    type: seed.type,
    name: seed.name || null,
    artists: seed.artists || null,
    genres: seed.genres || null,
    extra: seed.extra || null,
  }
  return `You are routing a music-listening session to the best-fit DJ
host from a fixed roster. Read the SEED (what the listener picked) and
the DJ ROSTER (every available host), then pick the single DJ whose
genres + on-air style fit the seed most naturally.

Rules:
- Choose exactly ONE DJ from the roster by id.
- Prefer a DJ whose "genres" array overlaps the seed's genre tags.
- If multiple DJs match the genres, prefer the one whose style sentence
  best matches the listener's likely vibe (e.g. workout → high-energy host,
  late-night chill → atmospheric host, throwback → historian-of-the-era).
- Geographic / cultural authenticity is a tiebreaker (a Lagos DJ for
  Afrobeats, a Nashville DJ for country, a Tokyo DJ for anime).
- Never invent a DJ — only return an id that appears in the roster.

Respond with valid JSON only, in this exact shape (no commentary,
no markdown fences):

{"djId": <integer>, "reason": "<one short sentence>"}

SEED:
${JSON.stringify(seedSummary, null, 2)}

DJ ROSTER:
${JSON.stringify(candidates, null, 2)}
`
}

function parsePick(text, validIds) {
  if (!text) return null
  const trimmed = String(text)
    .trim()
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/```$/i, '')
    .trim()
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    console.warn('pickDjWithLlm: response not valid JSON:', trimmed.slice(0, 200))
    return null
  }
  const djId = Number(parsed?.djId)
  if (!Number.isInteger(djId) || !validIds.has(djId)) {
    console.warn(
      `pickDjWithLlm: picked djId=${parsed?.djId} not in roster (valid ids: ${[...validIds].join(',')})`
    )
    return null
  }
  return { djId, reason: String(parsed?.reason || '').slice(0, 240) }
}

/**
 * Pick a DJ for an open-ended seed. Returns `{ djId, reason }` on
 * success or `null` on any failure path.
 *
 * @param {object} args
 * @param {object} args.seed - { type, name, artists, genres, extra }
 *   - type: 'track' | 'artist' | 'playlist' | 'mood' | 'station' | ...
 *   - name: human-readable label (track title, playlist name, ...)
 *   - artists: array of artist-name strings (for tracks/artists)
 *   - genres: array of genre tag strings (from Spotify or seed metadata)
 *   - extra: any free-form notes the caller wants the model to see
 * @param {number[]} [args.restrictToIds] - Optional whitelist of DJ ids.
 *   If supplied, the prompt only shows those DJs (used to constrain to
 *   genre-eligible hosts).
 */
async function pickDjWithLlm({ seed, restrictToIds }) {
  const ai = getClient()
  if (!ai) return null

  let personas
  try {
    personas = loadPersonaMetadata()
  } catch (err) {
    console.warn('pickDjWithLlm: failed to load personas:', err?.message || err)
    return null
  }

  let pool = personas
  if (Array.isArray(restrictToIds) && restrictToIds.length > 0) {
    const allow = new Set(restrictToIds)
    pool = personas.filter((p) => allow.has(p.id))
  }
  if (pool.length === 0) return null

  const candidates = summarizePersonas(pool)
  const validIds = new Set(candidates.map((c) => c.id))
  const prompt = buildPrompt({ seed, candidates })

  try {
    const model = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite'
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    })
    return parsePick(res?.text ?? '', validIds)
  } catch (err) {
    console.warn('pickDjWithLlm: Gemini call failed:', err?.message || err)
    return null
  }
}

module.exports = { pickDjWithLlm }
