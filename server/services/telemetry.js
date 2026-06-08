/**
 * Application Insights bootstrap + thin event-tracking facade.
 *
 * MUST be required FIRST in server/index.js (before any other require)
 * so the SDK can hook outgoing HTTP, Postgres, console, etc.
 *
 * `track*` helpers no-op when APPLICATIONINSIGHTS_CONNECTION_STRING is
 * unset, so local dev without an Azure account just works — events
 * are dropped, the calling code is otherwise unchanged.
 *
 *   trackEvent('session.start', { seedType, djId, latencyMs })
 *   trackException(err, { route: '/api/sessions/start' })
 *   trackDependency('gemini', 'tts.synthesize', durationMs, success)
 */

const connStr = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING

let client = null
let started = false

// Tagged on every event so prod can be filtered out from local
// dogfooding when the connection string is set in both. Lazily
// resolved (not cached) so tests can override via env.
function getEnvironment() {
  return process.env.NODE_ENV || 'unknown'
}

// Per-request ambient context (listenSessionId, requestId, userIdHash).
// Populated by middleware in server/app.js via `runWithContext`, read
// transparently by trackEvent/trackException/trackDependency so route
// and service code doesn't have to thread the IDs through every call.
const { AsyncLocalStorage } = require('node:async_hooks')
const als = new AsyncLocalStorage()

function runWithContext(ctx, fn) {
  return als.run({ ...(ctx || {}) }, fn)
}

function getContext() {
  return als.getStore() || {}
}

function mergeContext(properties) {
  const ctx = getContext()
  // Ambient context first (listenSessionId, requestId, userIdHash),
  // environment always-on, caller-supplied props win.
  return { environment: getEnvironment(), ...ctx, ...(properties || {}) }
}

if (connStr) {
  try {
    const appInsights = require('applicationinsights')
    appInsights
      .setup(connStr)
      .setAutoCollectConsole(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectRequests(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectPerformance(true, true)
      .setSendLiveMetrics(true)
      .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
      .start()
    client = appInsights.defaultClient
    client.context.tags[client.context.keys.cloudRole] = 'spotifai-web'
    // Stamp `environment` on every envelope — including auto-collected
    // requests / dependencies / exceptions that don't pass through our
    // trackEvent wrapper. Also opportunistically merges any ALS
    // context (requestId / listenSessionId / userIdHash) so trace and
    // dependency spans line up with our custom events.
    client.addTelemetryProcessor((envelope) => {
      try {
        const data = envelope?.data?.baseData
        if (!data) return true
        data.properties = data.properties || {}
        if (!data.properties.environment) {
          data.properties.environment = getEnvironment()
        }
        const ctx = getContext()
        for (const key of ['requestId', 'listenSessionId', 'userIdHash']) {
          if (!data.properties[key] && ctx[key]) {
            data.properties[key] = ctx[key]
          }
        }
      } catch (_) {
        /* never break telemetry processing */
      }
      return true
    })
    started = true
  } catch (err) {
    // Surface the bootstrap failure but don't crash the server.
    // eslint-disable-next-line no-console
    console.error('App Insights bootstrap failed:', err)
  }
}

function trackEvent(name, properties = {}, measurements = undefined) {
  if (!client) return
  try {
    client.trackEvent({ name, properties: mergeContext(properties), measurements })
  } catch (_) {
    /* never throw from telemetry */
  }
}

function trackException(error, properties = {}) {
  if (!client) return
  try {
    const exception = error instanceof Error ? error : new Error(String(error))
    client.trackException({ exception, properties: mergeContext(properties) })
  } catch (_) {
    /* noop */
  }
}

function trackDependency(target, name, durationMs, success, properties = {}) {
  if (!client) return
  try {
    client.trackDependency({
      target,
      name,
      duration: durationMs,
      resultCode: success ? 0 : 1,
      success,
      dependencyTypeName: 'HTTP',
      properties: mergeContext(properties),
    })
  } catch (_) {
    /* noop */
  }
}

function trackMetric(name, value, properties = {}) {
  if (!client) return
  try {
    client.trackMetric({ name, value, properties: mergeContext(properties) })
  } catch (_) {
    /* noop */
  }
}

// Wrap an async function so its duration + outcome become a dependency
// event automatically. Usage:
//   const result = await withDependency('gemini', 'llm.invoke', { model }, () => doIt())
async function withDependency(target, name, properties, fn) {
  const start = Date.now()
  try {
    const result = await fn()
    trackDependency(target, name, Date.now() - start, true, properties)
    return result
  } catch (err) {
    trackDependency(target, name, Date.now() - start, false, {
      ...properties,
      error: err?.message || String(err),
    })
    throw err
  }
}

module.exports = {
  client,
  enabled: started,
  trackEvent,
  trackException,
  trackDependency,
  trackMetric,
  withDependency,
  runWithContext,
  getContext,
}
