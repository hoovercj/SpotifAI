/**
 * Liveness + readiness endpoints.
 *
 *   GET /healthz  — always returns 200. App Service health-check path.
 *   GET /readyz   — verifies the DB is reachable. Returns 503 otherwise.
 *
 * Mounted at the root (NOT under /api) so probes don't have to know
 * about our routing convention.
 */

const router = require('express').Router()
const conn = require('../db/conn')

router.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

router.get('/readyz', async (_req, res) => {
  try {
    await conn.authenticate()
    res.json({ status: 'ok' })
  } catch (err) {
    res
      .status(503)
      .json({ status: 'degraded', error: err?.message || 'db_unreachable' })
  }
})

module.exports = router
