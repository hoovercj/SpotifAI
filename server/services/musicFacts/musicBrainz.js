/**
 * MusicBrainz lookup: structured release metadata for a (track, artist) pair.
 *
 * Free, no API key, polite User-Agent required. We make one search call
 * and pull the top-ranked recording's release-group, year, producer-credit,
 * and label. Results are cached in-memory for the life of the process
 * (`<artist>::<track>` key) — the catalog rarely changes and we never
 * want to hit MusicBrainz multiple times for the same song.
 *
 * Returns `{ source: "musicbrainz", artist, title, releaseGroup?, year?, label?, producer? }`
 * or `null` on any failure (404, network, parse). Never throws — the
 * caller falls back to a generic intro if the lookup fails.
 *
 * Docs: https://musicbrainz.org/doc/MusicBrainz_API
 */
'use strict'

const logger = require('../logger')

const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ||
  'SpotifAI/0.1 (+https://github.com/hoovercj/SpotifAI)'

// MusicBrainz asks for at most 1 req/sec/IP and aggressive caching.
// In-process cache for the run; eviction is by `cap` insertion order.
const cap = 256
const cache = new Map()
function cacheGet(key) {
  if (!cache.has(key)) return undefined
  const v = cache.get(key)
  // refresh LRU
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

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    throw new Error(`MusicBrainz ${res.status} ${res.statusText}`)
  }
  return res.json()
}

function timeoutSignal(ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms)
  t.unref?.()
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) }
}

/**
 * Look up structured metadata for a recording.
 *
 * @param {object} args
 * @param {string} args.artist - Primary artist name (required).
 * @param {string} args.title  - Track title (required).
 * @returns {Promise<object|null>}
 */
async function lookupRecording({ artist, title } = {}) {
  const a = String(artist || '').trim()
  const t = String(title || '').trim()
  if (!a || !t) return null
  const key = `${a.toLowerCase()}::${t.toLowerCase()}`
  if (cache.has(key)) return cacheGet(key)

  // 8s timeout — MusicBrainz can be slow; the caller treats null as
  // "no facts available" so we'd rather degrade than block playback.
  const { signal, cancel } = timeoutSignal(8000)
  try {
    // Search for the recording with includes for release + label + arid.
    // Quotes around fields make the query exact-ish; without them MB falls
    // back to relevance ranking which often picks remixes/covers.
    //
    // We pull 50 candidates and score them client-side because MB's
    // own ranking sorts only by relevance score (all 100 for popular
    // songs) and happily surfaces live recordings, karaoke covers, and
    // recent compilations before the canonical studio recording. The
    // studio original for "Bohemian Rhapsody" sits around position 30+.
    const q = `recording:"${t}" AND artist:"${a}"`
    const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=50`
    const search = await fetchJson(searchUrl, { signal })
    const candidates = search?.recordings || []
    if (!candidates.length) {
      cacheSet(key, null)
      return null
    }

    // Heuristic: the canonical studio recording is (a) credited to the
    // requested artist, (b) the earliest by first-release-date, and
    // (c) usually appears on the most releases (remasters, comps,
    // best-ofs all reuse the same recording entity in MusicBrainz).
    // We use earliest year as the primary key — live and tribute
    // recordings always post-date the studio original.
    const wantedArtist = a.toLowerCase()
    const matchYear = (r) => {
      const date = r['first-release-date']
      if (!date) return null
      const m = String(date).match(/^(\d{4})/)
      return m ? Number(m[1]) : null
    }
    const matchesArtist = (r) =>
      (r['artist-credit'] || []).some(
        (c) => (c?.artist?.name || c?.name || '').toLowerCase() === wantedArtist
      )
    const scored = candidates
      .filter(matchesArtist)
      .map((r) => ({
        r,
        year: matchYear(r) || 9999,
        nReleases: (r.releases || []).length,
      }))
      // Primary: oldest year wins. Tiebreak: most releases (popularity).
      .sort((x, y) => x.year - y.year || y.nReleases - x.nReleases)
    const rec = scored[0]?.r
    if (!rec) {
      cacheSet(key, null)
      return null
    }

    // The search result already gives us release group + first release year.
    // Producers live on the recording's relations — fetch the full
    // recording with `?inc=artist-credits+releases+release-groups+work-rels+artist-rels`.
    const detailUrl = `https://musicbrainz.org/ws/2/recording/${rec.id}?inc=artist-credits+releases+release-groups+artist-rels&fmt=json`
    let detail = null
    try {
      detail = await fetchJson(detailUrl, { signal })
    } catch (_) {
      // If detail fetch fails, fall back to the search payload alone.
      detail = rec
    }

    // Prefer a studio-album release for the release-group label
    // (the recording itself is often attached to dozens of compilations).
    const releases = detail?.releases || rec?.releases || []
    const studioRelease =
      releases.find((rel) => {
        const rg = rel['release-group'] || {}
        return rg['primary-type'] === 'Album' && !(rg['secondary-types'] || []).length
      }) || releases[0] || null

    const releaseGroup =
      studioRelease?.['release-group']?.title ||
      detail?.['release-group']?.title ||
      null
    const year = (() => {
      // Prefer the recording's first-release-date over any specific
      // release date — the latter could be a 1990s remaster of a 1975 song.
      const date =
        detail?.['first-release-date'] ||
        rec?.['first-release-date'] ||
        studioRelease?.['release-group']?.['first-release-date'] ||
        studioRelease?.date ||
        null
      if (!date) return null
      const m = String(date).match(/^(\d{4})/)
      return m ? Number(m[1]) : null
    })()
    const label = studioRelease?.['label-info']?.[0]?.label?.name || null
    const producer = (() => {
      const relations = detail?.relations || []
      const prod = relations.find(
        (r) => r.type === 'producer' && r.artist?.name
      )
      return prod?.artist?.name || null
    })()

    const out = {
      source: 'musicbrainz',
      artist: a,
      title: t,
      releaseGroup,
      year,
      label,
      producer,
    }
    cacheSet(key, out)
    return out
  } catch (err) {
    // Quietly cache the miss for a while so a flaky lookup doesn't get
    // retried on every track of the same artist.
    cacheSet(key, null)
    if (process.env.DEBUG) {
      logger.warn({ err: err?.message, title: t, artist: a }, 'musicFacts.musicBrainz.lookup_failed')
    }
    return null
  } finally {
    cancel()
  }
}

module.exports = { lookupRecording }
