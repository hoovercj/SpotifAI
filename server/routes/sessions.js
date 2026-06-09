/**
 * /api/sessions — unified entry point for every "play something" action
 * in the app.
 *
 * A "session" is a DJ-led multi-track playback context generated from a
 * seed. The seed can be any of:
 *
 *   { type: "station",  genreId,   stationId }
 *   { type: "mood",     moodId,    stationId? }
 *   { type: "track",    spotifyUri }     // "more like this song"
 *   { type: "artist",   spotifyUri }     // artist radio
 *   { type: "playlist", spotifyUri }     // play this playlist
 *
 * Routes:
 *
 *   POST /api/sessions/start
 *     body: { seed: {...} }
 *     200:  { ready: bool, jobId?, tracks?, intro?, session: {...}, stale?, refreshJobId? }
 *     400:  unknown / malformed seed
 *     401:  spotify session required
 *
 *   POST /api/sessions/refill
 *     body: { seed: {...}, excludeUris?: [] }
 *     200:  { jobId } — poll /jobs/:jobId for the new tracks
 *     400:  refill not supported for this seed type, or malformed seed
 *     401:  spotify session required
 *
 *   GET /api/sessions/jobs/:jobId
 *     200:  { status: "pending"|"ready"|"failed", tracks?, error? }
 *     404:  { status: "not_found" }
 *     401:  spotify session required
 *
 *   GET /api/sessions/recent?limit=20
 *     200:  { items: [{ seedKey, seed, name, djId, imageUrl, lastUsedAt }] }
 *     401:  spotify session required
 *     (Returns [] if the user has no recent sessions yet.)
 *
 *   DELETE /api/sessions/recent/:seedKey
 *     200:  { removed: 0|1 }
 *     401:  spotify session required
 *     (seedKey is URL-encoded — e.g. "station:rock%2F70s-legends".)
 */

const router = require("express").Router()
const {
  startSession,
  refillSession,
  getJobStatus,
} = require("../services/sessions")
const { seedKey } = require("../services/sessions/seedKey")
const { Settings, UserDjPreference } = require("../db/index.js")
const recentStore = require("../services/sessions/recentStore")
const { ensureFreshAccessToken } = require("./utl/ensureFreshAccessToken")
const { recordIntroPlayed } = require("../services/intros/introPlayedTracker")
const logger = require("../services/logger")
const { trackEvent } = require("../services/telemetry")

router.post("/start", async (req, res) => {
  const ok = await ensureFreshAccessToken(req)
  if (!ok || !req.session.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }

  const seed = req.body?.seed
  if (!seed) {
    return res.status(400).json({
      error: "missing_seed",
      message: "Request body must include { seed: {...} }",
    })
  }

  // Look up exclusive / per-seed DJ overrides for this user. Both are
  // optional; the resolver treats null/undefined as "no override".
  // Failures are non-fatal — if the DB hiccups we just fall through to
  // the regular resolver decision tree.
  let exclusiveDjId = null
  let preferredDjId = null
  const email = req.session?.email
  if (email) {
    try {
      const settings = await Settings.findOne({ where: { userEmail: email } })
      exclusiveDjId = settings?.exclusiveDjId ?? null
    } catch (err) {
      logger.warn({ err: err?.message }, "sessions.start.exclusiveDj_lookup_failed")
    }
    try {
      const pref = await UserDjPreference.findOne({
        where: { userEmail: email, seedKey: seedKey(seed) },
      })
      preferredDjId = pref?.djId ?? null
    } catch (err) {
      logger.warn({ err: err?.message }, "sessions.start.preferredDj_lookup_failed")
    }
  }

  const t0 = Date.now()
  try {
    const result = await startSession({
      seed,
      spotifyAccessToken: req.session.accessToken,
      exclusiveDjId,
      preferredDjId,
      userEmail: email,
    })
    // Record in the user's recent-sessions list. Fire-and-forget — a
    // DB hiccup must NOT block the session from playing.
    if (req.session.email && result?.session) {
      recentStore
        .record({
          userEmail: req.session.email,
          sessionDescriptor: result.session,
        })
        .catch((err) => {
          logger.warn({ err: err?.message }, "sessions.start.recentStore_failed")
        })
    }
    trackEvent(
      "session.start",
      {
        seedType: seed.type,
        djId: result?.session?.djId || null,
        ready: result?.ready,
        introCached: result?.intro?.cached ?? null,
        introOmitted: result?.intro === null,
      },
      { ms: Date.now() - t0 }
    )
    return res.json(result)
  } catch (err) {
    const status = err?.status || 500
    if (status >= 500) {
      logger.error({ err: err?.message, stack: err?.stack, seedType: seed.type }, "sessions.start.failed")
    }
    return res.status(status).json({
      error: "session_start_failed",
      message: err?.message || "Failed to start session",
    })
  }
})

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

router.post("/refill", async (req, res) => {
  const ok = await ensureFreshAccessToken(req)
  if (!ok || !req.session.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }
  const seed = req.body?.seed
  if (!seed) {
    return res.status(400).json({
      error: "missing_seed",
      message: "Request body must include { seed: {...} }",
    })
  }
  const excludeUris = Array.isArray(req.body?.excludeUris)
    ? req.body.excludeUris.filter((u) => typeof u === "string")
    : []
  try {
    const result = await refillSession({
      seed,
      spotifyAccessToken: req.session.accessToken,
      excludeUris,
    })
    return res.json(result)
  } catch (err) {
    const status = err?.status || 500
    if (status >= 500) {
      logger.error({ err: err?.message, stack: err?.stack, seedType: seed?.type }, 'sessions.refill.failed')
    }
    return res.status(status).json({
      error: "session_refill_failed",
      message: err?.message || "Failed to refill session",
    })
  }
})

router.get("/recent", async (req, res) => {
  if (!req.session?.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }
  const limit = Number.parseInt(req.query.limit, 10) || 20
  const items = await recentStore.list({
    userEmail: req.session.email,
    limit,
  })
  return res.json({ items })
})

router.delete("/recent/:seedKey", async (req, res) => {
  if (!req.session?.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }
  // seedKey arrives URL-encoded (it contains ":" and may contain "/"
  // depending on seed type). Express decodes path params for us, so
  // req.params.seedKey is already the raw key.
  const removed = await recentStore.remove({
    userEmail: req.session.email,
    seedKey: req.params.seedKey,
  })
  return res.json({ removed })
})

/**
 * POST /api/sessions/intro-played
 *   body: { seedKey, djId }
 *
 * Marks the DJ intro for (current user, seedKey, djId) as having been
 * heard, so subsequent /start responses for that combo will omit the
 * intro and the user goes straight to music. Fire-and-forget from
 * the client (called on the intro <audio>'s `ended` event). Always
 * returns 204 — failures are non-fatal and logged on the server.
 */
router.post("/intro-played", async (req, res) => {
  if (!req.session?.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }
  const userEmail = req.session.email
  const { seedKey: sKey, djId } = req.body || {}
  const djIdNum = Number(djId)
  if (!userEmail || !sKey || typeof sKey !== "string" || !Number.isInteger(djIdNum) || djIdNum <= 0) {
    return res.status(400).json({ error: "invalid_payload" })
  }
  await recordIntroPlayed({ userEmail, seedKey: sKey, djId: djIdNum })
  trackEvent("intro.played", { seedKey: sKey, djId: djIdNum })
  return res.status(204).end()
})

module.exports = router
