/**
 * Client-side Application Insights bootstrap + helpers.
 *
 * Reads connection string from `VITE_APPINSIGHTS_CONNECTION_STRING`
 * (injected at build time by vite.config.mjs's `define` block) or the
 * runtime-injected `window.__APPINSIGHTS_CONNECTION_STRING__`. When
 * neither is set, helpers no-op so local dev without Insights stays
 * silent.
 *
 * Privacy:
 *   - User can opt out by setting `localStorage.spotifai_telemetry =
 *     "off"`; we never bootstrap when that flag is set.
 *   - URL query strings are stripped from page-view tracking via a
 *     telemetry initializer. `?q=...` searches stay out of the
 *     analytics pipeline.
 *   - We never set the email as authUserId; the server hashes it
 *     with HMAC-SHA256 and we forward only the hash via
 *     `setAuthUser(userIdHash)`.
 *
 * Distributed tracing: enabled by default — outbound /api/* calls
 * carry a W3C `traceparent` header that the server picks up and
 * threads through its own outbound requests.
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web"

const OPT_OUT_KEY = "spotifai_telemetry"

let appInsights = null

function getConnectionString() {
  // Build-time injected (compile-time string-literal replacement).
  if (typeof process !== "undefined" && process.env?.VITE_APPINSIGHTS_CONNECTION_STRING) {
    return process.env.VITE_APPINSIGHTS_CONNECTION_STRING
  }
  // Runtime-injected (set by server-rendered HTML in the future, when
  // we want per-env config without rebuilding).
  if (typeof window !== "undefined" && window.__APPINSIGHTS_CONNECTION_STRING__) {
    return window.__APPINSIGHTS_CONNECTION_STRING__
  }
  return null
}

function isOptedOut() {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === "off"
  } catch {
    return false
  }
}

export function setTelemetryOptOut(off) {
  if (typeof window === "undefined") return
  try {
    if (off) {
      window.localStorage.setItem(OPT_OUT_KEY, "off")
    } else {
      window.localStorage.removeItem(OPT_OUT_KEY)
    }
  } catch {
    /* localStorage blocked — quota or incognito */
  }
}

export function isTelemetryOptedOut() {
  return isOptedOut()
}

// Telemetry initializer that scrubs sensitive URL bits before send:
//   - strips query strings on PageView / RemoteDependency / Trace
//   - strips fragments
//   - replaces seed-specific path segments (e.g. /api/sessions/jobs/{jobId})
//     with placeholders for cleaner grouping
function scrubUrl(url) {
  if (!url || typeof url !== "string") return url
  try {
    const u = new URL(url, "http://placeholder.invalid")
    u.search = ""
    u.hash = ""
    // Replace dynamic segments with placeholders so jobs/{id} URLs
    // group into one row instead of N. Best-effort, regex-safe.
    let p = u.pathname
    p = p.replace(/\/jobs\/[^/]+/, "/jobs/{id}")
    p = p.replace(/\/recent\/[^/]+/, "/recent/{seedKey}")
    p = p.replace(/\/dj-characters\/\d+/, "/dj-characters/{id}")
    if (u.host === "placeholder.invalid") return p
    return `${u.origin}${p}`
  } catch {
    return url.split("?")[0].split("#")[0]
  }
}

function attachTelemetryInitializers(ai) {
  ai.addTelemetryInitializer((envelope) => {
    const data = envelope?.baseData
    if (!data) return
    if (typeof data.uri === "string") data.uri = scrubUrl(data.uri)
    if (typeof data.name === "string" && data.name.includes("?")) {
      data.name = scrubUrl(data.name)
    }
    if (typeof data.target === "string") data.target = scrubUrl(data.target)
    // Strip the referrer (also a URL with potential query strings).
    if (data.properties?.refUri) {
      data.properties.refUri = scrubUrl(data.properties.refUri)
    }
  })
}

export function initTelemetry() {
  if (appInsights) return appInsights
  if (isOptedOut()) return null
  const connStr = getConnectionString()
  if (!connStr) return null
  try {
    appInsights = new ApplicationInsights({
      config: {
        connectionString: connStr,
        enableAutoRouteTracking: true,
        enableAjaxErrorStatusText: true,
        // Distributed tracing — adds W3C traceparent to ajax calls
        // matching `correlationHeaderDomains`. Spotify and Scdn are
        // excluded so we don't pollute their CDN with our headers.
        enableCorsCorrelation: true,
        distributedTracingMode: 2, // W3C
        correlationHeaderExcludedDomains: [
          "*.spotify.com",
          "*.scdn.co",
          "sdk.scdn.co",
        ],
        loggingLevelConsole: 0,
        // No automatic auth/account collection — we set this ourselves
        // via setAuthUser() with the server-hashed id.
        accountId: undefined,
        // Disable telemetry that leaks query strings or full URLs by
        // default — our scrubber runs on top of these in case any
        // slip through, but turning the noisier ones off keeps the
        // bill down too.
        disableExceptionTracking: false,
        disableAjaxTracking: false,
      },
    })
    appInsights.loadAppInsights()
    attachTelemetryInitializers(appInsights)
    appInsights.trackPageView()
    return appInsights
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("App Insights init failed:", err)
    return null
  }
}

// Set the authenticated user context using the server-supplied HMAC
// hash of the email. The third arg `true` persists the id in a
// session cookie so subsequent page loads don't have to re-call.
// Idempotent — safe to call on every restoreSession / login.
export function setAuthUser(userIdHash) {
  if (!appInsights || !userIdHash) return
  try {
    appInsights.setAuthenticatedUserContext(userIdHash, undefined, true)
  } catch {
    /* noop */
  }
}

export function clearAuthUser() {
  if (!appInsights) return
  try {
    appInsights.clearAuthenticatedUserContext()
  } catch {
    /* noop */
  }
}

export function track(name, properties = {}, measurements = undefined) {
  if (!appInsights) return
  try {
    appInsights.trackEvent({ name, properties, measurements })
  } catch {
    /* never throw from telemetry */
  }
}

export function trackException(error, properties = {}) {
  if (!appInsights) return
  try {
    appInsights.trackException({
      exception: error instanceof Error ? error : new Error(String(error)),
      properties,
    })
  } catch {
    /* noop */
  }
}

export function getAppInsights() {
  return appInsights
}
