/**
 * Per-tab listening-session correlation id.
 *
 * Lives in `sessionStorage` so a refresh keeps the same id (the user is
 * still in the same listening session) but a new tab gets a fresh one.
 * Stamped on every client telemetry envelope and forwarded to the
 * server via the `X-Listen-Session-Id` header on /api/* calls so a
 * single Kusto query can join client + server activity for one
 * playback session.
 *
 * Format (UUID v4) + generation are defined in `shared/listenSession.js`
 * so the server enforces the same contract.
 */

import {
  generateListenSessionId,
  isValidListenSessionId,
} from "../../shared/listenSession.mjs"

const STORAGE_KEY = "spotifai_listen_session_id"

let cached = null

export function getListenSessionId() {
  if (cached) return cached
  if (typeof window === "undefined") {
    cached = generateListenSessionId()
    return cached
  }
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY)
    if (isValidListenSessionId(existing)) {
      cached = existing
      return cached
    }
    cached = generateListenSessionId()
    window.sessionStorage.setItem(STORAGE_KEY, cached)
    return cached
  } catch {
    cached = cached || generateListenSessionId()
    return cached
  }
}

export function resetListenSessionId() {
  cached = generateListenSessionId()
  if (typeof window === "undefined") return cached
  try {
    window.sessionStorage.setItem(STORAGE_KEY, cached)
  } catch {
    /* noop */
  }
  return cached
}
