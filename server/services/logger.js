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
 * Levels map to App Insights severity in services/telemetry.js.
 */

const pino = require('pino')

const isProd = process.env.NODE_ENV === 'production'
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug')

const logger = pino({
  level,
  base: { service: 'spotifai' },
  // App Insights timestamp parser expects ms epoch; pino's default is fine.
  timestamp: pino.stdTimeFunctions.isoTime,
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
