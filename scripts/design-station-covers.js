#!/usr/bin/env node
/**
 * 3-stage Gemini pipeline that designs cover-art image prompts for
 * every AI-station in the catalog, batched per genre so the model can
 * differentiate sibling subgenres in the same context window (the
 * critical detail the photo-discovery path was getting wrong — e.g.
 * "2nd-gen K-Pop" vs "3rd-gen K-Pop" need to feel distinct).
 *
 * The three stages are intentionally separated so a human reviewer
 * can scrutinize each one independently:
 *
 *   1. Research  — factual profile per station: era, region, vibe,
 *                  fashion, instrumentation, venues, art styles,
 *                  cultural symbols, linguistic touchstones, and an
 *                  explicit "what makes this distinct from sibling
 *                  stations" paragraph.
 *
 *   2. Concept   — given the research, pick imageryFocus + aesthetic
 *                  + composition + palette per station, with the hard
 *                  constraint that no two stations in the genre share
 *                  the same (focus, aesthetic) pair. This is what
 *                  guarantees the resulting cover grid feels varied
 *                  rather than 145 variations on "band on stage".
 *
 *   3. Prompt    — given research + concept, write a production-ready
 *                  image-model prompt with explicit subject, style,
 *                  composition, lighting, palette, plus a negative
 *                  prompt that rules out celebrity faces, real band
 *                  logos, album-cover mimicry, etc.
 *
 * Every stage's inputs, raw Gemini response, and parsed JSON are
 * written to `.tmp/station-cover-design/<genre>/` so we can audit
 * exactly what the model saw and produced. Re-runs skip stages that
 * already have JSON output unless `--force` is passed.
 *
 * Stages are idempotent and per-genre, so partial completion is
 * recoverable: a Ctrl-C mid-genre leaves the prior genres' output
 * intact and the orchestrator picks up where it left off.
 *
 * NOTE: this script DOES NOT generate any images. It only generates
 * the prompts you'd feed into an image model. A separate step (e.g.
 * the existing `scripts/seed-station-covers.js`) consumes the final
 * `_all-prompts.json` to actually bake covers to disk.
 *
 * Usage:
 *   npm run design:station-covers -- --genre kpop
 *   npm run design:station-covers -- --genre kpop --stage research
 *   npm run design:station-covers -- --all
 *   npm run design:station-covers -- --all --force
 *   npm run design:station-covers -- --list
 *
 * Requires:
 *   - GOOGLE_API_KEY (Gemini)
 */
'use strict'

require('dotenv').config()

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { parseArgs } = require('node:util')
const { GoogleGenAI } = require('@google/genai')
const { CATALOG } = require('../server/services/aiStations/catalog')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(PROJECT_ROOT, '.tmp', 'station-cover-design')
const PROMPTS_DIR = path.join(OUT_DIR, '_prompts')

// ─── ANSI helpers ─────────────────────────────────────────────────────────
const useColor = process.stdout.isTTY
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const green = c('32')
const red = c('31')
const yellow = c('33')
const cyan = c('36')
const dim = c('2')
const bold = c('1')

// ─── Gemini ───────────────────────────────────────────────────────────────
let geminiClient
function getGeminiClient() {
  if (geminiClient) return geminiClient
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GOOGLE_API_KEY is required')
  geminiClient = new GoogleGenAI({ apiKey })
  return geminiClient
}

function getModel() {
  // Research + concept design tolerate the lite model fine and it's
  // much faster across 18 genres. Override with GEMINI_TEXT_MODEL.
  return process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite'
}

async function callGemini({ systemInstruction, userPrompt, temperature }) {
  const response = await getGeminiClient().models.generateContent({
    model: getModel(),
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: temperature ?? 0.7,
    },
  })
  const text =
    response?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join('') || ''
  return text
}

function parseJson(text, context) {
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(
      `${context}: response was not valid JSON: ${err.message}\n---\n${text.slice(0, 800)}`
    )
  }
}

// ─── System prompts ───────────────────────────────────────────────────────
//
// Kept inline (not loaded from files) so the script is fully self-contained
// and version-controlled. A copy is written to .tmp/_prompts/ on every
// run so reviewers see exactly which version produced the output beside it.

const RESEARCH_SYSTEM = `You are a music historian and editorial director
writing factual, distinctive profiles for music-streaming station covers.

For EACH station in the batch, produce a JSON object with these fields.
Be specific and concrete. Avoid generic adjectives ("vibey", "iconic")
unless followed by a concrete example.

REQUIRED FIELDS PER STATION:
  - oneLineSummary: 1 sentence, no more than 25 words. The elevator pitch.
  - era: years or decade(s) the music is most associated with.
  - region: the geographic/cultural origin (city, country, scene).
  - sonicVibe: 2–4 sentences on the actual sound — production style,
    tempo, vocal delivery, characteristic chord changes or rhythms.
  - fashion: array of 3–6 concrete fashion items, materials, or
    accessories visually associated with the scene.
  - instruments: array of 3–6 instruments or gear items central to
    the genre's sound (be specific: "Fender Rhodes electric piano"
    not just "keyboard"; "808 drum machine" not "drums").
  - venues: array of 2–4 venue types or specific famous venues
    associated with the scene.
  - artStyles: array of 1–4 visual art movements, design trends,
    album-cover aesthetics, or photographic styles historically tied
    to the genre (e.g. "Hipgnosis surreal photo composites",
    "Saul Bass mid-century type", "Y2K chrome").
  - culturalSymbols: array of 3–6 non-musical objects, motifs, or
    iconography that fans or insiders would recognize (e.g. "Vans
    checkerboard slip-ons", "Doc Martens", "ankh necklaces",
    "low-rider bicycles", "lava lamps", "Marian iconography").
  - linguisticTouchstones: array of 1–4 language, slang, or
    typographic conventions associated with the scene
    (e.g. "Spanglish lyrics", "Patois inflection", "Korean
    hangul superscript", "Old-English heavy-metal logo").
  - differentiator: 2–3 sentences explicitly contrasting this
    station with its closest sibling(s) in the same batch. Reference
    them by name. This is the most important field — fill it last
    once you've drafted every station, and revise upward as needed.

CONSTRAINTS:
  - Do NOT name living artists or real bands by name, except as
    one-word genre exemplars in passing (e.g. "the sound Beyoncé
    helped define" is OK; an entire entry built on Beyoncé is not).
  - Do NOT use vague hype words. Concrete > evocative.
  - The "differentiator" must explain how a CASUAL listener could
    tell the difference between this station and its siblings.

OUTPUT: a single JSON object keyed by stationId. No prose outside
the JSON. No markdown fences.`

const CONCEPT_SYSTEM = `You are an art director picking the visual
treatment for a set of music-streaming station covers within one
genre. You will receive the music-historian research from the
previous stage as JSON.

For EACH station produce a JSON object:
  - imageryFocus: one of:
      instrument, venue, fashion, artifact, atmosphere,
      cultural-symbol, landscape, typographic, ephemera,
      portrait-silhouette, abstract-pattern, food-or-drink
    (pick the strongest hook for THIS station based on the research)
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
  - subject: 1 short noun phrase naming the literal subject
    (e.g. "vintage Telecaster headstock on velvet").
  - rationale: 2 sentences. Why this combination fits the station's
    research, AND how it differs from the sibling stations in this
    same batch (reference at least one sibling by stationId).

HARD CONSTRAINTS:
  1. No two stations in this batch may share the same
     (imageryFocus, aesthetic) pair. Vary aggressively.
  2. Cover the full menu — across the batch, use at least 4 distinct
     imageryFocus values and at least 3 distinct aesthetic values.
  3. Prefer photoreal options for stations rooted in real-world
     scenes (regional cuisine, soundsystem culture, concert
     ephemera). Prefer illustration/anime/cel-shading for stations
     about animated music (anime OSTs, game OSTs, K-drama).
     Prefer painterly/woodblock/poster-art for older eras
     (pre-1960). Use Y2K-chrome / vaporwave for late-90s—mid-2000s.
  4. Avoid stage-with-spotlights, mosh-pit, and crowd-with-phones
     compositions unless the research explicitly calls them
     foundational.

OUTPUT: single JSON object keyed by stationId. No prose. No fences.`

const PROMPT_SYSTEM = `You are an image-prompt engineer writing
production-ready prompts for an image model (Gemini Imagen / Flash
Image). You will receive research + art-direction concepts.

For EACH station produce:
  - prompt: a SINGLE paragraph of 90–160 words. Open with the
    subject in concrete visual terms, then describe composition,
    lighting, materials, color palette, and atmosphere. The prompt
    must be self-contained — the image model has no other context.
    Include the aesthetic descriptor naturally (e.g. "shot on
    medium-format film", "Saul Bass mid-century paper-cut style",
    "Studio Ghibli watercolor cel").
  - negativePrompt: short comma-separated list of things to
    suppress: always include "text, watermarks, logos, celebrity
    faces, band names, real album covers, AI artifacts, distorted
    hands" plus any genre-specific suppressions
    (e.g. "Spider-Man, Mickey Mouse" for stations with copyright
    risk around mascots).
  - styleSeed: 6–10 comma-separated style anchors that will be
    appended to the prompt by the image bake step (e.g.
    "shallow depth of field, golden hour, 35mm film grain,
    desaturated highlights, Kodak Portra 400").
  - sourceElements: array of 3–5 strings naming which
    research/concept items you drew from
    (e.g. "instrument: Roland TR-909", "venue: Berlin Berghain",
    "palette: concrete grey + neon green").
  - aspectRatio: "1:1" (cover thumbnails are square).

HARD CONSTRAINTS:
  - NEVER reference a real living person, real band name, or real
    album. Use generic descriptors instead ("a teenage girl in
    early-2010s tumblr-grunge styling" not "Lana Del Rey").
  - NEVER reference copyrighted mascots/characters (Studio Ghibli
    aesthetic is fine; "Totoro" is not. Anime art styles are fine;
    specific anime characters are not).
  - Photoreal aesthetics must specify camera/film/lens cues so the
    image model commits.
  - Illustrative aesthetics must specify medium, era, and 1–2
    famous reference artists or art movements (no specific
    copyrighted works).

OUTPUT: single JSON object keyed by stationId. No prose. No fences.`

// ─── Catalog flattening ───────────────────────────────────────────────────
function getGenres() {
  return Object.entries(CATALOG).map(([id, g]) => ({
    id,
    name: g.name,
    stations: g.stations.map((s) => ({
      id: s.id,
      name: s.name,
      curatorPrompt: s.prompt.replace(/\s+/g, ' ').trim(),
    })),
  }))
}

// ─── Filesystem helpers ───────────────────────────────────────────────────
async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}
async function writeFile(p, contents) {
  await ensureDir(path.dirname(p))
  await fsp.writeFile(p, contents)
}
async function readJsonIfExists(p) {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}
function genreDir(genreId) {
  return path.join(OUT_DIR, genreId)
}
function stagePaths(genreId, stage) {
  const base = genreDir(genreId)
  return {
    input: path.join(base, `${stage}.input.json`),
    raw: path.join(base, `${stage}.raw.txt`),
    parsed: path.join(base, `${stage}.json`),
  }
}

// ─── Per-stage runners ────────────────────────────────────────────────────
async function runResearch(genre, flags) {
  const paths = stagePaths(genre.id, '01-research')
  if (!flags.force && (await readJsonIfExists(paths.parsed))) {
    console.log(dim(`  research: cached`))
    return await readJsonIfExists(paths.parsed)
  }
  const input = {
    genreId: genre.id,
    genreName: genre.name,
    stations: genre.stations,
  }
  const userPrompt =
    `Genre: ${genre.name} (${genre.id})\n\n` +
    `Produce factual profiles for these ${genre.stations.length} stations. ` +
    `Their stationIds are: ${genre.stations.map((s) => s.id).join(', ')}.\n\n` +
    genre.stations
      .map(
        (s, i) =>
          `--- station #${i + 1} ---\n` +
          `id: ${s.id}\n` +
          `name: ${s.name}\n` +
          `curatorIntent: ${s.curatorPrompt}\n`
      )
      .join('\n')
  await writeFile(paths.input, JSON.stringify({ input, userPrompt }, null, 2))
  if (flags.dryRun) {
    console.log(dim(`  research: --dry-run (skipping Gemini call)`))
    return null
  }
  console.log(cyan(`  research: calling Gemini for ${genre.stations.length} stations`))
  const raw = await callGemini({
    systemInstruction: RESEARCH_SYSTEM,
    userPrompt,
    temperature: 0.5,
  })
  await writeFile(paths.raw, raw)
  const parsed = parseJson(raw, `research ${genre.id}`)
  await writeFile(paths.parsed, JSON.stringify(parsed, null, 2))
  return parsed
}

async function runConcepts(genre, research, flags) {
  const paths = stagePaths(genre.id, '02-concepts')
  if (!flags.force && (await readJsonIfExists(paths.parsed))) {
    console.log(dim(`  concepts: cached`))
    return await readJsonIfExists(paths.parsed)
  }
  if (!research) {
    console.warn(yellow(`  concepts: skipping (no research)`))
    return null
  }
  const input = { genreId: genre.id, genreName: genre.name, research }
  const userPrompt =
    `Genre: ${genre.name} (${genre.id})\n\n` +
    `Research from stage 1:\n\n${JSON.stringify(research, null, 2)}\n\n` +
    `Produce art-direction concepts for each of the ${
      Object.keys(research).length
    } stations. Remember the hard diversity constraint: no two stations ` +
    `in the batch may share the same (imageryFocus, aesthetic) pair.`
  await writeFile(paths.input, JSON.stringify({ input, userPrompt }, null, 2))
  if (flags.dryRun) {
    console.log(dim(`  concepts: --dry-run`))
    return null
  }
  console.log(cyan(`  concepts: calling Gemini`))
  const raw = await callGemini({
    systemInstruction: CONCEPT_SYSTEM,
    userPrompt,
    temperature: 0.8,
  })
  await writeFile(paths.raw, raw)
  const parsed = parseJson(raw, `concepts ${genre.id}`)
  await writeFile(paths.parsed, JSON.stringify(parsed, null, 2))
  return parsed
}

async function runPrompts(genre, research, concepts, flags) {
  const paths = stagePaths(genre.id, '03-prompt')
  if (!flags.force && (await readJsonIfExists(paths.parsed))) {
    console.log(dim(`  prompts: cached`))
    return await readJsonIfExists(paths.parsed)
  }
  if (!research || !concepts) {
    console.warn(yellow(`  prompts: skipping (missing upstream)`))
    return null
  }
  const input = { genreId: genre.id, research, concepts }
  const userPrompt =
    `Genre: ${genre.name} (${genre.id})\n\n` +
    `Stage 1 research:\n${JSON.stringify(research, null, 2)}\n\n` +
    `Stage 2 concepts:\n${JSON.stringify(concepts, null, 2)}\n\n` +
    `Produce a production-ready image-model prompt for each station.`
  await writeFile(paths.input, JSON.stringify({ input, userPrompt }, null, 2))
  if (flags.dryRun) {
    console.log(dim(`  prompts: --dry-run`))
    return null
  }
  console.log(cyan(`  prompts: calling Gemini`))
  const raw = await callGemini({
    systemInstruction: PROMPT_SYSTEM,
    userPrompt,
    temperature: 0.7,
  })
  await writeFile(paths.raw, raw)
  const parsed = parseJson(raw, `prompts ${genre.id}`)
  await writeFile(paths.parsed, JSON.stringify(parsed, null, 2))
  return parsed
}

// ─── Aggregation ──────────────────────────────────────────────────────────
async function aggregate() {
  const out = {}
  const genres = getGenres()
  for (const genre of genres) {
    const research = await readJsonIfExists(stagePaths(genre.id, '01-research').parsed)
    const concepts = await readJsonIfExists(stagePaths(genre.id, '02-concepts').parsed)
    const prompts = await readJsonIfExists(stagePaths(genre.id, '03-prompt').parsed)
    if (!research || !concepts || !prompts) continue
    for (const station of genre.stations) {
      const key = `${genre.id}/${station.id}`
      out[key] = {
        stationKey: key,
        genreId: genre.id,
        genreName: genre.name,
        stationId: station.id,
        stationName: station.name,
        research: research[station.id] || null,
        concept: concepts[station.id] || null,
        prompt: prompts[station.id] || null,
      }
    }
  }
  await writeFile(
    path.join(OUT_DIR, '_all-prompts.json'),
    JSON.stringify(out, null, 2)
  )
  return out
}

async function writeSystemPromptCopies() {
  await ensureDir(PROMPTS_DIR)
  await fsp.writeFile(path.join(PROMPTS_DIR, '01-research.system.md'), RESEARCH_SYSTEM)
  await fsp.writeFile(path.join(PROMPTS_DIR, '02-concepts.system.md'), CONCEPT_SYSTEM)
  await fsp.writeFile(path.join(PROMPTS_DIR, '03-prompt.system.md'), PROMPT_SYSTEM)
}

async function writeReadme() {
  const md = `# Station Cover Design — Pipeline Output

This directory is auto-generated by \`scripts/design-station-covers.js\`.
It is gitignored. Re-run the script to refresh.

## Layout

\`\`\`
.tmp/station-cover-design/
  _prompts/                       <- the system prompts used per stage
  _all-prompts.json               <- flat aggregate of every station's
                                     research + concept + image prompt
  <genre>/
    01-research.input.json        <- the user prompt + structured input
    01-research.raw.txt           <- Gemini's raw response (pre-parse)
    01-research.json              <- parsed research keyed by stationId
    02-concepts.input.json
    02-concepts.raw.txt
    02-concepts.json
    03-prompt.input.json
    03-prompt.raw.txt
    03-prompt.json
\`\`\`

## Stages

1. **Research** — factual music-historian profile per station,
   batched per genre so sibling subgenres get explicit
   \`differentiator\` paragraphs contrasting them.
2. **Concepts** — art-direction picks (imageryFocus, aesthetic,
   composition, palette) with a hard diversity constraint:
   no two stations in a batch share the same (focus, aesthetic) pair.
3. **Prompts** — production-ready image-model prompts ready to feed
   into an image-generation step.

## Re-runs

By default, each stage is skipped per-genre if its JSON output
already exists. Pass \`--force\` to re-run regardless. To re-run a
single genre or stage:

\`\`\`
npm run design:station-covers -- --genre kpop --force
npm run design:station-covers -- --genre kpop --stage research --force
\`\`\`
`
  await fsp.writeFile(path.join(OUT_DIR, 'README.md'), md)
}

// ─── CLI ──────────────────────────────────────────────────────────────────
function parseFlags() {
  const { values } = parseArgs({
    options: {
      genre: { type: 'string' },
      all: { type: 'boolean', default: false },
      stage: { type: 'string', default: 'all' }, // research|concepts|prompts|all
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      list: { type: 'boolean', default: false },
    },
    strict: true,
  })
  return {
    genre: values.genre,
    all: values.all,
    stage: values.stage,
    force: values.force,
    dryRun: values['dry-run'],
    list: values.list,
  }
}

function pickGenres(flags) {
  const all = getGenres()
  if (flags.list || flags.all) return all
  if (!flags.genre) {
    throw new Error('Pass --genre <id>, --all, or --list')
  }
  const g = all.find((x) => x.id === flags.genre)
  if (!g) {
    throw new Error(
      `Unknown genre "${flags.genre}". Known: ${all.map((x) => x.id).join(', ')}`
    )
  }
  return [g]
}

function status(genreId) {
  const r = fs.existsSync(stagePaths(genreId, '01-research').parsed)
  const c = fs.existsSync(stagePaths(genreId, '02-concepts').parsed)
  const p = fs.existsSync(stagePaths(genreId, '03-prompt').parsed)
  return { r, c, p }
}

async function main() {
  const flags = parseFlags()
  const genres = pickGenres(flags)

  await ensureDir(OUT_DIR)
  await writeSystemPromptCopies()
  await writeReadme()

  if (flags.list) {
    console.log(bold('Genre status (R = research, C = concept, P = prompt)'))
    for (const g of genres) {
      const s = status(g.id)
      const dot = (b) => (b ? green('●') : dim('○'))
      console.log(
        `  ${g.id.padEnd(14)} R${dot(s.r)} C${dot(s.c)} P${dot(s.p)}  (${g.stations.length} stations)`
      )
    }
    return 0
  }

  const stagesToRun = new Set(
    flags.stage === 'all'
      ? ['research', 'concepts', 'prompts']
      : [flags.stage]
  )

  let failures = 0
  for (let i = 0; i < genres.length; i += 1) {
    const genre = genres[i]
    console.log(
      bold(`[${i + 1}/${genres.length}] ${genre.name}`) + dim(` (${genre.id})`)
    )
    try {
      let research = await readJsonIfExists(stagePaths(genre.id, '01-research').parsed)
      let concepts = await readJsonIfExists(stagePaths(genre.id, '02-concepts').parsed)
      if (stagesToRun.has('research')) {
        research = await runResearch(genre, flags)
      }
      if (stagesToRun.has('concepts')) {
        concepts = await runConcepts(genre, research, flags)
      }
      if (stagesToRun.has('prompts')) {
        await runPrompts(genre, research, concepts, flags)
      }
    } catch (err) {
      failures += 1
      console.error(red(`  ✗ ${err?.message || err}`))
    }
  }

  // Aggregate every time so the flat file is always fresh.
  if (!flags.dryRun) {
    const merged = await aggregate()
    const count = Object.keys(merged).length
    const ready = Object.values(merged).filter((m) => m.prompt).length
    console.log('')
    console.log(
      green(
        `_all-prompts.json updated: ${ready}/${count} stations have a complete image prompt`
      )
    )
  }

  if (failures > 0) {
    console.log(red(`\n${failures} genre(s) failed.`))
    return failures
  }
  return 0
}

main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error(red(`design failed: ${err?.stack || err}`))
    process.exit(1)
  })
