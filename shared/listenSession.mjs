/**
 * Shared listen-session id helpers. Imported by both the client (Vite
 * resolves ESM natively) and the server (Node 22.12+ `require()`
 * loads ESM modules synchronously) so the format is defined in
 * exactly one place.
 *
 * Format: RFC 4122 v4 UUID. Generated via `crypto.randomUUID()`,
 * which is on `globalThis.crypto` in every browser since 2022 and
 * Node 19+.
 */

export const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidListenSessionId(id) {
  return typeof id === 'string' && UUID_V4_RE.test(id)
}

export function generateListenSessionId() {
  return globalThis.crypto.randomUUID()
}
