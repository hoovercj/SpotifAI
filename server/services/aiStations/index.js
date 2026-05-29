/**
 * AI Station orchestrator.
 *
 * Public API:
 *
 *   startStation({ genreId, stationId, spotifyAccessToken }) =>
 *     {
 *       ready: boolean,
 *       tracks?: Array<...>,        // present when ready === true
 *       jobId?: string,             // present when ready === false (cold start)
 *       intro?: { audioUrl, text, djName } | null,
 *       station: { id, name, djId },
 *       genre:   { id, name },
 *     }
 *
 *   getJobStatus(jobId) =>
 *     { status: 'pending' | 'ready' | 'failed' | 'not_found', tracks?, error? }
 *
 * Cache semantics:
 *   - One row per (genreId, stationId). We always return its tracks
 *     immediately if it exists.
 *   - If the cached row's `weekKey` is older than this week, we kick off a
 *     background regen that overwrites the row when it completes. The user
 *     never waits for staleness.
 *   - On cache miss we start an in-memory job; the client receives a jobId
 *     and polls until tracks are ready. Meanwhile we (optionally) hand back
 *     a DJ intro to play during the wait.
 *
 * Job store is in-process Map keyed by (genreId, stationId) so concurrent
 * requests for the same cold station coalesce onto a single generation.
 */

const { AIStation } = require("../../db")
const { lookupStation } = require("./catalog")
const { generateStationTracks } = require("./generateStationTracks")
const { createStationIntro } = require("./createStationIntro")
const { seedKey } = require("../sessions/seedKey")
const { hasIntroBeenPlayed } = require("../intros/introPlayedTracker")
const { hashUserId } = require("../utl/hashUserId")
const logger = require("../logger")

// Probability of attaching a DJ intro on a warm cache hit. Cold-start always
// gets one (it doubles as the "tuning" indicator).
const WARM_INTRO_PROBABILITY = 0.25

// In-memory job store. Keyed by `${genreId}/${stationId}` so concurrent
// callers asking for the same station share a single generation.
const jobs = new Map()

/** Promote a job to ready / failed. Idempotent. */
function settleJob(key, patch) {
  const existing = jobs.get(key)
  if (!existing) return
  Object.assign(existing, patch)
}

/** Pure helper: ISO-style "YYYY-Www" week bucket. */
function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`
}

/**
 * Actually run the Gemini -> Spotify pipeline and upsert the row.
 * Throws on hard failure (e.g. rate-limited with no usable tracks).
 */
async function generateAndPersist({ entry, spotifyAccessToken }) {
  const tracks = await generateStationTracks({
    genre: entry.genre,
    station: entry.station,
    spotifyAccessToken,
  })
  if (tracks.length === 0) {
    const err = new Error("Failed to generate any playable tracks for this station")
    err.status = 502
    throw err
  }
  const weekKey = getWeekKey()
  // upsert keyed on (genreId, stationId) — the unique index on those two
  // columns is what makes this idempotent.
  await AIStation.upsert({
    genreId: entry.genre.id,
    stationId: entry.station.id,
    weekKey,
    tracks,
  })
  return tracks
}

/**
 * Start (or coalesce onto) a generation job. Used by both:
 *   - cold-start (`kind === "foreground"`): the client is actively waiting
 *     for tracks; intro doubles as the "tuning" indicator.
 *   - stale-refresh (`kind === "background"`): the user already got cached
 *     tracks back; the new ones will be swapped into their queue when ready.
 *
 * Either way the lifecycle is identical — the job sits in the same Map and
 * is poll-able via getJobStatus(). The `kind` is informational only.
 */
function startGenerationJob({ entry, spotifyAccessToken, kind = "foreground" }) {
  const key = `${entry.genre.id}/${entry.station.id}`
  const existing = jobs.get(key)
  if (existing && existing.status === "pending") {
    // Coalesce: any concurrent caller for the same station rides along.
    return existing.id
  }
  // Job id must survive being put in a single URL path segment — no '/' (or
  // Express splits the route) and no '#' (the browser strips fragments
  // before the request even leaves). Double-underscore is safe in path
  // segments and distinct enough not to collide with genre/station ids.
  const id = `${entry.genre.id}__${entry.station.id}__${Date.now().toString(36)}`
  const job = {
    id,
    status: "pending",
    kind,
    startedAt: Date.now(),
    genreId: entry.genre.id,
    stationId: entry.station.id,
  }
  jobs.set(key, job)

  generateAndPersist({ entry, spotifyAccessToken })
    .then((tracks) => {
      settleJob(key, { status: "ready", tracks })
      scheduleJobEviction(key)
    })
    .catch((err) => {
      const level = kind === "background" ? "warn" : "error"
      console[level](
        `AI station ${kind} generation failed for ${key}:`,
        err?.message || err
      )
      settleJob(key, {
        status: "failed",
        error: err?.message || "Generation failed",
        errorStatus: err?.status || 500,
      })
      scheduleJobEviction(key)
    })

  return id
}

// Drop completed jobs after a minute so polling clients have a window to
// observe the terminal state but the Map doesn't grow forever.
function scheduleJobEviction(key) {
  const t = setTimeout(() => {
    const j = jobs.get(key)
    if (j && j.status !== "pending") jobs.delete(key)
  }, 60 * 1000)
  t.unref?.()
}

function findJobById(jobId) {
  if (!jobId) return null
  for (const job of jobs.values()) {
    if (job.id === jobId) return job
  }
  return null
}

/**
 * Build a DJ intro with the given probability. Errors are non-fatal —
 * a missing intro just means we'll skip straight to the music.
 * Suppresses the intro entirely when the user has already heard the
 * intro for this (station, dj) combo.
 */
async function maybeBuildIntro({ entry, mode, probability, userEmail }) {
  if (!entry?.station?.djId) return null
  if (probability < 1 && Math.random() > probability) return null
  if (userEmail) {
    const sKey = seedKey({
      type: "station",
      genreId: entry.genre.id,
      stationId: entry.station.id,
    })
    if (
      await hasIntroBeenPlayed({
        userEmail,
        seedKey: sKey,
        djId: entry.station.djId,
      })
    ) {
      logger.info(
        { userIdHash: hashUserId(userEmail), seedKey: sKey, djId: entry.station.djId },
        'station.intro.suppressed_already_played'
      )
      return null
    }
  }
  try {
    return await createStationIntro({
      djId: entry.station.djId,
      genre: entry.genre,
      station: entry.station,
      mode,
    })
  } catch (err) {
    logger.warn(
      {
        err: err?.message,
        genreId: entry.genre.id,
        stationId: entry.station.id,
      },
      'station.intro.generation_failed'
    )
    return null
  }
}

/**
 * Main entry point invoked by POST /api/stations/:genreId/:stationId/start.
 *
 * Returns instantly:
 *   - cached + fresh        : ready=true, tracks, intro (~25% chance)
 *   - cached + stale        : ready=true, tracks, intro (~25% chance),
 *                             stale=true, refreshJobId (client polls and
 *                             swaps tracks into the queue when ready)
 *   - not cached (cold)     : ready=false, jobId, intro (always)
 */
async function startStation({ genreId, stationId, spotifyAccessToken, userEmail }) {
  const entry = lookupStation(genreId, stationId)
  if (!entry) {
    const err = new Error(`Unknown station: ${genreId}/${stationId}`)
    err.status = 404
    throw err
  }

  const cached = await AIStation.findOne({ where: { genreId, stationId } })
  const stationDescriptor = {
    id: entry.station.id,
    name: entry.station.name,
    djId: entry.station.djId,
  }

  if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
    // Warm hit. If the row is from a previous week, kick off a background
    // refresh and pass the job id to the client so it can poll and swap in
    // the fresh tracks once they're ready.
    let refreshJobId = null
    if (cached.weekKey !== getWeekKey()) {
      refreshJobId = startGenerationJob({
        entry,
        spotifyAccessToken,
        kind: "background",
      })
    }
    const intro = await maybeBuildIntro({
      entry,
      mode: "warm",
      probability: WARM_INTRO_PROBABILITY,
      userEmail,
    })
    return {
      ready: true,
      tracks: cached.tracks,
      stale: Boolean(refreshJobId),
      refreshJobId,
      intro,
      station: stationDescriptor,
      genre: entry.genre,
    }
  }

  // Cold start.
  const jobId = startGenerationJob({
    entry,
    spotifyAccessToken,
    kind: "foreground",
  })
  const intro = await maybeBuildIntro({
    entry,
    mode: "cold",
    probability: 1,
    userEmail,
  })
  return {
    ready: false,
    jobId,
    intro,
    station: stationDescriptor,
    genre: entry.genre,
  }
}

/**
 * Polled by the client while a cold-start job is generating.
 */
function getJobStatus(jobId) {
  const job = findJobById(jobId)
  if (!job) return { status: "not_found" }
  if (job.status === "pending") return { status: "pending" }
  if (job.status === "ready") return { status: "ready", tracks: job.tracks }
  return { status: "failed", error: job.error || "Generation failed" }
}

const {
  resolveStationCover,
  resolveAllStationCovers,
} = require("./resolveStationCover")

module.exports = {
  startStation,
  getJobStatus,
  getWeekKey,
  resolveStationCover,
  resolveAllStationCovers,
}
