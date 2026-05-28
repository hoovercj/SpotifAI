#!/usr/bin/env node
/**
 * Bake DJ voice-intro WAV clips from `personas/*.md` via Gemini's TTS
 * model.
 *
 * Each intro is a short ~5-8 second self-introduction in the DJ's own
 * voice, intended for the picker UI's "Preview voice" button — users
 * tap a DJ tile and hear a one-liner before deciding whether to hire
 * them. We use the persona's `voiceID` (Gemini preset name) and a
 * deterministic text template built from `djName` + first
 * `signaturePhrases` entry, so re-running the script for the same DJ
 * produces the same line (and re-using --force only costs a TTS call,
 * not an LLM call).
 *
 * Idempotent by default: existing WAVs are skipped. Pass `--force` to
 * re-bake all (or `--dj <slug>` with `--force` to re-bake one).
 *
 * Cost: roughly 1 short TTS generation per DJ (~28 DJs total). Cheap
 * relative to the avatar bake, but still a paid call — this script is
 * intended to be run by a human, not by CI or the agent.
 *
 * Output: `public/audio/dj-intro-<slug>.wav`. That's the same folder
 * the runtime TTS pipeline writes to (see `server/services/tts/gemini.js`)
 * and Express serves under `/audio/*`. `loadPersonas()` resolves the
 * URL via `resolveIntroUrl(slug)` so the client just receives a ready
 * `details.introUrl` string when the file exists.
 *
 * Usage:
 *   npm run seed:dj-intros                       # bake every DJ that doesn't have a WAV yet
 *   npm run seed:dj-intros -- --force            # re-bake every DJ
 *   npm run seed:dj-intros -- --dj rusty         # bake (or re-bake with --force) one DJ
 *   npm run seed:dj-intros -- --dry-run          # show the text + voice for each, no API calls
 *   npm run seed:dj-intros -- --list             # print every DJ's slug + bake status, exit
 *
 * Requires GOOGLE_API_KEY in env (loaded from .env via dotenv).
 *
 * The TTS model is selected via env in the underlying provider (default
 * `gemini-3.1-flash-tts-preview` — see `server/services/tts/gemini.js`).
 */
'use strict'

require('dotenv').config()

const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')
const { loadPersonaMetadata } = require('../server/services/utl/loadPersonas')
const { synthesize } = require('../server/services/tts')
const { buildTtsPrompt } = require('../server/services/utl/buildTtsPrompt')
const { buildIntroText } = require('../server/services/utl/buildIntroText')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'audio')

// ─── ANSI helpers ──────────────────────────────────────────────────────────
const useColor = process.stdout.isTTY
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const green = c('32')
const red = c('31')
const yellow = c('33')
const dim = c('2')
const bold = c('1')

// ─── Filename + text helpers ───────────────────────────────────────────────
//
// Filename convention matches `resolveIntroUrl()` in
// server/services/utl/loadPersonas.js. Changing this in one place
// requires changing the other.
function introBaseName(slug) {
  return `dj-intro-${slug}`
}

// Build the intro line for a persona. Deterministic — no LLM call —
// so a re-bake produces the same script for the same persona.
// Implementation lives in server/services/utl/buildIntroText.js so
// the picker UI can render the EXACT same transcript via
// details.introText (loadPersonas runs the same helper); see that
// file for the spokenName / signaturePhrase fallback rules.
// Re-exported here only to keep the bake call site readable.

// ─── Driver ────────────────────────────────────────────────────────────────
function parseFlags() {
  const { values } = parseArgs({
    options: {
      force: { type: 'boolean', default: false },
      dj: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      list: { type: 'boolean', default: false },
    },
    strict: true,
  })
  return values
}

function introPathFor(persona) {
  return path.join(OUTPUT_DIR, `${introBaseName(persona.slug)}.wav`)
}

function isBaked(persona) {
  return fs.existsSync(introPathFor(persona))
}

function printList(personas) {
  console.log(bold('DJ roster voice-intro status'))
  console.log(dim(`output: ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}`))
  console.log('')
  for (const p of personas) {
    const status = isBaked(p) ? green('baked') : yellow('missing')
    console.log(
      `  ${p.slug.padEnd(22)} ${p.djName.padEnd(24)} ${status}  ` +
        `${dim(`${introBaseName(p.slug)}.wav  voice=${p.voiceID}`)}`
    )
  }
}

async function bakeIntro({ persona }) {
  const text = buildIntroText(persona)
  // Wrap the bare transcript in the standard Director's-Notes preamble
  // before handing it to Gemini TTS. Without this, the model has no
  // accent/style steering and every persona ends up sounding like the
  // same neutral California broadcaster regardless of voiceID — see
  // server/services/utl/buildTtsPrompt.js for the prompting rationale.
  const prompt = buildTtsPrompt({
    djName: persona.djName,
    ttsDirection: persona.ttsDirection,
    transcript: text,
  })
  // synthesize() writes to PROJECT_ROOT/public/audio/<sanitizedBase>.wav,
  // i.e. exactly our OUTPUT_DIR, so we don't have to move the file
  // afterwards. We do still want to know where it landed for the log
  // line — capture its returned path.
  const { filePath } = await synthesize({
    text: prompt,
    voiceId: persona.voiceID,
    fileBaseName: introBaseName(persona.slug),
  })
  return { filePath, text }
}

async function main() {
  const flags = parseFlags()
  const personas = loadPersonaMetadata()

  if (flags.list) {
    printList(personas)
    return 0
  }

  let queue = personas
  if (flags.dj) {
    const match = personas.find((p) => p.slug === flags.dj)
    if (!match) {
      const slugs = personas.map((p) => p.slug).join(', ')
      throw new Error(`No persona with slug "${flags.dj}". Known: ${slugs}`)
    }
    queue = [match]
  }
  if (!flags.force) {
    queue = queue.filter((p) => !isBaked(p))
  }

  console.log(bold('Voice-intro bake plan'))
  console.log(
    dim(
      `${queue.length} of ${personas.length} persona(s) selected ` +
        `(force=${flags.force}, dj=${flags.dj || '*'}, dry-run=${flags['dry-run']})`
    )
  )
  console.log('')
  if (queue.length === 0) {
    console.log(green('Nothing to do — every selected DJ already has a WAV.'))
    return 0
  }

  // Ensure output dir exists once up front so dry-run mode still
  // surfaces any permissions issue early. synthesize() also makes the
  // dir on its own, but the explicit step here keeps the script's
  // intent obvious to a reader.
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true })

  let failures = 0
  for (let i = 0; i < queue.length; i += 1) {
    const p = queue[i]
    const outputPath = introPathFor(p)
    const tag = `[${i + 1}/${queue.length}]`
    console.log(`${tag} ${bold(p.djName)} ${dim(`(${p.slug}, voice=${p.voiceID})`)}`)
    const text = buildIntroText(p)
    if (flags['dry-run']) {
      console.log(dim(`  would write → ${path.relative(PROJECT_ROOT, outputPath)}`))
      console.log(dim(`  text: "${text}"`))
      console.log('')
      continue
    }
    const t0 = Date.now()
    try {
      const { filePath } = await bakeIntro({ persona: p })
      const stats = await fs.promises.stat(filePath)
      const ms = Date.now() - t0
      console.log(
        green(
          `  ✓ ${(stats.size / 1024).toFixed(1)} KB ` +
            `→ ${path.relative(PROJECT_ROOT, filePath)} ` +
            `(${(ms / 1000).toFixed(1)}s)`
        )
      )
      console.log(dim(`    text: "${text}"`))
    } catch (err) {
      failures += 1
      console.error(red(`  ✗ ${err?.message || err}`))
    }
  }

  console.log('')
  if (failures === 0) {
    console.log(green(`All ${queue.length} intro(s) baked successfully.`))
    return 0
  }
  console.log(
    red(`${failures} of ${queue.length} intro(s) failed. Re-run to retry.`)
  )
  return failures
}

main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error(red(`bake failed: ${err?.stack || err}`))
    process.exit(1)
  })
