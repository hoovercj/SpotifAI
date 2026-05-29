#!/usr/bin/env node
/**
 * Generate the PWA icon set from scratch using sharp + svg.
 *
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-192-maskable.png  (with 20% safe-area padding)
 *   public/icons/icon-512-maskable.png  (with 20% safe-area padding)
 *   public/icons/apple-touch-icon.png   (180x180)
 *
 * The source is a brand-gradient violet→fuchsia rounded square with a
 * white sparkles glyph — matches the wordmark logo in
 * client/Components/SpotifyLogin.jsx and shell/AppShell.jsx.
 *
 * Run once after install with `npm run build:pwa-icons`. Output is
 * committed to the repo since the icons themselves don't change
 * between deploys.
 */
const fs = require('node:fs')
const path = require('node:path')

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('build-pwa-icons: sharp not installed. Run `npm install` first.')
  process.exit(1)
}

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'icons')

// Color stops match Tailwind `violet-500` -> `fuchsia-500`.
const GRAD_FROM = '#a855f7'
const GRAD_TO = '#ec4899'

// Sparkles SVG glyph — simple 4-point star matching lucide-react's Sparkles
// at the brand center. Re-exported as a path so we don't pull in lucide.
const SPARKLE_PATH =
  'M50 0 L60 40 L100 50 L60 60 L50 100 L40 60 L0 50 L40 40 Z'

function buildSvg({ size, padding = 0 }) {
  const inner = size - padding * 2
  const corner = Math.round(size * 0.18) // rounded-2xl-ish
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRAD_FROM}" />
      <stop offset="1" stop-color="${GRAD_TO}" />
    </linearGradient>
  </defs>
  <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${corner}" fill="url(#g)" />
  <g transform="translate(${size / 2 - inner * 0.28}, ${size / 2 - inner * 0.28}) scale(${(inner * 0.56) / 100})" fill="#fff">
    <path d="${SPARKLE_PATH}" />
  </g>
</svg>`
}

async function writeIcon({ size, padding = 0, outName }) {
  const svg = buildSvg({ size, padding })
  const outPath = path.join(OUT_DIR, outName)
  await sharp(Buffer.from(svg)).png().toFile(outPath)
  console.log(`build-pwa-icons: wrote ${outName}`)
}

async function run() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true })
  await writeIcon({ size: 192, outName: 'icon-192.png' })
  await writeIcon({ size: 512, outName: 'icon-512.png' })
  // Maskable icons need ~20% safe-area padding so the OS can mask
  // them to any shape (circle, rounded square, squircle) without
  // clipping the glyph.
  await writeIcon({ size: 192, padding: Math.round(192 * 0.1), outName: 'icon-192-maskable.png' })
  await writeIcon({ size: 512, padding: Math.round(512 * 0.1), outName: 'icon-512-maskable.png' })
  // Apple Home Screen icon — Safari masks this itself, so no padding.
  await writeIcon({ size: 180, outName: 'apple-touch-icon.png' })
}

run().catch((err) => {
  console.error('build-pwa-icons: fatal:', err)
  process.exit(1)
})
