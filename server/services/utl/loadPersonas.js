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
const { buildIntroText } = require('./buildIntroText')

const PERSONAS_DIR = path.resolve(__dirname, '../../..', 'personas')
// PNGs are baked by `scripts/seed-dj-avatars.js` into the public assets
// folder so they're web-servable as static files. We expose URL paths
// (not data URIs) so the client can size + cache them like any other
// image. Pre-generated thumb/full sizes live under `optimized/`; we
// prefer those when they exist and fall back to the original PNG so
// the server boots fine before `npm run optimize:images` has run.
const IMAGE_DIR = path.resolve(__dirname, '../../..', 'public', 'images', 'djs')
const OPTIMIZED_DIR = path.join(IMAGE_DIR, 'optimized')
// Voice intro WAVs baked by `scripts/seed-dj-intros.js`. Served by
// Express as static files under `/audio/`, so the URL exposed to the
// client is just the basename prefixed with `/audio/`.
const INTRO_DIR = path.resolve(__dirname, '../../..', 'public', 'audio')
function introFilename(slug) {
  return `dj-intro-${slug}.wav`
}

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
    // Optional: phonetic spelling for the on-air name when the
    // brand handle doesn't TTS cleanly (e.g. "M-Quake" gets read
    // as "Mac-Quake" by Gemini, so we set `spokenName: Em Quake`
    // in that persona's frontmatter). The seed-dj-intros script
    // prefers this over `djName` when constructing the intro
    // transcript; UI surfaces always use `djName`.
    spokenName: front.spokenName || null,
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

// Resolve a persona image to URL paths the client can drop into a
// <picture> tag. Prefers the pre-generated `thumb`/`full` webp pair
// from `scripts/optimize-images.js`, falls back to the original PNG
// when those aren't built yet. Returns `null` when the source image
// hasn't been baked, so the server boots clean and the client can
// fall back to an initials tile instead of a broken <img>.
function resolveImage(imageFile) {
  const fullPath = path.join(IMAGE_DIR, imageFile)
  if (!fs.existsSync(fullPath)) return null
  const base = imageFile.replace(/\.(png|jpe?g|webp)$/i, '')
  const optThumbWebp = path.join(OPTIMIZED_DIR, `${base}.thumb.webp`)
  const optFullWebp = path.join(OPTIMIZED_DIR, `${base}.full.webp`)
  const optThumbJpg = path.join(OPTIMIZED_DIR, `${base}.thumb.jpg`)
  const optFullJpg = path.join(OPTIMIZED_DIR, `${base}.full.jpg`)
  const has = (p) => fs.existsSync(p)
  return {
    // Original-resolution PNG path (always present when the file
    // exists). Kept as the universal fallback for older clients or
    // when optimization hasn't run.
    src: `/images/djs/${imageFile}`,
    thumb: has(optThumbWebp)
      ? {
          webp: `/images/djs/optimized/${base}.thumb.webp`,
          jpg: has(optThumbJpg) ? `/images/djs/optimized/${base}.thumb.jpg` : null,
        }
      : null,
    full: has(optFullWebp)
      ? {
          webp: `/images/djs/optimized/${base}.full.webp`,
          jpg: has(optFullJpg) ? `/images/djs/optimized/${base}.full.jpg` : null,
        }
      : null,
  }
}

// Resolve a persona's pregenerated voice-intro clip to a public URL,
// or `null` when no clip has been baked yet. The picker UI uses this
// to decide whether to surface a "Preview voice" button, so we keep
// this purely existence-based (no caching, no error throwing) — the
// next call after `scripts/seed-dj-intros.js` runs will pick up the
// new file with no server restart needed.
function resolveIntroUrl(slug) {
  if (!slug) return null
  const fp = path.join(INTRO_DIR, introFilename(slug))
  return fs.existsSync(fp) ? `/audio/${introFilename(slug)}` : null
}

// Returns the array of persona objects in the legacy
// `{ id, djName, details: { voiceID, djStyle, signaturePhrases, context, image } }`
// shape. `image` is now an object `{ src, thumb, full }` (or null) — the
// client picks the size it needs and constructs the <picture> tag.
// The post-bump fields (`slug`, `genres`, `appearance`, `scene`) are
// additive — existing consumers that only read id/djName/details.{voiceID,djStyle,...}
// keep working unchanged.
async function loadPersonas() {
  const metas = loadPersonaMetadata()
  return metas.map((m) => ({
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
      image: resolveImage(m.image),
      introUrl: resolveIntroUrl(m.slug),
      // The exact transcript that was sent to Gemini when the
      // intro WAV was baked. Surfaced in the picker bio panel
      // so users see what the Audition clip will say, and so
      // the displayed text is guaranteed in sync with the
      // audio (both use buildIntroText() over the same
      // metadata). null when no intro has been baked yet.
      introText: resolveIntroUrl(m.slug) ? buildIntroText(m) : null,
    },
  }))
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

  return base.map((p) => {
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
        image: resolveImage(override.image),
        introUrl: resolveIntroUrl(override.slug),
        introText: resolveIntroUrl(override.slug)
          ? buildIntroText(override)
          : null,
      },
    }
  })
}

module.exports = {
  loadPersonas,
  loadPersonaMetadata,
  loadPersonasWithExperiments,
}
