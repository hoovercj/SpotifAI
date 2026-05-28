#!/usr/bin/env node
/**
 * Bake DJ avatar PNGs from `personas/*.md` via Gemini's image-preview
 * model.
 *
 * Reads each persona's `appearance` + `scene` sections (defined in the
 * YAML front-matter + markdown body), constructs a single image-gen
 * prompt that targets a square 1024×1024 portrait-style avatar, and
 * writes the result to `public/images/djs/<slug>.png`.
 *
 * Idempotent by default: existing PNGs are skipped. Pass `--force` to
 * re-bake all (or `--dj <slug>` with `--force` to re-bake one).
 *
 * Cost: roughly 1 image generation per DJ (currently ~28 DJs total).
 * This is the one script in the repo intended to be run by a human,
 * not by CI or the agent — the model is paid and the results vary, so
 * you'll typically want to eyeball each output and re-bake selectively.
 *
 * Usage:
 *   npm run seed:dj-avatars                       # bake every DJ that doesn't have a PNG yet
 *   npm run seed:dj-avatars -- --force            # re-bake every DJ
 *   npm run seed:dj-avatars -- --dj rusty         # bake (or re-bake with --force) one DJ
 *   npm run seed:dj-avatars -- --dry-run          # list what would be baked, no API calls
 *   npm run seed:dj-avatars -- --list             # print every DJ's slug + bake status, exit
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
const { loadPersonaMetadata } = require('../server/services/utl/loadPersonas')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'images', 'djs')

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
        'GOOGLE_API_KEY env var is required for the avatar bake script'
      )
    }
    aiClient = new GoogleGenAI({ apiKey })
  }
  return aiClient
}

// ─── Prompt construction ──────────────────────────────────────────────────
//
// Every avatar uses the same prompt scaffolding (a "house style" wrapper)
// so the roster has a coherent visual identity. The variable content is
// just the persona's `appearance` and `scene` paragraphs.
//
// The house style is: painterly digital illustration in the spirit of an
// album-cover portrait, square framing, character chest-up in their
// broadcast environment, warm cinematic lighting, no on-image text.
function buildPrompt(persona) {
  const { djName, appearance, scene, genres } = persona
  const genreLine = genres.length
    ? `On-air genres: ${genres.join(', ')}.`
    : ''
  return [
    `A painterly digital-illustration portrait avatar of a fictional radio DJ named ${djName}.`,
    'Album-cover quality, square 1:1 framing, chest-up composition with the studio environment visible behind the subject.',
    'Warm cinematic lighting, painterly brushwork (not photorealistic, not anime/cel-shaded), confident and friendly mood.',
    'The character should look directly at the viewer (or slightly past camera), mid-broadcast.',
    'No on-image text, no logos, no captions, no watermarks.',
    '',
    `Character (the subject):`,
    appearance,
    '',
    'Broadcast scene (background):',
    scene,
    '',
    genreLine,
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── Image generation ──────────────────────────────────────────────────────
//
// gemini-3.1-flash-image-preview returns the generated image as
// inlineData (base64 PNG) in the first candidate's parts[]. The shape
// matches the Gemini TTS response in server/services/tts/gemini.js, so
// the parse path is the same.
async function generateAvatar({ persona, outputPath }) {
  const ai = getClient()
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'
  const prompt = buildPrompt(persona)

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['IMAGE'],
    },
  })

  // Walk the parts list for the first inlineData payload. The image
  // model sometimes emits a text "safety" preamble before the image,
  // so we don't assume parts[0] is the image — we look for the first
  // entry that carries inlineData.
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

function isBaked(persona) {
  return fs.existsSync(path.join(OUTPUT_DIR, persona.image))
}

function printList(personas) {
  console.log(bold('DJ roster avatar status'))
  console.log(dim(`output: ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}`))
  console.log('')
  for (const p of personas) {
    const status = isBaked(p) ? green('baked') : yellow('missing')
    console.log(
      `  ${p.slug.padEnd(22)} ${p.djName.padEnd(24)} ${status}  ${dim(p.image)}`
    )
  }
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

  console.log(bold(`Avatar bake plan`))
  console.log(
    dim(
      `${queue.length} of ${personas.length} persona(s) selected ` +
        `(force=${flags.force}, dj=${flags.dj || '*'}, dry-run=${flags['dry-run']})`
    )
  )
  console.log('')
  if (queue.length === 0) {
    console.log(green('Nothing to do — every selected DJ already has a PNG.'))
    return 0
  }

  let failures = 0
  for (let i = 0; i < queue.length; i += 1) {
    const p = queue[i]
    const outputPath = path.join(OUTPUT_DIR, p.image)
    const tag = `[${i + 1}/${queue.length}]`
    console.log(`${tag} ${bold(p.djName)} ${dim(`(${p.slug})`)}`)
    if (flags['dry-run']) {
      console.log(dim(`  would write → ${path.relative(PROJECT_ROOT, outputPath)}`))
      console.log(dim('  prompt:'))
      const prompt = buildPrompt(p)
      console.log(prompt.split('\n').map((line) => `    ${line}`).join('\n'))
      console.log('')
      continue
    }
    const t0 = Date.now()
    try {
      const { bytes } = await generateAvatar({ persona: p, outputPath })
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
    console.log(green(`All ${queue.length} avatar(s) baked successfully.`))
    return 0
  }
  console.log(
    red(`${failures} of ${queue.length} avatar(s) failed. Re-run to retry.`)
  )
  return failures
}

main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error(red(`bake failed: ${err?.stack || err}`))
    process.exit(1)
  })
