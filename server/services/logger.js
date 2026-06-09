/**
 * Pino structured logger.
 *
 * Single shared root logger; per-request children (with requestId) are
 * attached by the pino-http middleware in server/app.js.
 *
 * In production we emit raw JSON to stdout so App Service forwards it
 * straight into Log Analytics with every field indexed. In development
 * we go through pino-pretty for human-readable colored output.
 *
 * Bridge to App Insights: every `error` and `fatal` log line is
 * automatically forwarded to `trackException()` so route catches that
 * only do `logger.error(...)` still produce an `exceptions` row in App
 * Insights — without callers having to thread the SDK through every
 * file. `warn` is intentionally not bridged (too noisy).
 */

const pino = require('pino')

const isProd = process.env.NODE_ENV === 'production'
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug')

// Lazy-require to avoid the circular dependency between logger.js and
// telemetry.js (telemetry's bootstrap currently logs via console).
let _trackException = null
function getTrackException() {
  if (_trackException) return _trackException
  try {
    ;({ trackException: _trackException } = require('./telemetry'))
  } catch {
    _trackException = () => {}
  }
  return _trackException
}

const logger = pino({
  level,
  base: { service: 'spotifai' },
  // App Insights timestamp parser expects ms epoch; pino's default is fine.
  timestamp: pino.stdTimeFunctions.isoTime,
  hooks: {
    logMethod(args, method, methodLevel) {
      // Pino levels: trace=10, debug=20, info=30, warn=40, error=50, fatal=60.
      if (methodLevel >= 50) {
        try {
          // First arg may be `{ err, stack, requestId, ... }` (our convention)
          // or a string (lazy callers). Second arg is the message in the
          // (objArg, message) form.
          const [first, second] = args
          let mergeObj = null
          let message = null
          if (typeof first === 'string') {
            message = first
          } else if (first && typeof first === 'object') {
            mergeObj = first
            if (typeof second === 'string') message = second
          }
          const errMsg =
            (mergeObj && (mergeObj.err || mergeObj.error || mergeObj.message)) ||
            message ||
            'logger.error'
          const error =
            errMsg instanceof Error ? errMsg : new Error(String(errMsg))
          if (mergeObj?.stack && !(errMsg instanceof Error)) {
            error.stack = String(mergeObj.stack)
          }
          const properties = { source: 'pino', logName: message || null }
          if (mergeObj) {
            for (const [k, v] of Object.entries(mergeObj)) {
              if (k === 'err' || k === 'error' || k === 'stack') continue
              // App Insights customDimensions are strings — flatten cheaply.
              properties[k] =
                v === null || v === undefined
                  ? null
                  : typeof v === 'object'
                  ? JSON.stringify(v).slice(0, 1000)
                  : v
            }
          }
          getTrackException()(error, properties)
        } catch {
          /* never block logging on telemetry */
        }
      }
      return method.apply(this, args)
    },
  },
  // pino-pretty in dev so the console isn't a wall of JSON.
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service',
        },
      },
})

module.exports = logger
