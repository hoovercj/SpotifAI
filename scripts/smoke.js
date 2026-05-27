#!/usr/bin/env node
/**
 * SpotifAI AI smoke test.
 *
 * Exercises every Gemini code path the app touches with the smallest
 * possible prompts, so you can quickly answer "is the gen-AI side of
 * the world healthy right now?" without spinning up the full app.
 *
 * Three independent subtests, each timed and reported:
 *
 *   1. CHAT     server/services/llm  (createChatSession + sendMessage)
 *               Validates: GoogleGenAI client, gemini-3.1-flash-lite chat
 *               endpoint, system instruction wiring, multi-turn API.
 *
 *   2. JSON     ai.models.generateContent with responseMimeType=json
 *               Validates: the same path used by AI station setlist
 *               generation in generateStationTracks.js.
 *
 *   3. INTRO    server/services/aiStations/createStationIntro
 *               End-to-end production path: loads a persona from
 *               personas/, builds the DJ system prompt, runs the
 *               station-intro.md template through the chat, wraps the
 *               output with Director's-Notes per the Gemini speech-gen
 *               prompting guide, then synthesizes to WAV. Verifies
 *               RIFF/WAVE header and a sensible (> 1 KB) file size.
 *
 * The script keeps going after a failure so you see every endpoint's
 * status in one shot, then exits with the number of failed subtests.
 *
 * Output:
 *   Every run drops both a transcript and the generated WAV into
 *   `<repo>/smoke-output/` (gitignored):
 *     smoke-output/smoke_<ISO-timestamp>.log   stdout/stderr, ANSI-stripped
 *     smoke-output/smoke_<ISO-timestamp>.wav   the station-intro WAV
 *   Each run gets its own timestamped pair — nothing is overwritten.
 *   `Remove-Item smoke-output -Recurse` when the dir gets noisy.
 *
 * Cost: roughly 1 short chat call + 1 short JSON call + 1 station-intro
 * (chat + TTS). A few cents at most.
 *
 * Usage:
 *   npm run smoke                              # all five subtests (default station: rock/70s-legends)
 *   npm run smoke -- --skip-tts                # text-only (cheaper, skips the station-intro test)
 *   npm run smoke -- --skip-text               # skip the standalone chat + json checks
 *   npm run smoke -- --skip-pick               # skip the DJ-picker test
 *   npm run smoke -- --skip-facts              # skip the music-facts (MusicBrainz + Wikipedia) test
 *   npm run smoke -- --station pop/2010s       # pick a specific genre/station
 *   npm run smoke -- --mode warm               # "warm" = short bumper; "cold" = full welcome (default)
 *   npm run smoke -- --list-stations           # print every (genre, station, DJ) tuple and exit
 *   npm run smoke -- --list-djs                # print every persona with voice + genres + avatar status
 *   npm run smoke -- --check-avatars           # report which DJs need `npm run seed:dj-avatars`
 *
 * Requires GOOGLE_API_KEY in env (loaded from .env via dotenv).
 *
 * Exit codes:
 *   0  every requested subtest passed
 *   N  N subtests failed (so `&&` chaining works in CI)
 */
'use strict'

require('dotenv').config()

const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')

const { createChatSession } = require('../server/services/llm')
const { createStationIntro } = require('../server/services/aiStations/createStationIntro')
const { CATALOG, lookupStation } = require('../server/services/aiStations/catalog')
const { djCharacters } = require('../server/services/djCharacters')
const { loadPersonaMetadata } = require('../server/services/utl/loadPersonas')
const { pickDjWithLlm } = require('../server/services/sessions/pickDjWithLlm')
const { musicFactsSegment } = require('../server/services/musicFacts')

// ─── Output dir + transcript tee ─────────────────────────────────────────
// All artifacts for a single run share one timestamp so the .log and
// .wav are easy to pair up by name.
const SMOKE_OUTPUT_DIR = path.resolve(__dirname, '..', 'smoke-output')
fs.mkdirSync(SMOKE_OUTPUT_DIR, { recursive: true })
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_PATH = path.join(SMOKE_OUTPUT_DIR, `smoke_${RUN_STAMP}.log`)
const WAV_BASENAME = `smoke_${RUN_STAMP}`

// Strip ANSI color codes so the log file is readable in any editor.
const ANSI_RE = /\x1b\[[0-9;]*m/g

// Mirror every byte written to a tty stream into the log file. We use
// appendFileSync so nothing is lost even on a crash / process.exit —
// the smoke test writes at most a few KB total, so the sync cost is
// negligible. Failures to write the log are swallowed (we'd rather
// keep the console working than crash mid-report).
function teeToLogFile(stream) {
  const orig = stream.write.bind(stream)
  stream.write = (chunk, ...rest) => {
    if (chunk != null) {
      try {
        fs.appendFileSync(LOG_PATH, String(chunk).replace(ANSI_RE, ''))
      } catch (_) {
        // intentionally ignored — console output still works
      }
    }
    return orig(chunk, ...rest)
  }
}
teeToLogFile(process.stdout)
teeToLogFile(process.stderr)

// ─── ANSI helpers ──────────────────────────────────────────────────────────
// Stripped automatically when stdout is not a TTY (e.g. piped to a file
// or running under CI without TERM color support).
const useColor = process.stdout.isTTY
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const green = c('32')
const red = c('31')
const dim = c('2')
const bold = c('1')

function divider(label) {
  const line = '─'.repeat(74)
  console.log(`\n${line}`)
  if (label) console.log(`  ${bold(label)}`)
  console.log(line)
}

function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// ─── Argument parsing ──────────────────────────────────────────────────────
//
// The TTS subtest exercises the full production station-intro pipeline,
// so it's parameterized by a (genreId, stationId) tuple from the
// server-side catalog rather than a raw Gemini voice ID. Persona pinning
// (which DJ voices which station) lives in catalog.js.
const DEFAULT_STATION = 'rock/70s-legends'
const DEFAULT_MODE = 'cold'
const VALID_MODES = new Set(['cold', 'warm'])

// Flatten the catalog into a list of `{ genreId, stationId, name, djId }`
// rows once, used by both --list-stations and --station validation.
function listAllStations() {
  const rows = []
  for (const [genreId, genre] of Object.entries(CATALOG)) {
    for (const station of genre.stations) {
      rows.push({
        genreId,
        stationId: station.id,
        genreName: genre.name,
        stationName: station.name,
        djId: station.djId,
      })
    }
  }
  return rows
}

async function printStationList() {
  const rows = listAllStations()
  // Resolve DJ names so the listing is human-readable. One persona load
  // per unique djId.
  const personaCache = new Map()
  async function djNameFor(id) {
    if (!personaCache.has(id)) {
      const dj = await djCharacters(id)
      personaCache.set(id, dj?.djName || `(djId ${id})`)
    }
    return personaCache.get(id)
  }

  console.log(bold('AI station catalog'))
  console.log(
    dim('pass --station <genreId>/<stationId> to pick one for the intro subtest')
  )
  console.log('')
  for (const r of rows) {
    const slug = `${r.genreId}/${r.stationId}`
    const dj = await djNameFor(r.djId)
    console.log(
      `  ${slug.padEnd(22)} ${r.stationName.padEnd(22)} ${dim(`(${r.genreName} • DJ: ${dj})`)}`
    )
  }
  console.log('')
  console.log(dim(`default: ${DEFAULT_STATION}`))
}

function parseFlags() {
  const { values } = parseArgs({
    options: {
      'skip-tts': { type: 'boolean', default: false },
      'skip-text': { type: 'boolean', default: false },
      'skip-pick': { type: 'boolean', default: false },
      'skip-facts': { type: 'boolean', default: false },
      station: { type: 'string', default: DEFAULT_STATION },
      mode: { type: 'string', default: DEFAULT_MODE },
      'list-stations': { type: 'boolean', default: false },
      'list-djs': { type: 'boolean', default: false },
      'check-avatars': { type: 'boolean', default: false },
    },
    strict: true,
  })
  return values
}

function resolveStation(raw) {
  const parts = String(raw).split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid --station "${raw}". Expected "<genreId>/<stationId>" ` +
        `(e.g. "rock/70s-legends"). Run \`npm run smoke -- --list-stations\` ` +
        `for the full catalog.`
    )
  }
  const [genreId, stationId] = parts
  const hit = lookupStation(genreId, stationId)
  if (!hit) {
    const valid = listAllStations()
      .map((r) => `${r.genreId}/${r.stationId}`)
      .join(', ')
    throw new Error(
      `Unknown station "${raw}". Valid stations: ${valid}. ` +
        `Run \`npm run smoke -- --list-stations\` for details.`
    )
  }
  return hit
}

function resolveMode(raw) {
  const mode = String(raw).toLowerCase()
  if (!VALID_MODES.has(mode)) {
    throw new Error(
      `Invalid --mode "${raw}". Valid modes: ${[...VALID_MODES].join(', ')}.`
    )
  }
  return mode
}

// ─── Subtest runner ────────────────────────────────────────────────────────
// Wraps each subtest with timing, structured output, and error capture.
// Never throws — failure is just a result with ok=false so the runner
// can keep going and report every endpoint's status.
async function runSubtest(name, fn) {
  divider(name)
  const start = Date.now()
  try {
    const detail = await fn()
    const elapsed = Date.now() - start
    console.log(`${green('PASS')}  ${name}  ${dim(`(${fmtMs(elapsed)})`)}`)
    if (detail) console.log(dim(detail))
    return { name, ok: true, elapsed }
  } catch (err) {
    const elapsed = Date.now() - start
    console.log(`${red('FAIL')}  ${name}  ${dim(`(${fmtMs(elapsed)})`)}`)
    console.log(`  ${red('reason:')} ${err?.message || err}`)
    if (process.env.DEBUG) console.error(err)
    return { name, ok: false, elapsed, error: err }
  }
}

// ─── Subtests ──────────────────────────────────────────────────────────────

// 1) Multi-turn chat through the production facade. We pass a tiny
// system instruction and a tiny user message so the round-trip stays
// cheap; the only thing we assert is that we got a non-empty string
// back. Output quality is the eval harness's job, not the smoke test's.
async function smokeChat() {
  const chat = await createChatSession({
    systemInstruction:
      'You are a terse smoke-test responder. Reply with exactly five words.',
    sessionId: `smoke-${Date.now()}`,
  })
  const reply = await chat.sendMessage('Say hello to SpotifAI.')
  if (typeof reply !== 'string' || reply.trim().length === 0) {
    throw new Error(`expected non-empty string, got: ${JSON.stringify(reply)}`)
  }
  return `  reply: ${JSON.stringify(reply.trim().slice(0, 140))}`
}

// 2) JSON-mode one-shot — the same shape generateStationTracks uses to
// get candidate (title, artist) pairs. We hit the SDK directly here
// because askGemini isn't exported and we want to avoid the Spotify
// search side-effect; the model/config mirrors what the production
// path uses.
async function smokeJson() {
  const { GoogleGenAI } = require('@google/genai')
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not set')
  const ai = new GoogleGenAI({ apiKey })
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite'
  const res = await ai.models.generateContent({
    model,
    contents:
      'Return a JSON array of exactly two strings: ["ping","pong"]. JSON only.',
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  })
  const text = (res?.text ?? '').trim()
  if (!text) throw new Error('empty response text')
  // Defensive: Gemini sometimes wraps JSON in a ```json fence even in
  // JSON mode. generateStationTracks strips it; do the same here.
  const stripped = text
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/```$/i, '')
    .trim()
  let parsed
  try {
    parsed = JSON.parse(stripped)
  } catch (err) {
    throw new Error(`response was not valid JSON: ${stripped.slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`expected JSON array, got ${typeof parsed}`)
  }
  return `  parsed: ${JSON.stringify(parsed).slice(0, 140)}`
}

// 3) Station intro — the full production pipeline. Loads a persona,
// builds the DJ system prompt, renders station-intro.md, runs it through
// the chat, and synthesizes the resulting script with the persona's
// pinned voice. createStationIntro writes the WAV to <repo>/public/audio/
// (so it's playable via the same path the dev server serves); we move it
// into smoke-output/ next to the run's log.
async function smokeStationIntro({ genre, station, mode }) {
  const result = await createStationIntro({
    djId: station.djId,
    genre,
    station,
    mode,
  })

  if (!result?.filePath || !fs.existsSync(result.filePath)) {
    throw new Error(
      `createStationIntro returned ${result?.filePath} but file is missing`
    )
  }
  if (typeof result.text !== 'string' || result.text.trim().length === 0) {
    throw new Error('createStationIntro returned empty script text')
  }

  // Move next to the .log; fs.renameSync works because both paths are
  // on the same volume (repo root).
  const destPath = path.join(SMOKE_OUTPUT_DIR, `${WAV_BASENAME}.wav`)
  fs.renameSync(result.filePath, destPath)

  const stat = fs.statSync(destPath)
  if (stat.size < 1024) {
    throw new Error(
      `WAV is suspiciously small (${stat.size} bytes); expected > 1 KB`
    )
  }
  // Validate RIFF/WAVE header — same shape buildWavHeader writes.
  const fd = fs.openSync(destPath, 'r')
  const header = Buffer.alloc(12)
  fs.readSync(fd, header, 0, 12, 0)
  fs.closeSync(fd)
  const riff = header.slice(0, 4).toString('ascii')
  const wave = header.slice(8, 12).toString('ascii')
  if (riff !== 'RIFF') {
    throw new Error(`expected "RIFF" at byte 0, got ${JSON.stringify(riff)}`)
  }
  if (wave !== 'WAVE') {
    throw new Error(`expected "WAVE" at byte 8, got ${JSON.stringify(wave)}`)
  }
  const rel = path.relative(process.cwd(), destPath)
  // Dump the LLM-generated script too — helps eyeball persona consistency
  // when something looks off.
  const scriptPreview = result.text.replace(/\s+/g, ' ').trim()
  return (
    `  dj: ${result.djName}\n` +
    `  script: ${JSON.stringify(scriptPreview)}\n` +
    `  wrote: ${rel}  (${stat.size.toLocaleString()} bytes, RIFF/WAVE ok)`
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────

// Print every persona on disk, one row each, with voice + genre tags +
// avatar status. Useful sanity check after editing personas/ or running
// `npm run seed:dj-avatars`. No Gemini calls — pure metadata read.
async function printDjList() {
  const personas = loadPersonaMetadata()
  const IMAGE_DIR = path.resolve(__dirname, '..', 'public', 'images', 'djs')
  console.log(bold(`DJ roster (${personas.length} personas)`))
  console.log(dim(`personas read from personas/  •  avatars from public/images/djs/`))
  console.log('')
  for (const p of personas) {
    const imgOk = fs.existsSync(path.join(IMAGE_DIR, p.image))
    const tag = imgOk ? green('✓ img') : red('✗ img')
    console.log(
      `  ${String(p.id).padStart(2)}  ${p.slug.padEnd(24)} ${p.djName.padEnd(28)} ${dim(`(${p.voiceID})`)}  ${tag}  ${dim(p.genres.join(','))}`
    )
  }
}

// Walk personas/ and report PNG bake status. Same data as --list-djs
// but compressed to an OK/MISSING summary, ideal for CI.
async function printAvatarStatus() {
  const personas = loadPersonaMetadata()
  const IMAGE_DIR = path.resolve(__dirname, '..', 'public', 'images', 'djs')
  const present = []
  const missing = []
  for (const p of personas) {
    const fullPath = path.join(IMAGE_DIR, p.image)
    if (fs.existsSync(fullPath)) present.push(p)
    else missing.push(p)
  }
  console.log(bold(`Avatar bake status`))
  console.log('')
  console.log(`  ${green('present')}: ${present.length}/${personas.length}`)
  for (const p of present) {
    console.log(`    ✓ ${p.slug.padEnd(24)} ${p.djName}`)
  }
  if (missing.length) {
    console.log(`\n  ${red('missing')}: ${missing.length}/${personas.length}`)
    for (const p of missing) {
      console.log(`    ✗ ${p.slug.padEnd(24)} ${p.djName}  ${dim(`(${p.image})`)}`)
    }
    console.log(
      `\n  ${dim('Run')} ${bold('npm run seed:dj-avatars')} ${dim('to bake the missing avatars (Gemini image gen — costs apply).')}`
    )
  } else {
    console.log(`\n  ${green('all baked')} — no action needed.`)
  }
}

// 4) DJ picker (Phase 5) — round-trip a free-form seed through
// `pickDjWithLlm` and assert we get back a djId that's actually in the
// roster. We use a deliberately on-the-nose seed (an Afrobeats artist
// hint) so the model has a strong signal; the test would still pass if
// the model returned a different valid id.
async function smokePicker() {
  const seed = {
    type: 'artist',
    name: 'Burna Boy',
    artists: ['Burna Boy'],
    genres: ['afrobeats', 'afro-fusion', 'nigerian pop'],
  }
  const pick = await pickDjWithLlm({ seed })
  if (!pick || !Number.isInteger(pick.djId)) {
    throw new Error(
      `pickDjWithLlm returned ${JSON.stringify(pick)}; expected { djId, reason }`
    )
  }
  const personas = loadPersonaMetadata()
  const validIds = new Set(personas.map((p) => p.id))
  if (!validIds.has(pick.djId)) {
    throw new Error(
      `picked djId=${pick.djId} is not in the roster (valid: ${[...validIds].join(',')})`
    )
  }
  const dj = personas.find((p) => p.id === pick.djId)
  return `  picked: ${dj?.djName} (#${pick.djId})  reason: ${JSON.stringify(pick.reason)}`
}

// 5) Music facts (Phase 9) — round-trip a well-known song through
// MusicBrainz + Wikipedia and assert we get back a non-empty prompt.
// We use "Bohemian Rhapsody" by Queen because both sources have
// extensive coverage; the test is allowed to gracefully no-op (return
// "skipped — no facts") if the network is offline, since the rundown
// path falls back to a plain song intro in that case.
async function smokeFacts() {
  const prompt = await musicFactsSegment({
    name: 'Smoke Tester',
    nextTrackTitle: 'Bohemian Rhapsody',
    nextTrackArtist: 'Queen',
  })
  if (!prompt) {
    return '  skipped — both sources returned no data (likely offline)'
  }
  // Sanity: the prompt should include at least one grounded fact section.
  if (!/FACTS:/.test(prompt)) {
    throw new Error('musicFactsSegment returned a prompt without a FACTS block')
  }
  const preview = prompt
    .split('\n')
    .filter((l) => l.trim())
    .slice(-6)
    .join('\n    ')
  return `  prompt length: ${prompt.length} chars\n    tail:\n    ${preview}`
}

async function main() {
  const flags = parseFlags()

  if (flags['list-stations']) {
    await printStationList()
    return
  }

  if (flags['list-djs']) {
    await printDjList()
    return
  }

  if (flags['check-avatars']) {
    await printAvatarStatus()
    return
  }

  // Validate --station + --mode early so typos fail before any billed call.
  const { genre, station } = resolveStation(flags.station)
  const mode = resolveMode(flags.mode)

  // Resolve the DJ now too, so the banner can name them.
  const dj = await djCharacters(station.djId)
  const djLabel = dj ? `${dj.djName} (${dj.details?.voiceID || '?'})` : `dj ${station.djId}`

  console.log(bold('SpotifAI AI smoke test'))
  console.log(
    dim(
      `provider: gemini  •  text model: ${process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite'}  •  tts model: ${process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview'}`
    )
  )
  console.log(
    dim(
      `output dir: ${path.relative(process.cwd(), SMOKE_OUTPUT_DIR)}  •  run stamp: ${RUN_STAMP}`
    )
  )
  console.log(
    dim(
      `station: ${genre.id}/${station.id} • ${station.name}  •  mode: ${mode}  •  dj: ${djLabel}`
    )
  )

  if (!process.env.GOOGLE_API_KEY) {
    console.error(
      `\n${red('GOOGLE_API_KEY is not set')} — every subtest will fail. Aborting.`
    )
    process.exit(1)
  }

  const results = []
  if (!flags['skip-text']) {
    results.push(await runSubtest('1. chat   (createChatSession.sendMessage)', smokeChat))
    results.push(await runSubtest('2. json   (ai.models.generateContent, JSON mode)', smokeJson))
  }
  if (!flags['skip-tts']) {
    results.push(
      await runSubtest(
        `3. intro  (createStationIntro → WAV, ${genre.id}/${station.id} • ${mode})`,
        () => smokeStationIntro({ genre, station, mode })
      )
    )
  }
  if (!flags['skip-pick']) {
    results.push(
      await runSubtest(
        '4. pick   (pickDjWithLlm, free-form seed → roster id)',
        smokePicker
      )
    )
  }
  if (!flags['skip-facts']) {
    results.push(
      await runSubtest(
        '5. facts  (musicFactsSegment → MusicBrainz + Wikipedia)',
        smokeFacts
      )
    )
  }

  // Summary
  divider('summary')
  const totalMs = results.reduce((sum, r) => sum + r.elapsed, 0)
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  for (const r of results) {
    const tag = r.ok ? green('PASS') : red('FAIL')
    console.log(`  ${tag}  ${r.name}  ${dim(`(${fmtMs(r.elapsed)})`)}`)
  }
  console.log(
    `\n  ${bold(`${passed}/${results.length} subtests passed`)}  ${dim(`• total ${fmtMs(totalMs)}`)}`
  )
  console.log(
    dim(`  artifacts: ${path.relative(process.cwd(), LOG_PATH)}`)
  )

  process.exit(failed)
}

main().catch((err) => {
  console.error(`\n${red('smoke test crashed:')}`, err?.message || err)
  if (process.env.DEBUG) console.error(err)
  process.exit(1)
})
