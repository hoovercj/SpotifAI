#!/usr/bin/env node
/**
 * Bake AI-station cover-art PNGs from `server/services/aiStations/catalog.js`
 * via Gemini's image-preview model.
 *
 * Built as a sibling to `scripts/seed-dj-avatars.js` — same Gemini
 * client, same response-parsing path, same flag conventions, same
 * "human in the loop" expectations. The only differences:
 *
 *   - Input is the station catalog (not the persona roster). Each
 *     output PNG is keyed by `<genreId>-<stationId>.png` so the
 *     server-side cover resolver can find it on disk via a single
 *     `fs.existsSync` lookup.
 *
 *   - The prompt blends the station's curatorial intent (genre +
 *     station name + the Gemini-curator prompt itself — which is
 *     dense with artist names) with the assigned DJ's `scene` (so the
 *     cover feels of a piece with the DJ's portrait). The result is
 *     intended to read as an album cover rather than a portrait —
 *     atmospheric, genre-coded, no faces required.
 *
 *   - Output dir is `public/images/stations/`. Not committed to git
 *     by default (covers are large + paid to regenerate), so each
 *     environment bakes its own subset. Today the prod set is small
 *     (~2 covers) and the rest of the catalog falls back to DJ
 *     portraits via `server/services/aiStations/resolveStationCover.js`.
 *
 * Idempotent by default: existing PNGs are skipped. Use `--force` to
 * re-bake. Use `--only` to bake a specific subset; the script will
 * not bake the entire ~200-station catalog without an explicit
 * `--all` flag because that's a meaningful spend.
 *
 * Cost (Gemini image-preview): ~1 image-gen per station. Today's
 * defaults bake 2 stations on demand. The catalog has ~200 stations
 * total — if/when we want to bake the whole catalog, run with
 * `--all --force` and bring a coffee.
 *
 * Usage:
 *   npm run seed:station-covers -- --list
 *       Print every station's slug + bake status, exit.
 *   npm run seed:station-covers -- --only rock/70s-legends,electronic/synthwave
 *       Bake (or skip if already baked) just the listed stations.
 *   npm run seed:station-covers -- --only rock/70s-legends --force
 *       Re-bake one station even if its PNG already exists.
 *   npm run seed:station-covers -- --all
 *       Bake every missing cover in the catalog. (Skips existing.)
 *   npm run seed:station-covers -- --all --force
 *       Re-bake the entire catalog. Expensive — confirm before running.
 *   npm run seed:station-covers -- --only rock/70s-legends --dry-run
 *       Print the prompt that would be sent; no API calls.
 *   npm run seed:station-covers -- --all --from-designs
 *       Use the research-driven prompts at
 *       `.tmp/station-cover-design/_all-prompts.json` (produced by
 *       `npm run design:station-covers`) instead of the in-script
 *       "house style" prompt builder. The design pipeline produces
 *       per-station prompt + negativePrompt + styleSeed cues that
 *       differentiate sibling stations by era / region / aesthetic.
 *   npm run seed:station-covers -- --only kpop/k-drama --from-designs --designs-file path/to/_all-prompts.json
 *       Same, but read prompts from an alternate designs file.
 *
 * Requires GOOGLE_API_KEY in env (loaded from .env via dotenv).
 *
 * The image-gen model is configured via env (defaults shown):
 *   GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
 */
'use strict'

require('dotenv').config()

const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')
const { GoogleGenAI } = require('@google/genai')
const { CATALOG } = require('../server/services/aiStations/catalog')
const { loadPersonaMetadata } = require('../server/services/utl/loadPersonas')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'images', 'stations')
const DEFAULT_DESIGNS_FILE = path.join(
  PROJECT_ROOT,
  '.tmp',
  'station-cover-design',
  '_all-prompts.json'
)

// ─── ANSI helpers ──────────────────────────────────────────────────────────
const useColor = process.stdout.isTTY
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const green = c('32')
const red = c('31')
const yellow = c('33')
const dim = c('2')
const bold = c('1')

// ─── Gemini client (lazy) ─────────────────────────────────────────────────
let aiClient
function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY env var is required for the station-cover bake script'
      )
    }
    aiClient = new GoogleGenAI({ apiKey })
  }
  return aiClient
}

// ─── Catalog flattening ───────────────────────────────────────────────────
//
// `CATALOG` is a nested `{ [genre]: { name, stations: [{id, name, djId, prompt}] } }`
// shape. The bake script wants a flat list of work items, each with
// everything needed to build a prompt + decide where to write the PNG.
function flattenCatalog() {
  const rows = []
  for (const [genreId, genre] of Object.entries(CATALOG)) {
    for (const station of genre.stations || []) {
      rows.push({
        genreId,
        genreName: genre.name,
        stationId: station.id,
        stationName: station.name,
        djId: station.djId,
        curatorPrompt: station.prompt,
        filename: `${genreId}-${station.id}.png`,
      })
    }
  }
  return rows
}

// ─── Persona lookup ───────────────────────────────────────────────────────
let personaById = null
function getPersonaById(djId) {
  if (!personaById) {
    personaById = new Map()
    for (const meta of loadPersonaMetadata()) {
      personaById.set(meta.id, meta)
    }
  }
  return personaById.get(djId)
}

// ─── Prompt construction ──────────────────────────────────────────────────
//
// Every cover uses the same "house style" wrapper so the catalog
// reads as a coherent set when browsed side-by-side. The variable
// content is genre name + station name + a condensed curatorial
// description, plus the DJ's broadcast scene so the cover ties back
// visually to the host's portrait.
//
// We intentionally do NOT include the DJ's appearance — covers are
// for the *show*, not the person. Including appearance tended to
// drag the model toward another portrait. The scene line gives just
// enough environmental cue (a club, a studio, a chapel) to anchor
// the visual.
// ─── Prompt construction ──────────────────────────────────────────────────
//
// House style: documentary / editorial *photography*, not illustration.
//
// We mimic Spotify's editorial-playlist cover convention — one strong,
// iconic, real-world subject per cover. Think: a movie marquee for an
// "Iconic Soundtracks" playlist, or a sweaty arena crowd for "Stadium
// Rock", or a vinyl record mid-spin on a turntable for "70s Legends".
// Photographed, not painted; concrete, not abstract.
//
// The biggest lesson from the first round of bakes was: when the
// prompt only describes a *mood*, the model converges on the same
// painterly-illustration template across every station in a genre and
// the covers all look interchangeable. To fight that, this version:
//
//   1. Picks a clear subject *category* from a list (gear, venue,
//      performer silhouette, era artifact, fashion detail, crowd,
//      backstage scene, recording booth, vintage signage), and tells
//      the model to choose ONE that no other station in the catalog
//      would obviously pick.
//   2. Specifies a photographic style — natural light, 50mm-ish lens,
//      film grain — instead of "painterly illustration".
//   3. Forbids generic atmospheric output: no abstract waves of
//      light, no generic-genre mood paintings, no DJ-portrait
//      framings (those belong on the DJ cards, not the station ones).
//
// We still pass the station's curatorial prompt as inspiration — the
// artist names + era cues encode a ton of visual vocabulary the
// model can mine for outfits, venues, and gear of the right period.
// And we still pass the DJ scene as an *optional* atmospheric cue,
// not as the subject.
function buildCoverPrompt(row) {
  const persona = getPersonaById(row.djId)
  const sceneLine = persona?.scene
    ? `Optional atmospheric inspiration (do NOT depict the DJ themselves; just borrow lighting/mood cues if helpful): ${persona.scene}`
    : ''
  const palette = (row.curatorPrompt || '').trim()
  return [
    `Editorial cover photograph for a music streaming playlist called "${row.stationName}", in the ${row.genreName.toLowerCase()} genre.`,
    '',
    'STYLE: Documentary or editorial photography. Real-world, photographic, naturally lit (or stage-lit when appropriate). Think Spotify editorial playlist covers, music-magazine spreads, concert photography, or curated stock photography. Square 1:1 framing. Shallow depth of field is welcome. Film grain and warm color grading are welcome.',
    '',
    'NOT ALLOWED: painterly illustration, digital painting, abstract artwork, watercolor, vector art, generic gradient backgrounds, decorative mood-art, or any DJ-style portrait of a person facing the camera (DJ portraits live elsewhere). No on-image text, logos, captions, song titles, artist names, or watermarks.',
    '',
    'COMPOSITION RULE: pick ONE strong, concrete subject that visually says "this specific playlist". Examples of subject categories — pick whichever fits, and aim for something a SISTER station in the same genre would NOT obviously pick:',
    '  • A piece of gear closeup (a specific guitar pedal, a 1970s tube amp, a vintage drum machine, a turntable mid-spin, a tape reel, a microphone in a smoky room).',
    '  • A venue interior (an empty arena from the stage, a sticky basement DIY club, a smoky jazz cellar, a stadium crowd at golden hour, a marquee with the lights on at dusk).',
    '  • A performer silhouette or candid (a guitarist mid-jump from behind, a hand on a fretboard, a drummer in motion, a singer at a mic stand — never a clear face).',
    '  • An era artifact (a stack of 7" singles, a cassette walkman with the headphones tangled, a beat-up touring case covered in stickers, a setlist taped to a monitor wedge, a polaroid on a bedroom mirror).',
    '  • A fashion detail (a worn leather jacket on a hanger, custom cowboy boots, a hand wearing a stack of beaded festival wristbands, sequined stage clothes on a rack).',
    '  • A street or location scene (a Nashville honky-tonk neon sign, a Berlin warehouse door, an LA palm-tree backstage shot, a Detroit recording-studio control room).',
    '',
    'The subject should be specifically appropriate to the era + region + scene that defines this playlist. Choose details that would be different for a "current hits" station vs. a "70s classics" station even within the same genre.',
    '',
    'Curatorial intent for this playlist (read as inspiration for era, instrumentation, and visual vocabulary — do NOT render the text or list the artists in the image):',
    palette,
    '',
    sceneLine,
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── Design-driven prompt construction ───────────────────────────────────
//
// When the bake script is invoked with `--from-designs`, we skip the
// hand-built house-style prompt above and assemble the image prompt
// from the 3-stage research pipeline at
// `.tmp/station-cover-design/_all-prompts.json`. Each design entry
// already encodes subject, aesthetic, palette, composition, and a
// full self-contained image-model paragraph; we just need to fold
// the negativePrompt + styleSeed cues into one text part since
// Gemini's image model only accepts a single text input.
let designsCache = null
function loadDesigns(designsFile) {
  if (designsCache && designsCache.file === designsFile) return designsCache.map
  if (!fs.existsSync(designsFile)) {
    throw new Error(
      `--from-designs requires a designs file at ${designsFile}. ` +
        `Run \`npm run design:station-covers -- --all\` first, or pass --designs-file <path>.`
    )
  }
  const raw = JSON.parse(fs.readFileSync(designsFile, 'utf8'))
  const map = new Map()
  for (const [key, entry] of Object.entries(raw)) {
    // Key shape from the design pipeline is `"<genreId>/<stationId>"`
    // — same shape we use everywhere else in the bake script.
    map.set(key, entry)
  }
  designsCache = { file: designsFile, map }
  return map
}

function buildCoverPromptFromDesign(row, design) {
  const p = design?.prompt || {}
  const concept = design?.concept || {}
  const body = (p.prompt || '').trim()
  if (!body) {
    throw new Error(
      `design for ${row.genreId}/${row.stationId} has no prompt body — re-run design pipeline`
    )
  }
  const styleSeed = (p.styleSeed || '').trim()
  const negative = (p.negativePrompt || '').trim()
  const subject = (concept.subject || '').trim()
  const palette = Array.isArray(concept.paletteHint)
    ? concept.paletteHint.join(', ')
    : String(concept.paletteHint || '').trim()
  const lines = [
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
  return lines.filter(Boolean).join('\n')
}

// ─── Image generation ──────────────────────────────────────────────────────
//
// Identical response-parsing to seed-dj-avatars.js — the model
// sometimes prefixes a safety-preamble text part before the image
// part, so we scan parts[] for the first entry carrying inlineData.
async function generateCover({ row, outputPath }) {
  const ai = getClient()
  const model =
    process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'
  const prompt = row.design
    ? buildCoverPromptFromDesign(row, row.design)
    : buildCoverPrompt(row)

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['IMAGE'],
    },
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

  const pngBytes = Buffer.from(imagePart.inlineData.data, 'base64')
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.promises.writeFile(outputPath, pngBytes)
  return { bytes: pngBytes.length, prompt }
}

// ─── CLI ──────────────────────────────────────────────────────────────────
function parseFlags() {
  const { values } = parseArgs({
    options: {
      force: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      only: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      list: { type: 'boolean', default: false },
      'from-designs': { type: 'boolean', default: false },
      'designs-file': { type: 'string' },
    },
    strict: true,
  })
  return values
}

function isBaked(row) {
  return fs.existsSync(path.join(OUTPUT_DIR, row.filename))
}

function printList(rows) {
  console.log(bold('AI-station cover bake status'))
  console.log(dim(`output: ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}`))
  console.log('')
  let last = null
  for (const r of rows) {
    if (r.genreId !== last) {
      console.log(bold(`\n${r.genreName} (${r.genreId})`))
      last = r.genreId
    }
    const status = isBaked(r) ? green('baked') : yellow('missing')
    console.log(
      `  ${r.stationId.padEnd(22)} ${r.stationName.padEnd(28)} ${status}  ${dim(r.filename)}`
    )
  }
}

function selectQueue(rows, flags) {
  if (flags.only) {
    const want = new Set(
      flags.only.split(',').map((s) => s.trim()).filter(Boolean)
    )
    const matched = rows.filter((r) =>
      want.has(`${r.genreId}/${r.stationId}`)
    )
    const matchedKeys = new Set(matched.map((r) => `${r.genreId}/${r.stationId}`))
    const missing = [...want].filter((k) => !matchedKeys.has(k))
    if (missing.length) {
      throw new Error(
        `Unknown station(s): ${missing.join(', ')}. Use --list to see valid genre/station ids.`
      )
    }
    return matched
  }
  if (flags.all) {
    return rows
  }
  throw new Error(
    'Refusing to bake every cover by default — pass --only <genre/station>,... or --all'
  )
}

async function main() {
  const flags = parseFlags()
  const rows = flattenCatalog()

  if (flags.list) {
    printList(rows)
    return 0
  }

  // When --from-designs is set, attach the design entry to each row
  // so generateCover() can dispatch to the design-driven prompt
  // builder. We do this *before* selectQueue so we can fail fast
  // (with a clear list of missing designs) instead of mid-bake.
  let designsMap = null
  if (flags['from-designs']) {
    const designsFile = flags['designs-file'] || DEFAULT_DESIGNS_FILE
    designsMap = loadDesigns(designsFile)
    const missing = []
    for (const r of rows) {
      const key = `${r.genreId}/${r.stationId}`
      const design = designsMap.get(key)
      if (design) r.design = design
      else missing.push(key)
    }
    console.log(
      dim(
        `--from-designs: loaded ${designsMap.size} design(s) from ` +
          `${path.relative(PROJECT_ROOT, designsFile)}` +
          (missing.length ? ` — ${missing.length} station(s) without designs will be skipped` : '')
      )
    )
  }

  let queue = selectQueue(rows, flags)
  if (flags['from-designs']) {
    queue = queue.filter((r) => r.design)
  }
  if (!flags.force) {
    queue = queue.filter((r) => !isBaked(r))
  }

  console.log(bold(`Station-cover bake plan`))
  console.log(
    dim(
      `${queue.length} of ${rows.length} station(s) selected ` +
        `(force=${flags.force}, all=${flags.all}, only=${flags.only || '*'}, dry-run=${flags['dry-run']})`
    )
  )
  console.log('')
  if (queue.length === 0) {
    console.log(
      green('Nothing to do — every selected station already has a PNG.')
    )
    return 0
  }

  let failures = 0
  for (let i = 0; i < queue.length; i += 1) {
    const r = queue[i]
    const outputPath = path.join(OUTPUT_DIR, r.filename)
    const tag = `[${i + 1}/${queue.length}]`
    console.log(
      `${tag} ${bold(r.stationName)} ${dim(`(${r.genreId}/${r.stationId})`)}`
    )
    if (flags['dry-run']) {
      console.log(
        dim(`  would write → ${path.relative(PROJECT_ROOT, outputPath)}`)
      )
      console.log(dim('  prompt:'))
      const prompt = r.design
        ? buildCoverPromptFromDesign(r, r.design)
        : buildCoverPrompt(r)
      console.log(
        prompt
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')
      )
      console.log('')
      continue
    }
    const t0 = Date.now()
    try {
      const { bytes } = await generateCover({ row: r, outputPath })
      const ms = Date.now() - t0
      console.log(
        green(
          `  ✓ ${(bytes / 1024).toFixed(1)} KB ` +
            `→ ${path.relative(PROJECT_ROOT, outputPath)} ` +
            `(${(ms / 1000).toFixed(1)}s)`
        )
      )
    } catch (err) {
      failures += 1
      console.error(red(`  ✗ ${err?.message || err}`))
    }
  }

  console.log('')
  if (failures === 0) {
    console.log(green(`All ${queue.length} cover(s) baked successfully.`))
    return 0
  }
  console.log(
    red(`${failures} of ${queue.length} cover(s) failed. Re-run to retry.`)
  )
  return failures
}

main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error(red(`bake failed: ${err?.stack || err}`))
    process.exit(1)
  })
