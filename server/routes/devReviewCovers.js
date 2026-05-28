/**
 * Dev-only route: human approve/tweak/reject UI for the AI-generated
 * station covers produced by `npm run design:station-covers` +
 * `npm run seed:station-covers -- --from-designs`.
 *
 * Mounted at `/api/dev/review-covers` only when NODE_ENV !== production.
 *
 *   GET  /                       → the HTML review page
 *   GET  /state                  → JSON: all decisions + design facts
 *   GET  /image/:g/:s/:v         → serve variant PNG from .tmp
 *   POST /init                   → bootstrap _decisions.json (idempotent)
 *   POST /decision               → approve | tweak | reject (regen here)
 *   POST /set-active             → promote a prior variant to active
 *
 * The UI is a single self-contained HTML page with vanilla fetch().
 * No build step, no framework — same convention as devCovers.js.
 *
 * Regeneration calls Gemini synchronously (~15-30s). The UI shows a
 * spinner on the affected card while waiting. Express default
 * timeout (no explicit limit) covers this comfortably.
 */

const path = require('node:path')
const fs = require('node:fs')
const express = require('express')

const router = express.Router()

const review = require('../services/coverReview')

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── GET / — the review page ─────────────────────────────────────────────
router.get('/', (req, res) => {
  res.type('html').send(renderPage())
})

// ─── GET /state — initial state for the UI ───────────────────────────────
router.get('/state', async (req, res, next) => {
  try {
    // Auto-init if decisions file doesn't exist yet — first visit
    // mirrors the initial bake into v1 entries for all 145 stations.
    await review.initializeFromBakes()
    const designs = review.loadDesigns()
    const decisions = review.loadDecisions()
    const stations = []
    for (const [key, design] of Object.entries(designs)) {
      const station = decisions[key]
      stations.push({
        key,
        genreId: design.genreId,
        genreName: design.genreName,
        stationId: design.stationId,
        stationName: design.stationName,
        research: design.research,
        decision: station || null,
      })
    }
    res.json({ stations })
  } catch (err) {
    next(err)
  }
})

// ─── GET /image/:g/:s/:v — serve a variant PNG ───────────────────────────
router.get('/image/:genre/:station/:variant', (req, res, next) => {
  const v = Number.parseInt(req.params.variant, 10)
  if (!Number.isFinite(v) || v < 1) return res.status(400).end('bad variant')
  const file = review.variantImagePath(req.params.genre, req.params.station, v)
  if (!fs.existsSync(file)) return res.status(404).end('not found')
  // Cache-bust query string from the client takes care of staleness
  // after regen; we just serve the file.
  res.type('image/png').sendFile(file)
})

// ─── POST /init — explicit re-bootstrap ──────────────────────────────────
router.post('/init', express.json(), async (req, res, next) => {
  try {
    const result = await review.initializeFromBakes()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ─── POST /decision — approve | tweak | reject ───────────────────────────
router.post('/decision', express.json(), async (req, res, next) => {
  const { genreId, stationId, decision, feedback, direction } = req.body || {}
  if (!genreId || !stationId || !decision) {
    return res.status(400).json({ error: 'genreId, stationId, decision required' })
  }
  try {
    let station
    if (decision === 'approve') {
      station = await review.approveActive(genreId, stationId)
    } else if (decision === 'tweak') {
      station = await review.regenerateOnTweak(genreId, stationId, feedback)
    } else if (decision === 'reject') {
      station = await review.regenerateOnReject(genreId, stationId, direction)
    } else {
      return res.status(400).json({ error: `unknown decision: ${decision}` })
    }
    res.json({ ok: true, station })
  } catch (err) {
    // Surface regen failures with full detail — dev tool, not prod.
    console.error('[review-covers] decision failed:', err)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ─── POST /set-active — promote a prior variant ──────────────────────────
router.post('/set-active', express.json(), async (req, res, next) => {
  const { genreId, stationId, variant } = req.body || {}
  if (!genreId || !stationId || !Number.isFinite(variant)) {
    return res.status(400).json({ error: 'genreId, stationId, variant required' })
  }
  try {
    const station = await review.setActiveVariant(genreId, stationId, variant)
    res.json({ ok: true, station })
  } catch (err) {
    console.error('[review-covers] set-active failed:', err)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ─── HTML page ───────────────────────────────────────────────────────────
function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Station Cover Review</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --bg: #0f1115;
    --panel: #181b22;
    --panel-2: #1f232c;
    --border: #2a2f3a;
    --text: #e7e9ee;
    --muted: #9aa3b2;
    --accent: #6ea8ff;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --chip: #2d3340;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--text); font-family: -apple-system, system-ui, "Segoe UI", sans-serif; margin: 0; }
  header {
    position: sticky; top: 0; z-index: 10;
    background: var(--panel); border-bottom: 1px solid var(--border);
    padding: 12px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 18px; }
  header .progress { color: var(--muted); font-size: 13px; }
  header .filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    background: var(--chip); color: var(--text); border: 1px solid var(--border);
    padding: 4px 10px; border-radius: 999px; font-size: 12px; cursor: pointer;
    user-select: none;
  }
  .chip.active { background: var(--accent); color: #0f1115; border-color: var(--accent); }
  main { padding: 20px; max-width: 1400px; margin: 0 auto; }
  .genre-section { margin-bottom: 36px; }
  .genre-section h2 {
    font-size: 16px; color: var(--muted); text-transform: uppercase;
    letter-spacing: 0.06em; margin: 0 0 12px 0;
    border-bottom: 1px solid var(--border); padding-bottom: 6px;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden; position: relative; display: flex; flex-direction: column;
  }
  .card .img-wrap { position: relative; aspect-ratio: 1/1; background: #000; }
  .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card .img-wrap .spinner {
    position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.7); color: var(--text); font-size: 14px;
  }
  .card.busy .img-wrap .spinner { display: flex; }
  .card.busy { opacity: 0.85; }
  .card.busy img { filter: blur(2px); }
  .badge {
    position: absolute; top: 8px; right: 8px;
    padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .badge.pending { background: #444; color: #ccc; }
  .badge.approved { background: var(--green); color: #061; }
  .badge.tweaked { background: var(--yellow); color: #3a2a00; }
  .badge.rejected { background: var(--red); color: #4a0000; }
  .card .body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .card h3 { margin: 0; font-size: 15px; }
  .card .meta { color: var(--muted); font-size: 12px; }
  .variants {
    display: flex; gap: 6px; flex-wrap: wrap; padding: 4px 0;
  }
  .variant-thumb {
    position: relative; width: 56px; height: 56px; border-radius: 6px;
    overflow: hidden; cursor: pointer; padding: 0; background: var(--chip);
    border: 2px solid var(--border); flex-shrink: 0;
  }
  .variant-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .variant-thumb:hover { border-color: var(--muted); }
  .variant-thumb.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .variant-thumb .vn {
    position: absolute; top: 0; left: 0; background: rgba(0,0,0,0.65); color: #fff;
    font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 0 0 4px 0;
    line-height: 1.2;
  }
  .variant-thumb .vdot {
    position: absolute; bottom: 2px; right: 2px; width: 10px; height: 10px;
    border-radius: 50%; background: #888; border: 1.5px solid #000;
  }
  .variant-thumb.d-approved .vdot { background: var(--green); }
  .variant-thumb.d-tweaked .vdot { background: var(--yellow); }
  .variant-thumb.d-rejected .vdot { background: var(--red); }
  .actions { display: flex; gap: 6px; }
  button {
    flex: 1; padding: 7px 10px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--border); background: var(--panel-2); color: var(--text);
    font-size: 13px; font-weight: 600;
  }
  button:hover { filter: brightness(1.15); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button.approve { background: var(--green); color: #021; border-color: var(--green); }
  button.tweak { background: var(--yellow); color: #210; border-color: var(--yellow); }
  button.reject { background: var(--red); color: #200; border-color: var(--red); }
  .feedback-form { display: none; flex-direction: column; gap: 6px; }
  .feedback-form.show { display: flex; }
  .feedback-form textarea {
    width: 100%; min-height: 60px; background: var(--panel-2); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; padding: 6px; font-family: inherit; font-size: 12px;
    resize: vertical;
  }
  .feedback-form .form-actions { display: flex; gap: 6px; }
  .feedback-form button { font-size: 12px; padding: 5px 8px; }
  details { font-size: 12px; }
  details summary { cursor: pointer; color: var(--muted); padding: 4px 0; }
  details[open] summary { color: var(--text); }
  .facts { background: var(--panel-2); border-radius: 4px; padding: 8px; margin-top: 4px; }
  .facts dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
  .facts dt { color: var(--muted); font-weight: 600; }
  .facts dd { margin: 0; word-break: break-word; }
  .facts h4 { margin: 8px 0 4px 0; font-size: 12px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; }
  .facts h4:first-child { margin-top: 0; }
  .feedback-history { font-size: 11px; color: var(--muted); margin-top: 4px; padding: 4px 6px; background: rgba(110,168,255,0.07); border-left: 2px solid var(--accent); border-radius: 0 4px 4px 0; }
  .toast {
    position: fixed; bottom: 20px; right: 20px;
    background: var(--panel-2); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 12px 16px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    transition: opacity 0.3s; opacity: 0;
  }
  .toast.show { opacity: 1; }
  .toast.error { border-color: var(--red); }
  .empty { color: var(--muted); text-align: center; padding: 40px; }
</style>
</head>
<body>
<header>
  <h1>Station Cover Review</h1>
  <span class="progress" id="progress">loading…</span>
  <div class="filters" id="filters"></div>
</header>
<main id="root"><div class="empty">Loading…</div></main>
<div class="toast" id="toast"></div>

<script>
const state = { stations: [], filter: null };

function $(sel, root=document) { return root.querySelector(sel); }
function $$(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}

function toast(msg, isError=false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 3500);
}

function activeVariant(station) {
  if (!station || !station.decision) return null;
  const d = station.decision;
  return d.variants.find(v => v.n === d.activeVariant) || null;
}

function stationStatus(station) {
  const av = activeVariant(station);
  if (!av) return 'pending';
  return av.decision || 'pending';
}

function renderProgress() {
  const total = state.stations.length;
  const approved = state.stations.filter(s => stationStatus(s) === 'approved').length;
  const pending = state.stations.filter(s => stationStatus(s) === 'pending').length;
  $('#progress').textContent =
    approved + '/' + total + ' approved · ' + pending + ' pending';
}

function renderFilters() {
  const byGenre = {};
  for (const s of state.stations) {
    if (!byGenre[s.genreId]) byGenre[s.genreId] = { name: s.genreName, count: 0, approved: 0 };
    byGenre[s.genreId].count++;
    if (stationStatus(s) === 'approved') byGenre[s.genreId].approved++;
  }
  const el = $('#filters');
  const chips = [\`<button class="chip \${state.filter === null ? 'active' : ''}" data-g="">All</button>\`];
  for (const [id, g] of Object.entries(byGenre)) {
    chips.push(
      \`<button class="chip \${state.filter === id ? 'active' : ''}" data-g="\${esc(id)}">\` +
      \`\${esc(g.name)} (\${g.approved}/\${g.count})</button>\`
    );
  }
  el.innerHTML = chips.join('');
  el.querySelectorAll('button.chip').forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.g || null;
    renderFilters();
    renderGrid();
  }));
}

function renderFacts(station) {
  const r = station.research || {};
  const av = activeVariant(station);
  const c = av ? av.concept || {} : {};
  const p = av ? av.prompt || {} : {};
  const list = (arr) => Array.isArray(arr) ? arr.join(', ') : (arr || '');
  return \`
    <div class="facts">
      <h4>Research</h4>
      <dl>
        <dt>summary</dt><dd>\${esc(r.oneLineSummary || '')}</dd>
        <dt>era</dt><dd>\${esc(r.era || '')}</dd>
        <dt>region</dt><dd>\${esc(r.region || '')}</dd>
        <dt>sonic vibe</dt><dd>\${esc(r.sonicVibe || '')}</dd>
        <dt>fashion</dt><dd>\${esc(list(r.fashion))}</dd>
        <dt>instruments</dt><dd>\${esc(list(r.instruments))}</dd>
        <dt>venues</dt><dd>\${esc(list(r.venues))}</dd>
        <dt>art styles</dt><dd>\${esc(list(r.artStyles))}</dd>
        <dt>cultural symbols</dt><dd>\${esc(list(r.culturalSymbols))}</dd>
        <dt>linguistic</dt><dd>\${esc(list(r.linguisticTouchstones))}</dd>
        <dt>differentiator</dt><dd>\${esc(r.differentiator || '')}</dd>
      </dl>
      <h4>Concept (active variant)</h4>
      <dl>
        <dt>imagery focus</dt><dd>\${esc(c.imageryFocus || '')}</dd>
        <dt>aesthetic</dt><dd>\${esc(c.aesthetic || '')}</dd>
        <dt>composition</dt><dd>\${esc(c.composition || '')}</dd>
        <dt>palette</dt><dd>\${esc(list(c.paletteHint))}</dd>
        <dt>subject</dt><dd>\${esc(c.subject || '')}</dd>
        <dt>rationale</dt><dd>\${esc(c.rationale || '')}</dd>
      </dl>
      <h4>Image Prompt (active variant)</h4>
      <dl>
        <dt>prompt</dt><dd>\${esc(p.prompt || '')}</dd>
        <dt>negative</dt><dd>\${esc(p.negativePrompt || '')}</dd>
        <dt>style seed</dt><dd>\${esc(p.styleSeed || '')}</dd>
        <dt>source elements</dt><dd>\${esc(list(p.sourceElements))}</dd>
      </dl>
    </div>
  \`;
}

function renderCard(station) {
  const av = activeVariant(station);
  const status = stationStatus(station);
  const d = station.decision;
  const variants = d ? d.variants : [];
  const cacheBust = av ? \`?t=\${Date.parse(av.createdAt || '') || ''}\` : '';
  const imgSrc = av
    ? \`/api/dev/review-covers/image/\${encodeURIComponent(station.genreId)}/\${encodeURIComponent(station.stationId)}/\${av.n}\${cacheBust}\`
    : '';
  const variantChips = variants.map(v => {
    const cls = [
      'variant-thumb',
      v.n === d.activeVariant ? 'active' : '',
      v.decision ? 'd-' + v.decision : ''
    ].filter(Boolean).join(' ');
    const thumbSrc = \`/api/dev/review-covers/image/\${encodeURIComponent(station.genreId)}/\${encodeURIComponent(station.stationId)}/\${v.n}\`;
    const tip = [
      'v' + v.n,
      v.decision || 'pending',
      v.regenType !== 'initial' ? '(' + v.regenType + ')' : '',
      v.feedback ? '\\u2014 ' + v.feedback : ''
    ].filter(Boolean).join(' ');
    return \`<button class="\${cls}" data-action="set-active" data-v="\${v.n}" title="\${esc(tip)}"><img src="\${thumbSrc}" alt="v\${v.n}" loading="lazy" /><span class="vn">v\${v.n}</span><span class="vdot"></span></button>\`;
  }).join('');
  const feedbackHistory = av && av.feedback
    ? \`<div class="feedback-history"><b>\${esc(av.regenType)}:</b> \${esc(av.feedback)}</div>\`
    : '';
  return \`
    <div class="card" data-key="\${esc(station.key)}" id="card-\${esc(station.key.replace('/','-'))}">
      <div class="img-wrap">
        \${imgSrc ? \`<img src="\${imgSrc}" alt="\${esc(station.stationName)}" />\` : '<div style="color:#666;text-align:center;padding-top:40%">no image</div>'}
        <div class="spinner">regenerating…</div>
        <span class="badge \${status}">\${status}</span>
      </div>
      <div class="body">
        <h3>\${esc(station.stationName)}</h3>
        <div class="meta">\${esc(station.genreName)} · \${esc(station.stationId)}</div>
        \${variants.length ? \`<div class="variants">\${variantChips}</div>\` : ''}
        \${feedbackHistory}
        <div class="actions">
          <button class="approve" data-action="approve">Approve</button>
          <button class="tweak" data-action="show-tweak">Tweak</button>
          <button class="reject" data-action="show-reject">Reject</button>
        </div>
        <div class="feedback-form" data-form="tweak">
          <textarea placeholder="What should change? (required for tweak)"></textarea>
          <div class="form-actions">
            <button data-action="submit-tweak">Regenerate prompt + image</button>
            <button data-action="cancel-form">Cancel</button>
          </div>
        </div>
        <div class="feedback-form" data-form="reject">
          <textarea placeholder="Optional: direction for the new variant (leave blank to let the AI pick a different angle)"></textarea>
          <div class="form-actions">
            <button data-action="submit-reject">Generate new variant</button>
            <button data-action="cancel-form">Cancel</button>
          </div>
        </div>
        <details>
          <summary>Facts (research · concept · prompt)</summary>
          \${renderFacts(station)}
        </details>
      </div>
    </div>
  \`;
}

function renderGrid() {
  const root = $('#root');
  const filtered = state.filter
    ? state.stations.filter(s => s.genreId === state.filter)
    : state.stations;
  if (filtered.length === 0) {
    root.innerHTML = '<div class="empty">No stations match this filter.</div>';
    return;
  }
  const byGenre = {};
  for (const s of filtered) {
    if (!byGenre[s.genreId]) byGenre[s.genreId] = { name: s.genreName, stations: [] };
    byGenre[s.genreId].stations.push(s);
  }
  const html = Object.entries(byGenre).map(([gid, g]) => \`
    <section class="genre-section">
      <h2>\${esc(g.name)}</h2>
      <div class="grid">\${g.stations.map(renderCard).join('')}</div>
    </section>
  \`).join('');
  root.innerHTML = html;
  wireCardEvents(root);
  renderProgress();
}

function wireCardEvents(root) {
  root.querySelectorAll('.card').forEach(card => {
    const key = card.dataset.key;
    card.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'approve') return doDecision(key, 'approve');
      if (action === 'show-tweak') return toggleForm(card, 'tweak');
      if (action === 'show-reject') return toggleForm(card, 'reject');
      if (action === 'cancel-form') return hideForms(card);
      if (action === 'submit-tweak') {
        const txt = card.querySelector('[data-form="tweak"] textarea').value.trim();
        if (!txt) { toast('Tweak needs feedback text.', true); return; }
        return doDecision(key, 'tweak', { feedback: txt });
      }
      if (action === 'submit-reject') {
        const txt = card.querySelector('[data-form="reject"] textarea').value.trim();
        return doDecision(key, 'reject', { direction: txt || undefined });
      }
      if (action === 'set-active') {
        const v = Number(btn.dataset.v);
        return doSetActive(key, v);
      }
    });
  });
}

function toggleForm(card, which) {
  card.querySelectorAll('.feedback-form').forEach(f => {
    f.classList.toggle('show', f.dataset.form === which);
  });
}
function hideForms(card) {
  card.querySelectorAll('.feedback-form').forEach(f => f.classList.remove('show'));
}

// Per-station in-flight tracking — prevents duplicate POSTs when the
// user double-clicks before the first request resolves. The server
// also enforces a regen lock (returns 409) as belt-and-suspenders;
// this just keeps the UX clean by never firing the second request at
// all when we know one is already running.
const inFlightKeys = new Set();

async function doDecision(key, decision, extra={}) {
  if (inFlightKeys.has(key)) {
    toast(\`\${key} is already busy — wait for the current regen to finish\`, true);
    return;
  }
  const [genreId, stationId] = key.split('/');
  const card = document.querySelector(\`.card[data-key="\${CSS.escape(key)}"]\`);
  if (decision !== 'approve') card.classList.add('busy');
  card.querySelectorAll('button').forEach(b => b.disabled = true);
  inFlightKeys.add(key);
  try {
    const res = await fetch('/api/dev/review-covers/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ genreId, stationId, decision, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    // Replace this station in state and re-render just this card
    const stIdx = state.stations.findIndex(s => s.key === key);
    state.stations[stIdx].decision = data.station;
    rerenderCard(key);
    toast(\`\${decision} done for \${stationId}\`);
  } catch (err) {
    toast(\`\${decision} failed: \${err.message}\`, true);
    console.error(err);
    card.classList.remove('busy');
    card.querySelectorAll('button').forEach(b => b.disabled = false);
  } finally {
    inFlightKeys.delete(key);
  }
}

async function doSetActive(key, variant) {
  if (inFlightKeys.has(key)) {
    toast(\`\${key} is busy — wait for the current regen to finish\`, true);
    return;
  }
  const [genreId, stationId] = key.split('/');
  const card = document.querySelector(\`.card[data-key="\${CSS.escape(key)}"]\`);
  card.querySelectorAll('button').forEach(b => b.disabled = true);
  inFlightKeys.add(key);
  try {
    const res = await fetch('/api/dev/review-covers/set-active', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ genreId, stationId, variant }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    const stIdx = state.stations.findIndex(s => s.key === key);
    state.stations[stIdx].decision = data.station;
    rerenderCard(key);
    toast(\`v\${variant} active for \${stationId}\`);
  } catch (err) {
    toast(\`set-active failed: \${err.message}\`, true);
    card.querySelectorAll('button').forEach(b => b.disabled = false);
  } finally {
    inFlightKeys.delete(key);
  }
}

function rerenderCard(key) {
  const card = document.querySelector(\`.card[data-key="\${CSS.escape(key)}"]\`);
  if (!card) return renderGrid();
  const station = state.stations.find(s => s.key === key);
  const wrap = document.createElement('div');
  wrap.innerHTML = renderCard(station);
  const fresh = wrap.firstElementChild;
  card.replaceWith(fresh);
  wireCardEvents(fresh.parentElement);
  renderProgress();
  // Re-render the filter chips because per-genre counts may have changed
  renderFilters();
}

async function load() {
  try {
    const res = await fetch('/api/dev/review-covers/state');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    state.stations = data.stations;
    renderFilters();
    renderGrid();
  } catch (err) {
    $('#root').innerHTML = \`<div class="empty">Failed to load: \${esc(err.message)}</div>\`;
  }
}

load();
</script>
</body>
</html>`
}

module.exports = router
