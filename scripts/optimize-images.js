#!/usr/bin/env node
/**
 * Pre-generate thumb (square) + full webp + jpg variants for every
 * DJ portrait and station cover.
 *
 *   public/images/djs/<slug>.png      -> public/images/djs/optimized/<slug>.thumb.{webp,jpg}
 *                                        public/images/djs/optimized/<slug>.full.{webp,jpg}
 *   public/images/stations/<g>-<s>.{png|jpg|jpeg|webp}
 *                                     -> public/images/stations/optimized/<g>-<s>.thumb.{webp,jpg}
 *                                        public/images/stations/optimized/<g>-<s>.full.{webp,jpg}
 *
 * Idempotent — keeps a `.optimize-cache.json` index of source mtimes
 * so re-runs skip unchanged files. Delete the cache file to force a
 * full rebuild.
 *
 * Wired as a pre-step of `npm run build` and `npm run build:prod`.
 *
 * Skips gracefully when `sharp` isn't installed (so contributors who
 * haven't run `npm install` yet on a checkout still get a useful
 * error rather than a stack trace).
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SIZES = {
  thumb: 320,
  full: 1024,
}
const DJ_SIZES = {
  thumb: 96,
  full: 512,
}

let sharp
try {
  sharp = require('sharp')
} catch (err) {
  console.error('optimize-images: sharp is not installed. Run `npm install` first.')
  process.exit(1)
}

const TASKS = [
  {
    name: 'djs',
    sourceDir: path.join(ROOT, 'public', 'images', 'djs'),
    outDir: path.join(ROOT, 'public', 'images', 'djs', 'optimized'),
    sizes: DJ_SIZES,
    pattern: /\.png$/i,
  },
  {
    name: 'stations',
    sourceDir: path.join(ROOT, 'public', 'images', 'stations'),
    outDir: path.join(ROOT, 'public', 'images', 'stations', 'optimized'),
    sizes: SIZES,
    pattern: /\.(png|jpe?g|webp)$/i,
  },
]

const CACHE_FILE = path.join(ROOT, '.optimize-cache.json')

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

async function optimizeOne(srcPath, outDir, sizes) {
  const ext = path.extname(srcPath)
  const base = path.basename(srcPath, ext)
  await fs.promises.mkdir(outDir, { recursive: true })
  const img = sharp(srcPath, { failOn: 'none' })
  for (const [tag, size] of Object.entries(sizes)) {
    const resized = img
      .clone()
      .resize(size, size, { fit: 'cover', withoutEnlargement: false })
    await resized.webp({ quality: 80, effort: 4 }).toFile(
      path.join(outDir, `${base}.${tag}.webp`)
    )
    await resized.jpeg({ quality: 82, progressive: true, mozjpeg: false }).toFile(
      path.join(outDir, `${base}.${tag}.jpg`)
    )
  }
}

async function run() {
  if (!fs.existsSync(path.join(ROOT, 'public'))) {
    console.warn('optimize-images: public/ directory not found, skipping.')
    return
  }
  const cache = readCache()
  let processed = 0
  let skipped = 0
  for (const task of TASKS) {
    if (!fs.existsSync(task.sourceDir)) continue
    const files = fs
      .readdirSync(task.sourceDir)
      .filter((f) => task.pattern.test(f))
      .map((f) => path.join(task.sourceDir, f))
    for (const srcPath of files) {
      const stat = fs.statSync(srcPath)
      const key = path.relative(ROOT, srcPath)
      const sig = `${stat.mtimeMs}:${stat.size}`
      if (cache[key] === sig) {
        skipped++
        continue
      }
      try {
        await optimizeOne(srcPath, task.outDir, task.sizes)
        cache[key] = sig
        processed++
      } catch (err) {
        console.warn(`optimize-images: failed for ${key}:`, err?.message || err)
      }
    }
  }
  writeCache(cache)
  console.log(`optimize-images: processed=${processed} skipped=${skipped}`)
}

run().catch((err) => {
  console.error('optimize-images: fatal:', err)
  process.exit(1)
})
