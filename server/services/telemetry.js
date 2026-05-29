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
    client.trackEvent({ name, properties, measurements })
  } catch (_) {
    /* never throw from telemetry */
  }
}

function trackException(error, properties = {}) {
  if (!client) return
  try {
    const exception = error instanceof Error ? error : new Error(String(error))
    client.trackException({ exception, properties })
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
      properties,
    })
  } catch (_) {
    /* noop */
  }
}

function trackMetric(name, value, properties = {}) {
  if (!client) return
  try {
    client.trackMetric({ name, value, properties })
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
}
