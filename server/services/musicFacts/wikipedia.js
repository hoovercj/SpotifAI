/**
 * Wikipedia REST API lookup: narrative facts about a song/album/artist.
 *
 * Two passes per query:
 *   1. Search via the OpenSearch API to resolve a free-form
 *      "<song> (song)" / "<artist> (band)" string to a canonical page title.
 *   2. Fetch the page summary via the REST `/page/summary/{title}` endpoint.
 *
 * Returns `{ source: "wikipedia", title, extract, url }` or `null` on
 * any failure. Caches results per (kind, query) in-memory for the run.
 *
 * Docs:
 *   https://en.wikipedia.org/api/rest_v1/
 *   https://www.mediawiki.org/wiki/API:Opensearch
 */
'use strict'

const logger = require('../logger')

const USER_AGENT =
  process.env.WIKIPEDIA_USER_AGENT ||
  'SpotifAI/0.1 (+https://github.com/hoovercj/SpotifAI)'

const cap = 256
const cache = new Map()
function cacheGet(key) {
  if (!cache.has(key)) return undefined
  const v = cache.get(key)
  cache.delete(key)
  cache.set(key, v)
  return v
}
function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > cap) {
    const first = cache.keys().next().value
    cache.delete(first)
  }
}

function timeoutSignal(ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms)
  t.unref?.()
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) }
}

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error(`Wikipedia ${res.status} ${res.statusText}`)
  return res.json()
}

async function openSearch(query, { signal } = {}) {
  // Returns [query, titles[], descriptions[], urls[]].
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=3&search=${encodeURIComponent(query)}`
  const res = await fetchJson(url, { signal })
  if (!Array.isArray(res) || !Array.isArray(res[1])) return []
  return res[1] // titles
}

async function summarize(title, { signal } = {}) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const res = await fetchJson(url, { signal })
  return res || null
}

/**
 * Decide whether a Wikipedia summary is actually about the thing we
 * asked for. OpenSearch is happy to return loosely-related articles
 * (e.g. "Andrew Burnaby" for "Burna Boy", or a different album with a
 * similar title), and we'd rather return nothing than poison the DJ
 * with a wrong-artist biography.
 *
 * For artist lookups: the article must mention musician/band/singer
 * vocabulary AND contain the artist name in its title or extract.
 * For song/album lookups: the article extract must mention either the
 * artist (if provided) or be tagged as a song/album in its description.
 */
function isRelevant(summary, { kind, title, artist }) {
  const ext = String(summary?.extract || '').toLowerCase()
  const desc = String(summary?.description || '').toLowerCase()
  const pageTitle = String(summary?.title || '').toLowerCase()
  const wantedTitle = String(title || '').toLowerCase().trim()
  const wantedArtist = String(artist || '').toLowerCase().trim()

  if (kind === 'artist') {
    // Page must look like it's about a musical act and reference the name.
    const musicalCue =
      /\b(singer|band|musician|rapper|producer|songwriter|vocalist|group|duo|dj)\b/.test(
        ext
      ) || /\b(musician|band|singer|rapper|group|duo)\b/.test(desc)
    const namedMatch =
      pageTitle.includes(wantedTitle) || ext.includes(wantedTitle)
    return musicalCue && namedMatch
  }

  // song / album
  const musicalCue =
    /\b(song|single|album|track|recorded|released|recording)\b/.test(ext) ||
    /\b(song|single|album)\b/.test(desc)
  // If we have an artist, require the extract to mention them — this
  // is the strongest signal that we picked the right article.
  if (wantedArtist) {
    return musicalCue && ext.includes(wantedArtist)
  }
  return musicalCue
}

/**
 * Look up a narrative fact for a song / album / artist.
 *
 * Searches MediaWiki's OpenSearch first because the REST `summary`
 * endpoint requires an exact title and our inputs are often slightly
 * off (typos, "feat." variants, etc.).
 *
 * @param {object} args
 * @param {"song"|"album"|"artist"} args.kind
 * @param {string} args.title           - Song title (kind=song) or album name (kind=album)
 * @param {string} [args.artist]        - Used to disambiguate songs/albums
 * @returns {Promise<object|null>}
 */
async function lookup({ kind, title, artist } = {}) {
  const t = String(title || '').trim()
  if (!t || !kind) return null
  const key = `${kind}::${(artist || '').toLowerCase()}::${t.toLowerCase()}`
  if (cache.has(key)) return cacheGet(key)

  const { signal, cancel } = timeoutSignal(8000)
  try {
    // Build a few candidate queries — most specific first. Wikipedia
    // disambig pages use parenthetical hints ("Yesterday (Beatles song)").
    const candidates = []
    if (artist) {
      candidates.push(`${t} (${artist} song)`)
      if (kind === 'album') candidates.push(`${t} (${artist} album)`)
      candidates.push(`${t} ${artist}`)
    }
    if (kind === 'song') candidates.push(`${t} (song)`)
    if (kind === 'album') candidates.push(`${t} (album)`)
    if (kind === 'artist') {
      candidates.push(`${t} (band)`)
      candidates.push(`${t} (musician)`)
    }
    candidates.push(t)

    let chosenTitle = null
    let chosenSummary = null
    for (const q of candidates) {
      const titles = await openSearch(q, { signal })
      if (!titles.length) continue
      // Try each title until one returns a non-disambiguation page
      // AND looks relevant to what we asked for. OpenSearch is greedy
      // — it'll happily return "Andrew Burnaby" (an 18th-century
      // clergyman) for a Wikipedia lookup of artist "Burna Boy". We
      // filter by requiring the article extract to mention either
      // the artist (for any kind) or the title (for song/album).
      for (const candidate of titles) {
        try {
          const s = await summarize(candidate, { signal })
          if (!s?.extract) continue
          if (s?.type === 'disambiguation') continue
          if (!isRelevant(s, { kind, title: t, artist })) continue
          chosenTitle = s.title || candidate
          chosenSummary = s
          break
        } catch (_) {
          continue
        }
      }
      if (chosenSummary) break
    }

    if (!chosenSummary) {
      cacheSet(key, null)
      return null
    }

    const out = {
      source: 'wikipedia',
      title: chosenTitle,
      extract: chosenSummary.extract || '',
      url:
        chosenSummary?.content_urls?.desktop?.page ||
        chosenSummary?.content_urls?.mobile?.page ||
        null,
    }
    cacheSet(key, out)
    return out
  } catch (err) {
    cacheSet(key, null)
    if (process.env.DEBUG) {
      logger.warn({ err: err?.message, kind, term: t }, 'musicFacts.wikipedia.lookup_failed')
    }
    return null
  } finally {
    cancel()
  }
}

module.exports = { lookup }
