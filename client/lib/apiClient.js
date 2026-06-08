/**
 * Adds the `X-Listen-Session-Id` header to every same-origin /api/*
 * request from the client — axios via interceptor, native fetch via a
 * one-time wrapper. The server reads the header in `server/app.js` and
 * stamps it on Pino logs and App Insights events so client + server
 * activity for a single playback session can be correlated.
 *
 * Wrapping global fetch is intentional: the player and several store
 * thunks call `fetch` directly, and threading the header through every
 * call site would be invasive. The wrapper only touches relative URLs
 * starting with `/api/` so external requests (Spotify CDN, etc.) are
 * left alone.
 */

import axios from "axios"
import { getListenSessionId } from "./listenSession"

const HEADER = "X-Listen-Session-Id"

let installed = false

function isApiUrl(url) {
  if (typeof url !== "string" || !url) return false
  // Same-origin /api/* only: cross-origin calls would trigger a CORS
  // preflight for this non-safelisted header, and only our server
  // reads it.
  return url.startsWith("/api/") || url === "/api"
}

export function installApiClientHeaders() {
  if (installed) return
  installed = true

  axios.interceptors.request.use((config) => {
    if (isApiUrl(config.url)) {
      config.headers = config.headers || {}
      config.headers[HEADER] = getListenSessionId()
    }
    return config
  })

  if (typeof window === "undefined" || typeof window.fetch !== "function") return
  const orig = window.fetch.bind(window)
  window.fetch = (input, init) => {
    try {
      const url = typeof input === "string" ? input : input?.url
      if (isApiUrl(url)) {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        )
        headers.set(HEADER, getListenSessionId())
        init = { ...(init || {}), headers }
      }
    } catch {
      /* never break fetch */
    }
    return orig(input, init)
  }
}
