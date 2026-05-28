/**
 * Cover-review service — state management + variant regeneration for
 * the human approve/tweak/reject UI mounted at
 * `/api/dev/review-covers`.
 *
 * Data model:
 *   .tmp/station-cover-design/
 *     _all-prompts.json                # Stage 1–3 design outputs (immutable input)
 *     _decisions.json                  # Mutable decision log (this module owns it)
 *     <genre>/<station>/v1.png         # Variant images
 *     <genre>/<station>/v2.png
 *     ...
 *   public/images/stations/<genre>-<station>.png  # Always the *active* variant
 *
 * `_decisions.json` shape:
 *   {
 *     "kpop/k-drama": {
 *       "activeVariant": 2,
 *       "lastDecisionAt": "2026-05-27T..",
 *       "variants": [
 *         { n: 1, regenType: "initial", concept, prompt,
 *           feedback: null, decision: "rejected", decidedAt: "..." },
 *         { n: 2, regenType: "reject",  concept, prompt,
 *           feedback: "less cliché",  decision: null, decidedAt: null }
 *       ]
 *     }
 *   }
 *
 * Variant decisions are per-variant ("approved", "tweaked", "rejected",
 * or null=pending). The station's effective status is derived: the
 * decision on `activeVariant` is what the UI surfaces.
 *
 * Regeneration:
 *   - reject(direction?)  → new concept (forbids prior focus+aesthetic
 *                            pairs from this station's variants), new
 *                            prompt, new image. Old variant marked
 *                            "rejected". New variant becomes active.
 *   - tweak(feedback)     → keep concept, generate new prompt with
 *                            feedback injected, new image. Old variant
 *                            marked "tweaked". New variant becomes
 *                            active. Feedback is required.
 *   - approve             → active variant marked "approved". No regen.
 *
 * setActive(n) — promote any prior variant back to active without
 * regenerating. Useful for "I changed my mind, V1 was better".
 */
'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const { GoogleGenAI } = require('@google/genai')
const { CATALOG } = require('../aiStations/catalog')

// ─── Paths ────────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')
const DESIGN_DIR = path.join(PROJECT_ROOT, '.tmp', 'station-cover-design')
const DESIGNS_FILE = path.join(DESIGN_DIR, '_all-prompts.json')
const DECISIONS_FILE = path.join(DESIGN_DIR, '_decisions.json')
const PUBLIC_STATIONS_DIR = path.join(
  PROJECT_ROOT,
  'public',
  'images',
  'stations'
)

function variantDir(genreId, stationId) {
  return path.join(DESIGN_DIR, genreId, stationId)
}
function variantImagePath(genreId, stationId, n) {
  return path.join(variantDir(genreId, stationId), `v${n}.png`)
}
function publicImagePath(genreId, stationId) {
  return path.join(PUBLIC_STATIONS_DIR, `${genreId}-${stationId}.png`)
}

// ─── Gemini client (lazy) ────────────────────────────────────────────────
let aiClient = null
function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY env var is required for cover-review regeneration'
      )
    }
    aiClient = new GoogleGenAI({ apiKey })
  }
  return aiClient
}

// ─── System prompts for single-station regeneration ───────────────────────
//
// These are deliberately *shorter* than the batch prompts in
// scripts/design-station-covers.js because regen operates on ONE
// station at a time, so we don't need the "no two stations share..."
// cross-station constraints. We do still pass siblings as read-only
// context so the rationale field can name-check them.
const REGEN_CONCEPT_SYSTEM = `You are an art director picking the visual
treatment for ONE music-streaming station cover. You will receive
the music-historian research for this station, plus a list of
forbidden (imageryFocus, aesthetic) combinations already tried for
this station, plus optional user direction for where to take the
new variant.

Produce a single JSON object (NOT an array, NOT keyed by stationId
— just the object) with these fields:

  - imageryFocus: one of:
      instrument, venue, fashion, artifact, atmosphere,
      cultural-symbol, landscape, typographic, ephemera,
      portrait-silhouette, abstract-pattern, food-or-drink
  - aesthetic: one of:
      photoreal-editorial, photoreal-documentary, film-still,
      retro-illustration, poster-art, painterly, vintage-photograph,
      polaroid, screen-print, risograph, watercolor, ink-wash,
      collage, isometric-3d, anime-cel, manga-bw, woodblock,
      minimal-graphic, art-deco, art-nouveau, brutalist-design,
      Y2K-chrome, vaporwave, glitch-art
  - composition: one of:
      extreme-closeup, closeup, medium-shot, wide-environment,
      flat-lay, bird-eye, low-angle, dutch-angle, symmetrical,
      asymmetrical-rule-of-thirds, centered-portrait, diptych
  - paletteHint: 4–7 specific color swatch descriptors
    (e.g. "warm cream, dusty terracotta, deep oxblood, smoke grey").
  - subject: 1 short noun phrase naming the literal subject.
  - rationale: 1–3 sentences. Why this combination fits the
    research, AND if user direction was provided, how this answers
    the direction.

HARD CONSTRAINTS:
  1. The (imageryFocus, aesthetic) pair MUST NOT match any of the
     forbidden pairs. Pick a genuinely different visual direction.
  2. If user direction is provided, honor it — change focus,
     aesthetic, subject, palette, or composition accordingly.
  3. Prefer photoreal for real-world scenes; illustrated for
     animated/anime/game OSTs; painterly/woodblock for pre-1960;
     Y2K-chrome/vaporwave for late-90s—mid-2000s.

OUTPUT: a single JSON object. No prose. No markdown fences.`

const REGEN_PROMPT_SYSTEM = `You are an image-prompt engineer writing
ONE production-ready prompt for an image model (Gemini Imagen / Flash
Image) for ONE music-streaming station cover. You will receive
research + concept + (optionally) user feedback for tuning.

Produce a single JSON object (NOT an array, NOT keyed by stationId)
with these fields:

  - prompt: a SINGLE paragraph of 90–160 words. Open with the
    subject in concrete visual terms, then describe composition,
    lighting, materials, color palette, and atmosphere. The prompt
    must be self-contained.
  - negativePrompt: short comma-separated list. Always include
    "text, watermarks, logos, celebrity faces, band names, real
    album covers, AI artifacts, distorted hands".
  - styleSeed: 6–10 comma-separated style anchors.
  - sourceElements: array of 3–5 strings naming which research/
    concept items you drew from.
  - aspectRatio: "1:1".

HARD CONSTRAINTS:
  - NEVER name real living people, real bands, or real albums.
  - NEVER reference copyrighted mascots/characters.
  - Photoreal aesthetics must specify camera/film/lens cues.
  - Illustrative aesthetics must specify medium + era + 1–2
    reference artists or art movements.
  - If user feedback is provided, the prompt MUST visibly
    incorporate the change while preserving the concept's subject,
    aesthetic, and composition.

OUTPUT: a single JSON object. No prose. No markdown fences.`

// ─── Gemini helpers ───────────────────────────────────────────────────────
//
// `extractFirstJsonObject` is tolerant of three quirks the text model
// occasionally exhibits despite the system prompt asking for a single
// JSON object:
//   1. wrapping the JSON in ```json ... ``` markdown fences,
//   2. emitting two objects concatenated (`{...}\n{...}`),
//   3. keying the result by stationId despite being asked not to,
//      e.g. `{"70s-legends": {...}}` instead of `{...}`.
// It walks brace depth (string-literal aware) to slice out the first
// complete JSON value, parses it, and unwraps a single-key stationId
// envelope when the expected field is missing at the top level.
function extractFirstJsonObject(rawText, expectedField) {
  let text = String(rawText || '').trim()
  // Strip markdown fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) text = fenced[1].trim()

  const start = text.search(/[{[]/)
  if (start === -1) throw new Error('no JSON object found in response')

  let depth = 0
  let inString = false
  let escape = false
  let end = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) throw new Error('unterminated JSON object in response')
  const slice = text.slice(start, end + 1)
  const parsed = JSON.parse(slice)

  // Unwrap `{ "<stationId>": {...} }` envelopes when the expected field
  // is missing at the top level but present one level down.
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    expectedField &&
    !(expectedField in parsed)
  ) {
    const keys = Object.keys(parsed)
    if (keys.length === 1) {
      const inner = parsed[keys[0]]
      if (inner && typeof inner === 'object' && expectedField in inner) {
        return inner
      }
    }
  }
  return parsed
}

async function callGeminiText({
  systemInstruction,
  userPrompt,
  temperature,
  expectedField,
}) {
  const ai = getClient()
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite'
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: temperature ?? 0.8,
    },
  })
  const text =
    response?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join('') || ''
  try {
    return extractFirstJsonObject(text, expectedField)
  } catch (err) {
    throw new Error(
      `regen LLM returned invalid JSON: ${err.message}\n---\n${text.slice(0, 800)}`
    )
  }
}

async function callGeminiImage({ prompt }) {
  const ai = getClient()
  const model =
    process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseModalities: ['IMAGE'] },
  })
  const parts = response?.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find((p) => p?.inlineData?.data)
  if (!imagePart) {
    const textParts = parts
      .filter((p) => p?.text)
      .map((p) => p.text.trim())
      .join(' | ')
    throw new Error(
      `Gemini image model returned no inlineData payload` +
        (textParts ? ` (model text: ${textParts.slice(0, 200)})` : '')
    )
  }
  return Buffer.from(imagePart.inlineData.data, 'base64')
}

// ─── Designs (read-only input) ────────────────────────────────────────────
let designsCache = null
function loadDesigns() {
  if (designsCache) return designsCache
  if (!fs.existsSync(DESIGNS_FILE)) {
    throw new Error(
      `designs file not found at ${DESIGNS_FILE} — run ` +
        '`npm run design:station-covers -- --all` first.'
    )
  }
  designsCache = JSON.parse(fs.readFileSync(DESIGNS_FILE, 'utf8'))
  return designsCache
}

// ─── Decisions state (read/write) ─────────────────────────────────────────
function loadDecisions() {
  if (!fs.existsSync(DECISIONS_FILE)) return {}
  return JSON.parse(fs.readFileSync(DECISIONS_FILE, 'utf8'))
}

async function saveDecisions(decisions) {
  await fsp.mkdir(DESIGN_DIR, { recursive: true })
  const tmp = DECISIONS_FILE + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify(decisions, null, 2))
  await fsp.rename(tmp, DECISIONS_FILE)
}

// ─── Initialization (bootstrap from the existing v1 bake) ────────────────
//
// Idempotent: every station whose public PNG exists gets a v1 entry
// if it doesn't already. Variants directory is populated by copying
// the public PNG into v1.png. Designs JSON supplies the concept +
// prompt snapshot. Stations whose public PNG is missing are skipped.
async function initializeFromBakes() {
  const designs = loadDesigns()
  const decisions = loadDecisions()
  const now = new Date().toISOString()
  let created = 0
  let reconciled = 0
  for (const [key, entry] of Object.entries(designs)) {
    const { genreId, stationId } = entry
    if (!decisions[key]) {
      const publicPath = publicImagePath(genreId, stationId)
      if (!fs.existsSync(publicPath)) continue
      const vdir = variantDir(genreId, stationId)
      await fsp.mkdir(vdir, { recursive: true })
      const v1Path = variantImagePath(genreId, stationId, 1)
      if (!fs.existsSync(v1Path)) {
        await fsp.copyFile(publicPath, v1Path)
      }
      decisions[key] = {
        activeVariant: 1,
        lastDecisionAt: null,
        variants: [
          {
            n: 1,
            regenType: 'initial',
            concept: entry.concept,
            prompt: entry.prompt,
            feedback: null,
            decision: null,
            decidedAt: null,
            createdAt: now,
          },
        ],
      }
      created += 1
      continue
    }
    // Reconcile orphan v<N>.png files that exist on disk but are missing
    // from the ledger (concurrent regens before the per-station lock
    // existed could overwrite each other's ledger entries while their
    // PNGs survived). Surface them as recoverable stubs.
    const added = await reconcileOrphanVariants(decisions, genreId, stationId)
    reconciled += added
  }
  if (created > 0 || reconciled > 0) await saveDecisions(decisions)
  return { created, reconciled, total: Object.keys(decisions).length }
}

async function reconcileOrphanVariants(decisions, genreId, stationId) {
  const key = `${genreId}/${stationId}`
  const station = decisions[key]
  if (!station) return 0
  const vdir = variantDir(genreId, stationId)
  if (!fs.existsSync(vdir)) return 0
  const onDisk = (await fsp.readdir(vdir))
    .map((f) => {
      const m = /^v(\d+)\.png$/.exec(f)
      return m ? { n: Number(m[1]), file: path.join(vdir, f) } : null
    })
    .filter(Boolean)
  const inLedger = new Set(station.variants.map((v) => v.n))
  let added = 0
  for (const { n, file } of onDisk) {
    if (inLedger.has(n)) continue
    let createdAt
    try {
      createdAt = (await fsp.stat(file)).mtime.toISOString()
    } catch {
      createdAt = new Date().toISOString()
    }
    station.variants.push({
      n,
      regenType: 'orphan',
      concept: null,
      prompt: null,
      feedback: null,
      decision: null,
      decidedAt: null,
      createdAt,
    })
    added += 1
  }
  if (added > 0) {
    station.variants.sort((a, b) => a.n - b.n)
  }
  return added
}

// ─── Helpers used by the route handler ────────────────────────────────────
function getStationDecision(decisions, genreId, stationId) {
  return decisions[`${genreId}/${stationId}`] || null
}

function getActiveVariant(stationDecision) {
  if (!stationDecision) return null
  return (
    stationDecision.variants.find((v) => v.n === stationDecision.activeVariant) ||
    null
  )
}

async function deployVariant(genreId, stationId, n) {
  const src = variantImagePath(genreId, stationId, n)
  const dst = publicImagePath(genreId, stationId)
  await fsp.mkdir(path.dirname(dst), { recursive: true })
  await fsp.copyFile(src, dst)
}

// ─── Catalog helpers (for sibling context in regen prompts) ──────────────
function listSiblings(genreId, exceptStationId) {
  const genre = CATALOG[genreId]
  if (!genre) return []
  return genre.stations
    .filter((s) => s.id !== exceptStationId)
    .map((s) => ({ id: s.id, name: s.name }))
}

// ─── Per-station regen lock ──────────────────────────────────────────────
//
// Prevents racing variant writes when the user double-clicks (or the
// browser dispatches a queued click before the in-flight one resolves):
// concurrent regens for the same station would each read the same prior
// `variants` array, both compute the same `nextN`, both write to the
// same `v<N>.png`, and the second `_decisions.json` save would lose
// the first variant entry. We hold a process-local Set of in-flight
// keys and reject duplicates with a 409 so the UI can show a clear
// message instead of silently spawning extra bakes.
const inFlightRegens = new Set()

async function withRegenLock(key, fn) {
  if (inFlightRegens.has(key)) {
    const err = new Error(
      `a regen is already in progress for ${key} — wait for it to finish before starting another`
    )
    err.statusCode = 409
    throw err
  }
  inFlightRegens.add(key)
  try {
    return await fn()
  } finally {
    inFlightRegens.delete(key)
  }
}

// ─── Regeneration: reject (force-different concept + new prompt) ─────────
async function regenerateOnReject(genreId, stationId, direction) {
  return withRegenLock(`${genreId}/${stationId}`, async () => {
    return regenerateOnRejectInner(genreId, stationId, direction)
  })
}

async function regenerateOnRejectInner(genreId, stationId, direction) {
  const designs = loadDesigns()
  const key = `${genreId}/${stationId}`
  const design = designs[key]
  if (!design) throw new Error(`no design for ${key}`)
  const decisions = loadDecisions()
  const station = decisions[key]
  if (!station) throw new Error(`no decision state for ${key}`)

  const forbiddenPairs = station.variants.map((v) => ({
    imageryFocus: v.concept?.imageryFocus,
    aesthetic: v.concept?.aesthetic,
  }))
  const siblings = listSiblings(genreId, stationId)

  // Stage 2: new concept (forbidden pairs known, optional direction)
  const conceptInput = {
    station: { id: stationId, name: design.stationName },
    research: design.research,
    forbiddenPairs,
    userDirection: direction || null,
    siblings,
  }
  const concept = await callGeminiText({
    systemInstruction: REGEN_CONCEPT_SYSTEM,
    userPrompt: JSON.stringify(conceptInput),
    temperature: 0.85,
    expectedField: 'imageryFocus',
  })

  // Stage 3: prompt for the new concept (no tweak feedback at this stage —
  // direction was already baked into the concept above)
  const promptInput = {
    station: { id: stationId, name: design.stationName },
    research: design.research,
    concept,
    userFeedback: null,
  }
  const prompt = await callGeminiText({
    systemInstruction: REGEN_PROMPT_SYSTEM,
    userPrompt: JSON.stringify(promptInput),
    temperature: 0.7,
    expectedField: 'prompt',
  })

  return commitNewVariant({
    genreId,
    stationId,
    decisions,
    station,
    concept,
    prompt,
    feedback: direction || null,
    regenType: 'reject',
  })
}

// ─── Regeneration: tweak (keep concept, new prompt with feedback) ────────
async function regenerateOnTweak(genreId, stationId, feedback) {
  if (!feedback || !feedback.trim()) {
    throw new Error('tweak requires feedback text')
  }
  return withRegenLock(`${genreId}/${stationId}`, async () => {
    return regenerateOnTweakInner(genreId, stationId, feedback)
  })
}

async function regenerateOnTweakInner(genreId, stationId, feedback) {
  const designs = loadDesigns()
  const key = `${genreId}/${stationId}`
  const design = designs[key]
  if (!design) throw new Error(`no design for ${key}`)
  const decisions = loadDecisions()
  const station = decisions[key]
  if (!station) throw new Error(`no decision state for ${key}`)
  const activeVariant = getActiveVariant(station)
  if (!activeVariant) throw new Error(`no active variant for ${key}`)

  const promptInput = {
    station: { id: stationId, name: design.stationName },
    research: design.research,
    concept: activeVariant.concept,
    userFeedback: feedback.trim(),
    priorPrompt: activeVariant.prompt?.prompt || null,
  }
  const prompt = await callGeminiText({
    systemInstruction: REGEN_PROMPT_SYSTEM,
    userPrompt: JSON.stringify(promptInput),
    temperature: 0.7,
    expectedField: 'prompt',
  })

  return commitNewVariant({
    genreId,
    stationId,
    decisions,
    station,
    concept: activeVariant.concept, // unchanged
    prompt,
    feedback: feedback.trim(),
    regenType: 'tweak',
  })
}

// ─── Shared variant-commit path (bake image + write state) ───────────────
function buildImagePromptText(concept, prompt) {
  const body = (prompt?.prompt || '').trim()
  if (!body) throw new Error('prompt body missing — regen LLM returned no prompt text')
  const subject = (concept?.subject || '').trim()
  const palette = Array.isArray(concept?.paletteHint)
    ? concept.paletteHint.join(', ')
    : String(concept?.paletteHint || '').trim()
  const styleSeed = (prompt?.styleSeed || '').trim()
  const negative = (prompt?.negativePrompt || '').trim()
  return [
    body,
    '',
    subject ? `Primary subject: ${subject}.` : '',
    palette ? `Color palette: ${palette}.` : '',
    styleSeed ? `Style anchors: ${styleSeed}.` : '',
    'Square 1:1 framing.',
    negative
      ? `Avoid: ${negative}.`
      : 'Avoid: text, watermarks, logos, celebrity faces, band names, real album covers, AI artifacts, distorted hands.',
  ]
    .filter(Boolean)
    .join('\n')
}

async function commitNewVariant({
  genreId,
  stationId,
  decisions,
  station,
  concept,
  prompt,
  feedback,
  regenType,
}) {
  const now = new Date().toISOString()
  const nextN = station.variants.length
    ? Math.max(...station.variants.map((v) => v.n)) + 1
    : 1

  // Bake the image
  const imageText = buildImagePromptText(concept, prompt)
  const bytes = await callGeminiImage({ prompt: imageText })
  const vpath = variantImagePath(genreId, stationId, nextN)
  await fsp.mkdir(path.dirname(vpath), { recursive: true })
  await fsp.writeFile(vpath, bytes)

  // Mark the previously-active variant with the regen type
  const prev = getActiveVariant(station)
  if (prev && prev.decision === null) {
    prev.decision = regenType === 'tweak' ? 'tweaked' : 'rejected'
    prev.decidedAt = now
  }

  // Append the new variant + promote it
  station.variants.push({
    n: nextN,
    regenType,
    concept,
    prompt,
    feedback,
    decision: null,
    decidedAt: null,
    createdAt: now,
  })
  station.activeVariant = nextN
  station.lastDecisionAt = now

  // Deploy
  await deployVariant(genreId, stationId, nextN)
  await saveDecisions(decisions)
  return station
}

// ─── Decisions: approve / set-active ─────────────────────────────────────
async function approveActive(genreId, stationId) {
  const decisions = loadDecisions()
  const key = `${genreId}/${stationId}`
  const station = decisions[key]
  if (!station) throw new Error(`no decision state for ${key}`)
  const active = getActiveVariant(station)
  if (!active) throw new Error(`no active variant for ${key}`)
  const now = new Date().toISOString()
  // Radio-button semantics: only one variant can be `approved` at a time.
  // Demote any previously-approved variant (other than this one) to
  // `rejected` — the user has explicitly picked a different winner.
  for (const v of station.variants) {
    if (v.n !== active.n && v.decision === 'approved') {
      v.decision = 'rejected'
      v.decidedAt = now
    }
  }
  active.decision = 'approved'
  active.decidedAt = now
  station.lastDecisionAt = now
  // Make sure public/ has the active variant (in case it was rotated
  // via setActive but never re-deployed for some reason).
  await deployVariant(genreId, stationId, active.n)
  await saveDecisions(decisions)
  return station
}

async function setActiveVariant(genreId, stationId, n) {
  const decisions = loadDecisions()
  const key = `${genreId}/${stationId}`
  const station = decisions[key]
  if (!station) throw new Error(`no decision state for ${key}`)
  const target = station.variants.find((v) => v.n === n)
  if (!target) throw new Error(`variant v${n} not found for ${key}`)
  station.activeVariant = n
  await deployVariant(genreId, stationId, n)
  await saveDecisions(decisions)
  return station
}

// ─── Public API ──────────────────────────────────────────────────────────
module.exports = {
  // paths
  PROJECT_ROOT,
  DESIGN_DIR,
  variantImagePath,
  publicImagePath,
  // state
  loadDesigns,
  loadDecisions,
  saveDecisions,
  initializeFromBakes,
  getStationDecision,
  getActiveVariant,
  // mutations
  approveActive,
  regenerateOnReject,
  regenerateOnTweak,
  setActiveVariant,
}
