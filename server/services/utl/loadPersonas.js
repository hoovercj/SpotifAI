/**
 * Loader for DJ personas defined as markdown files in `<repo>/personas/`.
 *
 * Each persona file has YAML front-matter (id, djName, voiceID, image)
 * followed by four markdown sections: ## djStyle, ## context,
 * ## ttsDirection, ## signaturePhrases. The loader emits the SAME
 * `{ id, djName, details }` shape that `djCharacters` used to define
 * inline, so callers don't have to change.
 *
 * `ttsDirection` is a one-paragraph Director's Notes block (style, pacing,
 * accent) per the Gemini speech-generation prompting guide. It is sent to
 * the TTS model as a preamble to align the prompt's written tone with the
 * selected voice's profile (see https://ai.google.dev/gemini-api/docs/speech-generation#prompting-guide).
 *
 * Metadata is parsed once at module load (sync). Image data URIs are
 * resolved per call (async) to preserve the existing async contract of
 * `djCharacters(djId)`.
 */
const fs = require('node:fs')
const path = require('node:path')
const { convertFileToDataURI } = require('./convertMP3FileToDataURI')

const PERSONAS_DIR = path.resolve(__dirname, '../../..', 'personas')
// PNGs are baked by `scripts/seed-dj-avatars.js` into the public assets
// folder so they're web-servable as static files AND inlineable as data
// URIs from here. Single canonical location, one source of truth.
const IMAGE_DIR = path.resolve(__dirname, '../../..', 'public', 'images', 'djs')

// Collapse soft-wrapped paragraphs into single lines (so a .md file can
// wrap nicely without changing the prompt). Blank lines stay as paragraph
// breaks (`\n\n`).
function normalizeParagraph(s) {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).join(' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

// Hand-rolled YAML-lite + section parser. The front-matter is trivial
// (`key: value` only — no nested objects, no arrays) and the section
// shape is fixed, so pulling in gray-matter/js-yaml would be overkill.
function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fm) {
    throw new Error(`Persona file missing YAML front-matter: ${filePath}`)
  }

  const front = {}
  for (const line of fm[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*?)\s*$/)
    if (m) front[m[1]] = m[2]
  }

  const sections = {}
  let current = null
  for (const line of fm[2].split('\n')) {
    const h = line.match(/^##\s+(\S+)\s*$/)
    if (h) {
      current = h[1]
      sections[current] = []
      continue
    }
    if (current) sections[current].push(line)
  }
  for (const k of Object.keys(sections)) {
    sections[k] = sections[k].join('\n').trim()
  }

  const phrases = (sections.signaturePhrases || '')
    .split('\n')
    .map((l) => l.match(/^\s*-\s+(.*\S)\s*$/))
    .filter(Boolean)
    .map((m) => m[1])

  if (!front.id) throw new Error(`Persona ${filePath} missing 'id'`)
  if (!front.djName) throw new Error(`Persona ${filePath} missing 'djName'`)
  if (!front.slug) throw new Error(`Persona ${filePath} missing 'slug'`)
  if (!front.image) throw new Error(`Persona ${filePath} missing 'image'`)
  if (!front.genres) throw new Error(`Persona ${filePath} missing 'genres'`)

  // `genres: pop, indie, electronic` → ['pop','indie','electronic'].
  // Kept comma-separated in YAML to preserve the loader's no-arrays
  // simplicity. Empty entries are dropped so trailing commas are safe.
  const genres = String(front.genres)
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)

  return {
    id: Number(front.id),
    slug: front.slug,
    djName: front.djName,
    voiceID: front.voiceID,
    image: front.image,
    genres,
    djStyle: normalizeParagraph(sections.djStyle || ''),
    context: normalizeParagraph(sections.context || ''),
    ttsDirection: normalizeParagraph(sections.ttsDirection || ''),
    appearance: normalizeParagraph(sections.appearance || ''),
    scene: normalizeParagraph(sections.scene || ''),
    signaturePhrases: phrases,
  }
}

// One-time sync read of all persona metadata. Re-reading per call would
// only matter if someone hot-edits a .md while the process is running;
// for personas that's rare enough to ignore (restart the dev server).
let _cache = null
function loadPersonaMetadata() {
  if (_cache) return _cache
  const files = fs
    .readdirSync(PERSONAS_DIR)
    .filter(
      (f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md'
    )
    .map((f) => path.join(PERSONAS_DIR, f))
  _cache = files.map(parseFile).sort((a, b) => a.id - b.id)
  return _cache
}

// Resolve a persona image to a data URI, gracefully tolerating a
// missing file. Returns `null` when the image hasn't been baked yet
// (during persona authoring, before `npm run seed:dj-avatars` runs)
// so the server boots clean and the client can fall back to an
// initials tile instead of a broken <img>.
async function resolveImage(imageFile) {
  const fullPath = path.join(IMAGE_DIR, imageFile)
  if (!fs.existsSync(fullPath)) return null
  return convertFileToDataURI(fullPath, 'png')
}

// Returns the array of persona objects in the legacy
// `{ id, djName, details: { voiceID, djStyle, signaturePhrases, context, image } }`
// shape with `image` resolved to a data URI. The post-bump fields
// (`slug`, `genres`, `appearance`, `scene`) are additive — existing
// consumers that only read id/djName/details.{voiceID,djStyle,...} keep
// working unchanged.
async function loadPersonas() {
  const metas = loadPersonaMetadata()
  return Promise.all(
    metas.map(async (m) => ({
      id: m.id,
      slug: m.slug,
      djName: m.djName,
      details: {
        voiceID: m.voiceID,
        djStyle: m.djStyle,
        signaturePhrases: m.signaturePhrases,
        context: m.context,
        ttsDirection: m.ttsDirection,
        genres: m.genres,
        appearance: m.appearance,
        scene: m.scene,
        image: await resolveImage(m.image),
      },
    }))
  )
}

// Eval-only overlay variant: load the production roster, then replace
// any persona whose slug has a file in `<experimentsDir>/` with the
// experimental version. Falls back to production-only when the
// experiments directory is missing or empty. Production code should NOT
// call this — production reads `personas/` only.
async function loadPersonasWithExperiments(experimentsDir) {
  const base = await loadPersonas()
  if (!fs.existsSync(experimentsDir)) return base

  const overrides = fs
    .readdirSync(experimentsDir)
    .filter(
      (f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md'
    )
    .map((f) => parseFile(path.join(experimentsDir, f)))

  if (overrides.length === 0) return base

  return Promise.all(
    base.map(async (p) => {
      const override = overrides.find((o) => o.id === p.id)
      if (!override) return p
      return {
        id: override.id,
        slug: override.slug,
        djName: override.djName,
        details: {
          voiceID: override.voiceID,
          djStyle: override.djStyle,
          signaturePhrases: override.signaturePhrases,
          context: override.context,
          ttsDirection: override.ttsDirection,
          genres: override.genres,
          appearance: override.appearance,
          scene: override.scene,
          image: await resolveImage(override.image),
        },
      }
    })
  )
}

module.exports = {
  loadPersonas,
  loadPersonaMetadata,
  loadPersonasWithExperiments,
}
