const router = require("express").Router()
const {
  startStation,
  getJobStatus,
  resolveAllStationCovers,
} = require("../services/aiStations")
const { ensureFreshAccessToken } = require("./utl/ensureFreshAccessToken")
const logger = require("../services/logger")

/**
 * POST /api/stations/:genreId/:stationId/start
 *
 * Main entry point when a user taps a station card. Returns instantly:
 *   - { ready: true, tracks, intro?, station, genre }       (cache hit)
 *   - { ready: false, jobId, intro?, station, genre }       (cold start)
 *
 * Requires an authenticated Spotify session so we can use the user's
 * access token to search Spotify and resolve Gemini's (title, artist)
 * candidates to playable URIs.
 */
router.post("/:genreId/:stationId/start", async (req, res) => {
  const ok = await ensureFreshAccessToken(req)
  if (!ok || !req.session.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }

  try {
    const result = await startStation({
      genreId: req.params.genreId,
      stationId: req.params.stationId,
      spotifyAccessToken: req.session.accessToken,
      userEmail: req.session.email,
    })
    return res.json(result)
  } catch (err) {
    const status = err?.status || 500
    if (status >= 500) {
      logger.error({ err: err?.message, stack: err?.stack, genreId: req.params.genreId, stationId: req.params.stationId }, 'stations.start.failed')
    }
    return res.status(status).json({
      error: "station_start_failed",
      message: err?.message || "Failed to start station",
    })
  }
})

/**
 * GET /api/stations/jobs/:jobId
 *
 * Polled by the client while a cold-start generation runs in the
 * background. Returns `{ status: "pending" | "ready" | "failed" | "not_found", ... }`.
 *
 * Auth: same Spotify session requirement as /start, so an unauthenticated
 * caller can't probe the job store.
 */
router.get("/jobs/:jobId", (req, res) => {
  if (!req.session?.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }
  const status = getJobStatus(req.params.jobId)
  if (status.status === "not_found") {
    return res.status(404).json(status)
  }
  return res.json(status)
})

/**
 * GET /api/stations/covers
 *
 * Returns a `{ "<genreId>/<stationId>": "/images/...png" | null }` map
 * for every station in the server catalog, resolved via the three-tier
 * preference order (pre-baked Gemini cover → DJ portrait → null).
 *
 * Used by the client's station/genre cards to render cover art instead
 * of flat gradient swatches. The response shape is intentionally tiny
 * (~200 short string entries) so it's safe to fetch unconditionally on
 * app mount — no pagination, no per-card request-fan-out.
 *
 * No auth required: the URLs are paths to static assets in `public/`,
 * which Express already serves to anyone. Wiring an auth gate here
 * would only obscure them, not protect them.
 */
router.get("/covers", (_req, res) => {
  try {
    return res.json({ covers: resolveAllStationCovers() })
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'stations.covers.failed')
    return res.status(500).json({ error: "station_covers_failed" })
  }
})

module.exports = router
