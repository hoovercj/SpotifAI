/**
 * Coarse IP-based geolocation for the current request.
 *
 * Uses ip-api.com — free tier, no key, ~45 req/min/source-IP cap.
 * That's plenty: with our 6h per-IP cache, a single user's listening
 * session costs one upstream call. Result: `{ lat, long, city,
 * region, country, timezone }` or null when geocoding is unavailable
 * / fails / the IP is private.
 *
 * If we outgrow the free tier we can swap to MaxMind GeoLite2
 * (self-hosted) or another paid provider.
 *
 * Caching: simple in-memory LRU keyed on the source IP. The cache is
 * per-process so each App Service instance pays its own first miss
 * after a restart — acceptable.
 *
 * Privacy: we never log the raw IP and never persist anything to the
 * DB. Only the derived region (already coarse — city/region/country)
 * is forwarded to downstream services that need it.
 */

const axios = require('axios')
const logger = require('./logger')
const { trackException } = require('./telemetry')

const BASE_URL = 'http://ip-api.com/json'

// Cache lookups for 6h. Per-IP TTL is more than enough — even a
// 30-minute listening session for a mobile user on a flaky connection
// will rarely roll IPs. Bounded LRU keeps memory flat.
const TTL_MS = 6 * 60 * 60 * 1000
const MAX_ENTRIES = 5000
const cache = new Map()

function cacheGet(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.t > TTL_MS) {
    cache.delete(key)
    return null
  }
  // Bump for LRU semantics.
  cache.delete(key)
  cache.set(key, entry)
  return entry.v
}

function cacheSet(key, value) {
  if (cache.size >= MAX_ENTRIES) {
    // Drop the oldest (first inserted).
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { v: value, t: Date.now() })
}

function isPrivateOrLocal(ip) {
  if (!ip) return true
  // IPv4 loopback / private ranges; IPv6 loopback + link-local + ULA.
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith('169.254.') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80:')
  )
}

/**
 * Normalize req.ip — Express may return an IPv6-mapped IPv4 like
 * `::ffff:1.2.3.4` or include a port suffix on the forwarded header.
 */
function normalizeIp(ip) {
  if (!ip) return null
  let out = String(ip).trim()
  // Strip port if present (`1.2.3.4:5678`).
  const portIdx = out.lastIndexOf(':')
  if (portIdx > -1 && out.indexOf(':') === portIdx && /^\d+$/.test(out.slice(portIdx + 1))) {
    out = out.slice(0, portIdx)
  }
  // Strip IPv6-mapped IPv4 prefix.
  if (out.startsWith('::ffff:')) out = out.slice(7)
  return out
}

/**
 * Look up coarse location for the given IP. Returns null on any failure
 * (private IP, network error, no result) — callers should treat null
 * as "no location available" and degrade gracefully.
 */
async function ipGeo(rawIp) {
  const ip = normalizeIp(rawIp)
  if (!ip || isPrivateOrLocal(ip)) return null

  const cached = cacheGet(ip)
  if (cached !== null) return cached === 'NEGATIVE' ? null : cached

  try {
    const { data } = await axios.get(`${BASE_URL}/${encodeURIComponent(ip)}`, {
      params: { fields: 'status,country,countryCode,region,regionName,city,lat,lon,timezone' },
      timeout: 5000,
    })
    if (!data || data.status !== 'success' || data.lat == null || data.lon == null) {
      cacheSet(ip, 'NEGATIVE')
      return null
    }
    const loc = {
      lat: Number(data.lat),
      long: Number(data.lon),
      city: data.city || null,
      region: data.regionName || data.region || null,
      country: data.countryCode || data.country || null,
      timezone: data.timezone || null,
    }
    cacheSet(ip, loc)
    return loc
  } catch (err) {
    logger.warn(
      { err: err?.message, status: err?.response?.status },
      'ipGeo.lookup_failed'
    )
    trackException(err, {
      route: 'services/ipGeo',
      status: err?.response?.status ?? null,
    })
    cacheSet(ip, 'NEGATIVE')
    return null
  }
}

module.exports = { ipGeo, normalizeIp, isPrivateOrLocal }
