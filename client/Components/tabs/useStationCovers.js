import React from "react"

/**
 * Tiny module-level cache + React hook for the station-cover map.
 *
 * The server exposes `GET /api/stations/covers` (see
 * `server/routes/stations.js`), which returns a flat
 * `{ "<genreId>/<stationId>": "/images/...png" | null }` map. The
 * payload is small enough (~200 short strings) that we fetch it
 * unconditionally on first mount and reuse it for the lifetime of
 * the tab.
 *
 * Why a module-level cache (instead of redux or React Query):
 *   - We deliberately *don't* want every `StationCard` / browse tile
 *     to fire its own request. Pulling the whole map once on first
 *     subscribe and broadcasting to subscribers is the cheapest
 *     possible coordination.
 *   - The data is read-only and process-scoped; there's no merge,
 *     invalidation, or auth dimension to worry about. Redux would
 *     just be ceremony.
 *
 * The hook returns `{ covers, ready, error }`:
 *   - `covers` is the map (always defined; empty `{}` before the
 *     first fetch resolves so callers can do `covers[key]` safely).
 *   - `ready` flips true once the fetch finishes (success OR error)
 *     so cards can decide whether to render a skeleton vs. fall back
 *     to the gradient.
 *   - `error` is the truthy error message if the fetch failed, so
 *     dev tooling and tests can surface it. Production UI doesn't
 *     show it — cards just gradient-fall-back.
 */

// Module-scoped state: shared across every consumer of the hook.
let cachedCovers = null
let inflight = null
let cachedError = null
const listeners = new Set()

function notify() {
  for (const fn of listeners) fn()
}

async function fetchCovers() {
  if (cachedCovers || inflight) return inflight || Promise.resolve(cachedCovers)
  inflight = (async () => {
    try {
      const res = await fetch("/api/stations/covers", { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      cachedCovers = body?.covers || {}
      cachedError = null
    } catch (err) {
      cachedCovers = {}
      cachedError = err?.message || String(err)
    } finally {
      inflight = null
      notify()
    }
    return cachedCovers
  })()
  return inflight
}

/**
 * Subscribe to the cover map. The first caller triggers the fetch;
 * everyone else piggybacks on the same promise.
 */
export function useStationCovers() {
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    const onChange = () => setTick((n) => n + 1)
    listeners.add(onChange)
    // Kick off the fetch if no one has yet.
    if (!cachedCovers && !inflight) {
      fetchCovers()
    }
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  return {
    covers: cachedCovers || {},
    ready: cachedCovers !== null,
    error: cachedError,
  }
}

/**
 * Helper to look up a single cover image descriptor. Returns `null`
 * if the map hasn't loaded yet OR if no cover is resolved for that
 * station. Callers should treat both cases as "show the gradient
 * fallback".
 *
 * The returned value is an image descriptor object compatible with
 * `client/lib/image.js` (getImageSources/getImageUrl) — `{ src,
 * thumb?: {webp, jpg}, full?: {webp, jpg} }` — or null. Older code
 * passing the result directly as `<img src>` still works via the
 * `src` field acting as a string-coercion fallback when consumers
 * call `getImageUrl(...)`.
 */
export function getStationCover(covers, { genreId, stationId }) {
  if (!covers || !genreId || !stationId) return null
  return covers[`${genreId}/${stationId}`] || null
}
