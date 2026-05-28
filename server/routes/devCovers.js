/**
 * Dev-only HTTP route serving a tiny human-pick UI for the station-cover
 * photo-discovery flow.
 *
 * Not mounted in production. The intent is: developer runs
 *
 *   npm run search:station-covers -- --genre rock
 *
 * which fills `debug/station-cover-candidates/<genre>-<station>/` with
 * candidate thumbnails and a `candidates.json` manifest. They then open
 *
 *   http://localhost:3001/api/dev/station-covers
 *
 * in a browser. The page renders one section per station with a
 * gallery of thumbnails, source/license badges, and a "Pick" button.
 * Picking a candidate:
 *
 *   1. Downloads the full-res image to
 *      `public/images/stations/<genreId>-<stationId>.<ext>` so the
 *      resolver picks it up on the next /api/stations/covers fetch.
 *   2. Writes a sidecar `<genreId>-<stationId>.credits.json` capturing
 *      author + source URL + license — satisfies CC-BY-SA attribution
 *      for the picked file without binding the whole app to the
 *      ShareAlike clause.
 *   3. Updates the aggregate `public/images/stations/CREDITS.md` so a
 *      single human-readable file documents every photo we shipped.
 *
 * The UI is intentionally plain server-rendered HTML + a sprinkle of
 * fetch() — no React, no build step. It exists for one developer in
 * one terminal session and never needs to scale.
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const express = require('express')

const router = express.Router()

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const DEBUG_DIR = path.join(PROJECT_ROOT, 'debug', 'station-cover-candidates')
const STATIONS_DIR = path.join(PROJECT_ROOT, 'public', 'images', 'stations')
const CREDITS_FILE = path.join(STATIONS_DIR, 'CREDITS.md')

// Extensions the resolver knows about — kept in sync with
// COVER_EXTENSIONS in server/services/aiStations/resolveStationCover.js.
const COVER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function readManifestFor(folder) {
  const file = path.join(DEBUG_DIR, folder, 'candidates.json')
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function listStationFolders() {
  try {
    const entries = await fsp.readdir(DEBUG_DIR, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

function findExistingCoverFor(genreId, stationId) {
  for (const ext of COVER_EXTENSIONS) {
    const name = `${genreId}-${stationId}.${ext}`
    if (fs.existsSync(path.join(STATIONS_DIR, name))) return name
  }
  return null
}

async function readCreditsSidecar(genreId, stationId) {
  const file = path.join(STATIONS_DIR, `${genreId}-${stationId}.credits.json`)
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const folders = await listStationFolders()
    if (folders.length === 0) {
      res
        .status(200)
        .type('html')
        .send(
          renderShell(
            '<p style="opacity:.7">No candidates yet. Run <code>npm run search:station-covers -- --genre rock</code> first.</p>'
          )
        )
      return
    }
    const sections = []
    for (const folder of folders) {
      const manifest = await readManifestFor(folder)
      if (!manifest) continue
      sections.push(await renderStationSection(manifest))
    }
    res.type('html').send(renderShell(sections.join('\n')))
  } catch (err) {
    next(err)
  }
})

// ─── Thumbnail proxy ──────────────────────────────────────────────────────
router.get('/thumb/:folder/:filename', async (req, res, next) => {
  try {
    const { folder, filename } = req.params
    if (
      !/^[a-z0-9-]+$/i.test(folder) ||
      !/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(filename)
    ) {
      res.status(400).send('bad path')
      return
    }
    const file = path.join(DEBUG_DIR, folder, filename)
    if (!fs.existsSync(file)) {
      res.status(404).send('not found')
      return
    }
    res.sendFile(file)
  } catch (err) {
    next(err)
  }
})

// ─── Pick endpoint ────────────────────────────────────────────────────────
router.post('/pick', express.json(), async (req, res, next) => {
  try {
    const { stationKey, candidateIndex } = req.body || {}
    if (typeof stationKey !== 'string' || typeof candidateIndex !== 'number') {
      res.status(400).json({ ok: false, error: 'stationKey and candidateIndex required' })
      return
    }
    const [genreId, stationId] = stationKey.split('/')
    if (!genreId || !stationId) {
      res.status(400).json({ ok: false, error: 'bad stationKey' })
      return
    }
    const folder = `${genreId}-${stationId}`
    const manifest = await readManifestFor(folder)
    if (!manifest) {
      res.status(404).json({ ok: false, error: 'no candidates for that station' })
      return
    }
    const candidate = manifest.candidates.find((c) => c.index === candidateIndex)
    if (!candidate) {
      res.status(404).json({ ok: false, error: 'candidate index not found' })
      return
    }

    // Fetch the full-res image.
    const dl = await fetch(candidate.fullUrl, {
      headers: {
        'User-Agent': 'SpotifAI station-cover discovery script (personal use)',
        Accept: 'image/jpeg,image/png,image/webp,image/*',
      },
    })
    if (!dl.ok) {
      res
        .status(502)
        .json({ ok: false, error: `download failed: HTTP ${dl.status}` })
      return
    }
    const buf = Buffer.from(await dl.arrayBuffer())

    // Extension: trust Content-Type first, fall back to URL guess, default jpg.
    const ct = dl.headers.get('content-type') || ''
    let ext = 'jpg'
    if (/png/i.test(ct)) ext = 'png'
    else if (/webp/i.test(ct)) ext = 'webp'
    else if (/jpeg|jpg/i.test(ct)) ext = 'jpg'
    else {
      const m = candidate.fullUrl.match(/\.(jpe?g|png|webp)(?:\?|$)/i)
      if (m) ext = m[1].toLowerCase().replace('jpeg', 'jpg')
    }

    // Remove any prior cover for this station so only one extension wins.
    await fsp.mkdir(STATIONS_DIR, { recursive: true })
    for (const e of COVER_EXTENSIONS) {
      const stale = path.join(STATIONS_DIR, `${genreId}-${stationId}.${e}`)
      if (fs.existsSync(stale)) await fsp.unlink(stale)
    }
    const savedName = `${genreId}-${stationId}.${ext}`
    await fsp.writeFile(path.join(STATIONS_DIR, savedName), buf)

    // Sidecar credits.
    const credits = {
      stationKey,
      savedAs: savedName,
      pickedAt: new Date().toISOString(),
      source: candidate.source,
      author: candidate.author,
      authorUrl: candidate.authorUrl,
      sourceUrl: candidate.sourceUrl,
      license: candidate.license,
      licenseUrl: candidate.licenseUrl,
      queryUsed: candidate.queryUsed,
    }
    await fsp.writeFile(
      path.join(STATIONS_DIR, `${genreId}-${stationId}.credits.json`),
      JSON.stringify(credits, null, 2)
    )

    // Aggregate CREDITS.md
    await updateCreditsMd(stationKey, manifest.stationName, credits)

    // Return enough metadata that the picker UI can update its
    // "current cover" block in place — we deliberately do NOT
    // trigger a full page reload from the client, because the
    // gallery is ~1.5 MB of HTML across 145 stations and a full
    // reload after every pick will crash the browser tab.
    res.json({
      ok: true,
      stationKey,
      savedAs: savedName,
      coverUrl: `/images/stations/${savedName}`,
      license: credits.license,
      source: credits.source,
      author: credits.author,
    })
  } catch (err) {
    next(err)
  }
})

// ─── Clear endpoint ──────────────────────────────────────────────────────
router.post('/clear', express.json(), async (req, res, next) => {
  try {
    const { stationKey } = req.body || {}
    if (typeof stationKey !== 'string') {
      res.status(400).json({ ok: false, error: 'stationKey required' })
      return
    }
    const [genreId, stationId] = stationKey.split('/')
    if (!genreId || !stationId) {
      res.status(400).json({ ok: false, error: 'bad stationKey' })
      return
    }
    let removed = 0
    for (const e of COVER_EXTENSIONS) {
      const stale = path.join(STATIONS_DIR, `${genreId}-${stationId}.${e}`)
      if (fs.existsSync(stale)) {
        await fsp.unlink(stale)
        removed += 1
      }
    }
    const sidecar = path.join(
      STATIONS_DIR,
      `${genreId}-${stationId}.credits.json`
    )
    if (fs.existsSync(sidecar)) await fsp.unlink(sidecar)
    res.json({ ok: true, removed })
  } catch (err) {
    next(err)
  }
})

// ─── Rendering ────────────────────────────────────────────────────────────
function safeId(stationKey) {
  return stationKey.replace(/[^a-z0-9]+/gi, '-')
}

async function renderStationSection(manifest) {
  const existingCover = findExistingCoverFor(manifest.genreId, manifest.stationId)
  const existingCredits = await readCreditsSidecar(
    manifest.genreId,
    manifest.stationId
  )
  const folder = `${manifest.genreId}-${manifest.stationId}`
  const stationDomId = safeId(manifest.stationKey)
  const cards = manifest.candidates
    .filter((c) => c.thumbPath)
    .map((c) => {
      const badge =
        c.source === 'unsplash'
          ? '<span class="badge badge-unsplash">Unsplash</span>'
          : '<span class="badge badge-wiki">Wikimedia</span>'
      const credit = c.author
        ? c.authorUrl
          ? `<a href="${escapeHtml(c.authorUrl)}" target="_blank" rel="noopener">${escapeHtml(
              c.author
            )}</a>`
          : escapeHtml(c.author)
        : '(unknown)'
      const license = c.licenseUrl
        ? `<a href="${escapeHtml(c.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(
            c.license
          )}</a>`
        : escapeHtml(c.license)
      return `
        <div class="card" data-index="${c.index}" data-station="${escapeHtml(
        manifest.stationKey
      )}">
          <a class="thumb" href="${escapeHtml(c.sourceUrl)}" target="_blank" rel="noopener">
            <img loading="lazy" src="/api/dev/station-covers/thumb/${folder}/${escapeHtml(
              c.thumbPath
            )}" alt="${escapeHtml(c.alt || '')}" />
          </a>
          <div class="meta">
            ${badge}
            <div class="credit">by ${credit}</div>
            <div class="license">${license}</div>
            <div class="query"><em>q:</em> ${escapeHtml(c.queryUsed || '')}</div>
            <button class="pick-btn" data-station="${escapeHtml(
              manifest.stationKey
            )}" data-index="${c.index}">Pick</button>
          </div>
        </div>`
    })
    .join('')

  const currentBlock = existingCover
    ? renderCurrentBlock(
        manifest.stationKey,
        `/images/stations/${existingCover}`,
        existingCover,
        existingCredits
      )
    : ''

  return `
    <section class="station" id="station-${stationDomId}" data-station="${escapeHtml(
    manifest.stationKey
  )}">
      <header>
        <h2>${escapeHtml(manifest.stationName)}</h2>
        <span class="path">${escapeHtml(manifest.stationKey)}</span>
        <span class="queries">queries: ${manifest.queries
          .map((q) => `<code>${escapeHtml(q)}</code>`)
          .join(' · ')}</span>
      </header>
      <div class="current-slot">${currentBlock}</div>
      <div class="grid">${cards}</div>
    </section>`
}

// Same shape used by the server render and the client's in-place update,
// so the post-pick UI matches exactly what a fresh page load would show.
function renderCurrentBlock(stationKey, coverUrl, fileName, credits) {
  const creditLine = credits
    ? `<em>${escapeHtml(credits.source)} · ${escapeHtml(
        credits.author
      )} · ${escapeHtml(credits.license)}</em>`
    : '<em>(no sidecar credits — pre-existing bake)</em>'
  return `<div class="current">
      <img loading="lazy" src="${escapeHtml(coverUrl)}" alt="current" />
      <div>
        <strong>Current cover:</strong> ${escapeHtml(fileName)}<br>
        ${creditLine}
        <br>
        <button class="clear-btn" data-station="${escapeHtml(stationKey)}">Clear pick</button>
      </div>
    </div>`
}

function renderShell(inner) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SpotifAI – Station Cover Review</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #0a0a0c; color: #e6e6ea; }
    h1 { margin: 0 0 24px; font-size: 22px; }
    .station { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid #1f1f25; }
    .station header { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; margin-bottom: 12px; }
    .station h2 { margin: 0; font-size: 18px; }
    .path { opacity: .55; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .queries { font-size: 12px; opacity: .7; }
    .queries code { background: #18181d; padding: 2px 6px; border-radius: 4px; }
    .current { display: flex; gap: 16px; align-items: center; padding: 12px; background: #14141a; border: 1px solid #25252d; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
    .current img { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
    .card { background: #14141a; border: 1px solid #25252d; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
    .card.picked { border-color: #4ade80; box-shadow: 0 0 0 2px rgba(74,222,128,.25); }
    .thumb { display: block; aspect-ratio: 1 / 1; background: #000; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .meta { padding: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; align-self: flex-start; }
    .badge-unsplash { background: #1c2a1f; color: #88e09c; }
    .badge-wiki { background: #1f2530; color: #88b4e0; }
    .credit, .license, .query { opacity: .8; }
    .query { opacity: .55; font-style: italic; }
    a { color: #88b4e0; }
    button { margin-top: 4px; padding: 6px 10px; border: 1px solid #3a3a45; background: #1f1f27; color: inherit; border-radius: 4px; cursor: pointer; font: inherit; }
    button:hover { background: #2a2a35; }
    button.clear-btn { background: #2a1818; border-color: #5a2828; }
    .toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #1f3a25; border: 1px solid #4ade80; color: #c9f5d3; padding: 10px 16px; border-radius: 6px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; }
    .toast.show { opacity: 1; }
    .toast.error { background: #3a1f1f; border-color: #f87171; color: #fcd5d5; }
  </style>
</head>
<body>
  <h1>Station Cover Review</h1>
  ${inner}
  <div class="toast" id="toast"></div>
  <script>
    const toast = document.getElementById('toast')
    function showToast(msg, kind) {
      toast.textContent = msg
      toast.className = 'toast show' + (kind === 'error' ? ' error' : '')
      setTimeout(() => { toast.className = 'toast' }, 2500)
    }
    function safeId(stationKey) {
      return stationKey.replace(/[^a-z0-9]+/gi, '-')
    }
    function escapeAttr(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
    // Build the same .current block markup the server emits, so a
    // post-pick DOM update is visually identical to a fresh page
    // load — but without forcing the browser to re-parse 1.5 MB
    // of HTML and re-mount ~1,600 image cards.
    function renderCurrentBlock(stationKey, body) {
      const credit = '<em>' + escapeAttr(body.source) + ' · '
        + escapeAttr(body.author) + ' · ' + escapeAttr(body.license)
        + '</em>'
      return '<div class="current">'
        + '<img loading="lazy" src="' + escapeAttr(body.coverUrl)
        + '?t=' + Date.now() + '" alt="current" />'
        + '<div>'
        + '<strong>Current cover:</strong> ' + escapeAttr(body.savedAs) + '<br>'
        + credit + '<br>'
        + '<button class="clear-btn" data-station="' + escapeAttr(stationKey)
        + '">Clear pick</button>'
        + '</div></div>'
    }
    function applyPickToDom(stationKey, body) {
      const section = document.getElementById('station-' + safeId(stationKey))
      if (!section) return
      // Drop the green border from any previously-picked card in this
      // section, then highlight the new one. Doing it section-scoped
      // (rather than globally) keeps picks across stations independent.
      section.querySelectorAll('.card.picked').forEach((el) => el.classList.remove('picked'))
      // The clicked card was already given .picked by the click handler.
      const slot = section.querySelector('.current-slot')
      if (slot) slot.innerHTML = renderCurrentBlock(stationKey, body)
    }
    function applyClearToDom(stationKey) {
      const section = document.getElementById('station-' + safeId(stationKey))
      if (!section) return
      section.querySelectorAll('.card.picked').forEach((el) => el.classList.remove('picked'))
      const slot = section.querySelector('.current-slot')
      if (slot) slot.innerHTML = ''
    }
    document.body.addEventListener('click', async (ev) => {
      const pickBtn = ev.target.closest('.pick-btn')
      const clearBtn = ev.target.closest('.clear-btn')
      if (pickBtn) {
        const stationKey = pickBtn.dataset.station
        const candidateIndex = Number(pickBtn.dataset.index)
        pickBtn.disabled = true
        pickBtn.textContent = 'Picking…'
        try {
          const r = await fetch('/api/dev/station-covers/pick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationKey, candidateIndex })
          })
          const body = await r.json()
          if (!r.ok || !body.ok) throw new Error(body.error || 'pick failed')
          // Highlight first so applyPickToDom can dedupe across siblings.
          const card = pickBtn.closest('.card')
          if (card) card.classList.add('picked')
          applyPickToDom(stationKey, body)
          showToast('Saved ' + body.savedAs + ' (' + body.license + ')')
        } catch (err) {
          showToast(err.message, 'error')
        } finally {
          pickBtn.disabled = false
          pickBtn.textContent = 'Pick'
        }
      }
      if (clearBtn) {
        const stationKey = clearBtn.dataset.station
        if (!confirm('Remove current cover for ' + stationKey + '?')) return
        clearBtn.disabled = true
        try {
          const r = await fetch('/api/dev/station-covers/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationKey })
          })
          const body = await r.json()
          if (!r.ok || !body.ok) throw new Error(body.error || 'clear failed')
          applyClearToDom(stationKey)
          showToast('Cleared.')
        } catch (err) {
          showToast(err.message, 'error')
          clearBtn.disabled = false
        }
      }
    })
  </script>
</body>
</html>`
}

// ─── CREDITS.md updater ──────────────────────────────────────────────────
async function updateCreditsMd(stationKey, stationName, credits) {
  const header = '# Station Cover Image Credits\n\n' +
    'This file lists attribution for every photo used as a station cover.\n' +
    'Auto-generated by `/api/dev/station-covers/pick`. Do not edit by hand.\n\n'
  let body = ''
  try {
    const existing = await fsp.readFile(CREDITS_FILE, 'utf8')
    // Strip out any prior entry for this stationKey so we always
    // write the most recent pick. Each entry is delimited by a
    // `## <stationKey>` heading.
    const lines = existing.split(/\r?\n/)
    const filtered = []
    let skipping = false
    for (const line of lines) {
      if (line.startsWith('## ')) {
        skipping = line.includes(`(${stationKey})`)
      }
      if (!skipping) filtered.push(line)
    }
    body = filtered.join('\n').replace(/^[\s\S]*?\n## /, '## ')
    // Drop the original header; we re-emit it below.
    if (!body.startsWith('## ')) body = ''
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  const entry = `## ${stationName} (${stationKey})

- Source: ${credits.source}
- Author: ${credits.author}${credits.authorUrl ? ` (${credits.authorUrl})` : ''}
- Source URL: ${credits.sourceUrl}
- License: ${credits.license}${credits.licenseUrl ? ` — ${credits.licenseUrl}` : ''}
- Query: \`${credits.queryUsed || '(unknown)'}\`
- Picked: ${credits.pickedAt}
- File: \`${credits.savedAs}\`

`
  await fsp.mkdir(STATIONS_DIR, { recursive: true })
  await fsp.writeFile(CREDITS_FILE, header + (body ? body + '\n' : '') + entry)
}

module.exports = router
