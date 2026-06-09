/**
 * Sessions orchestrator.
 *
 * Public API:
 *   startSession({ seed, spotifyAccessToken })  → SessionStartResult
 *   refillSession({ seed, spotifyAccessToken, excludeUris }) → { jobId }
 *   getJobStatus(jobId)                         → { status, tracks?, error? }
 *
 * SessionStartResult shape (uniform across all seed types):
 *   {
 *     ready:        boolean,            // true ⇒ tracks ready right now
 *     jobId:        string|null,        // non-null ⇒ poll /jobs/:jobId
 *     tracks:       Array|null,         // present iff ready === true
 *     intro:        { audioUrl, text, djName }|null,
 *     stale:        boolean,            // station-only: hint to swap fresh tracks
 *     refreshJobId: string|null,        // station-only: poll target for stale refresh
 *     session: {
 *       id:      string,                // seedKey(seed) — stable identifier
 *       seed:    { type, ... },         // echo of caller's seed
 *       name:    string,                // display name
 *       djId:    number,
 *       djName:  string|null,
 *       image:   string|null,           // album / artist / playlist artwork
 *     },
 *   }
 *
 * Architecture:
 *   - Station seeds delegate to the legacy aiStations service (which owns
 *     the AIStation DB cache + its own job store). Bit-for-bit identical
 *     to the existing /api/stations behavior.
 *   - Playlist seeds are sync (Spotify fetch is fast). Intro is built in
 *     parallel.
 *   - Mood / track / artist seeds are async (Gemini is slow). We launch a
 *     background job in this module's own Map, return ready=false with a
 *     jobId, and build the intro in parallel so the user sees DJ chatter
 *     while tracks generate.
 *
 * Job storage:
 *   - aiStations jobs live in the aiStations Map (one Map per orchestrator)
 *   - non-station jobs live in this module's Map
 *   - getJobStatus tries the local Map first, then falls back to aiStations
 */

const { pickGenerator } = require("./generators")
const { fromStation } = require("./generators/fromStation")
const { resolveSessionDj, HOUSE_DJ_ID } = require("./resolveSessionDj")
const { seedKey } = require("./seedKey")
const { djCharacters } = require("../djCharacters")
const { createSessionIntro } = require("./createSessionIntro")
const { getJobStatus: getStationJobStatus } = require("../aiStations")
const { hasIntroBeenPlayed } = require("../intros/introPlayedTracker")
const { hashUserId } = require("../utl/hashUserId")
const { trackEvent } = require("../telemetry")
const logger = require("../logger")

// Async generator seed types — these launch a background job because
// Gemini takes ~5-15s. Playlist is sync because Spotify's playlist API
// returns in well under a second.
const ASYNC_SEED_TYPES = new Set(["mood", "track", "artist"])

// In-memory job store for non-station seeds. Map<key, jobRecord>.
const jobs = new Map()

function settleJob(key, patch) {
  const existing = jobs.get(key)
  if (!existing) return
  Object.assign(existing, patch)
}

function scheduleJobEviction(key) {
  // Drop completed jobs after 60s so polling clients have a window to
  // observe the terminal state but the Map doesn't grow forever.
  const t = setTimeout(() => {
    const j = jobs.get(key)
    if (j && j.status !== "pending") jobs.delete(key)
  }, 60 * 1000)
  t.unref?.()
}

function findLocalJobById(jobId) {
  if (!jobId) return null
  for (const job of jobs.values()) {
    if (job.id === jobId) return job
  }
  return null
}

/**
 * Launch (or coalesce onto) a background generation job. Returns the
 * job id either way. The job lives in the local Map and is poll-able
 * via `getJobStatus(jobId)`.
 */
function startGenerationJob({ seed, spotifyAccessToken, excludeUris, generator }) {
  const key = seedKey(seed)
  const existing = jobs.get(key)
  if (existing && existing.status === "pending") {
    // Coalesce: concurrent callers share one generation.
    return existing.id
  }
  // Job id must survive being a single URL path segment — no '/' (or
  // Express splits the route) and no '#' (the browser strips fragments).
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_")
  const id = `${safeKey}__${Date.now().toString(36)}`
  const job = {
    id,
    status: "pending",
    seedType: seed.type,
    startedAt: Date.now(),
  }
  jobs.set(key, job)

  ;(async () => {
    try {
      const { tracks } = await generator({ seed, spotifyAccessToken, excludeUris })
      if (!tracks || tracks.length === 0) {
        const err = new Error("Generator returned no playable tracks")
        err.status = 502
        throw err
      }
      settleJob(key, { status: "ready", tracks })
    } catch (err) {
      logger.error(
        { err: err?.message, stack: err?.stack, key, seedType: seed?.type },
        'sessions.generation_job.failed'
      )
      settleJob(key, {
        status: "failed",
        error: err?.message || "Generation failed",
        errorStatus: err?.status || 500,
      })
    } finally {
      scheduleJobEviction(key)
    }
  })()

  return id
}

/**
 * Build a DJ intro. Errors are non-fatal — a missing intro just means
 * we skip straight to the music. Suppresses the intro entirely when
 * the user has already heard it for this (sessionKey, djId) combo.
 */
async function maybeBuildIntro({
  djId,
  seedType,
  mode,
  context,
  sessionKey,
  probability,
  userEmail,
}) {
  if (!djId) return null
  if (probability < 1 && Math.random() > probability) return null
  if (
    userEmail &&
    (await hasIntroBeenPlayed({ userEmail, seedKey: sessionKey, djId }))
  ) {
    logger.info(
      { userIdHash: hashUserId(userEmail), sessionKey, djId },
      'session.intro.suppressed_already_played'
    )
    return null
  }
  try {
    return await createSessionIntro({
      djId,
      seedType,
      mode,
      context,
      sessionKey,
    })
  } catch (err) {
    logger.warn(
      { err: err?.message, sessionKey, seedType, djId },
      'session.intro.generation_failed'
    )
    return null
  }
}

/**
 * Look up just enough metadata to render the session descriptor BEFORE
 * the Gemini job finishes. For mood, this comes from the local catalog.
 * For track / artist, it's a single Spotify call. The generator will
 * make the same call too — slight duplication, but it keeps the
 * generator interface a clean `{ tracks, meta }`.
 */
async function previewMetadata({ seed, spotifyAccessToken }) {
  if (seed.type === "mood") {
    const { lookupMood, lookupMoodStation } = require("./moodCatalog")
    const mood = lookupMood(seed.moodId)
    if (!mood) {
      const err = new Error(`Unknown moodId "${seed.moodId}"`)
      err.status = 404
      throw err
    }
    const station = lookupMoodStation(seed.moodId, seed.stationId)
    // station is guaranteed non-null when mood exists (defaults to first).
    const isDefault = !seed.stationId || station.id === mood.stations[0].id
    const name = isDefault ? mood.name : `${mood.name} \u2014 ${station.name}`
    return { name, imageUrl: null, artistName: null }
  }

  if (seed.type === "track") {
    const SpotifyWebApi = require("spotify-web-api-node")
    const parts = String(seed.spotifyUri || "").split(":")
    if (parts.length !== 3 || parts[1] !== "track") {
      const err = new Error(`Invalid track URI "${seed.spotifyUri}"`)
      err.status = 400
      throw err
    }
    const api = new SpotifyWebApi()
    api.setAccessToken(spotifyAccessToken)
    const res = await api.getTrack(parts[2])
    const t = res?.body
    if (!t?.name) {
      const err = new Error(`Track ${parts[2]} not found`)
      err.status = 404
      throw err
    }
    const artist = t.artists?.[0]?.name || "unknown artist"
    return {
      name: `Songs like ${t.name}`,
      artistName: artist,
      imageUrl: t.album?.images?.[0]?.url || null,
    }
  }

  if (seed.type === "artist") {
    const SpotifyWebApi = require("spotify-web-api-node")
    const parts = String(seed.spotifyUri || "").split(":")
    if (parts.length !== 3 || parts[1] !== "artist") {
      const err = new Error(`Invalid artist URI "${seed.spotifyUri}"`)
      err.status = 400
      throw err
    }
    const api = new SpotifyWebApi()
    api.setAccessToken(spotifyAccessToken)
    const res = await api.getArtist(parts[2])
    const a = res?.body
    if (!a?.name) {
      const err = new Error(`Artist ${parts[2]} not found`)
      err.status = 404
      throw err
    }
    return {
      name: `${a.name} Radio`,
      artistName: a.name,
      imageUrl: a.images?.[0]?.url || null,
    }
  }

  return { name: "Session", imageUrl: null, artistName: null }
}

async function startNonStationSession({
  seed,
  spotifyAccessToken,
  exclusiveDjId,
  preferredDjId,
  userEmail,
}) {
  const generator = pickGenerator(seed.type)
  const djId = await resolveSessionDj({
    seed,
    spotifyAccessToken,
    exclusiveDjId,
    preferredDjId,
  })
  const persona = await djCharacters(djId)
  const sessionId = seedKey(seed)

  if (seed.type === "playlist") {
    // Sync path: fetch playlist tracks.
    const generated = await generator({ seed, spotifyAccessToken })
    if (!generated.tracks || generated.tracks.length === 0) {
      const err = new Error("Playlist returned no playable tracks")
      err.status = 404
      throw err
    }
    // Build the intro AFTER we have the playlist name (it's used in the
    // prompt). Intro generation is independent of the track fetch but
    // depends on `meta.name`, so we sequence it here. Could be
    // parallelized in a future tweak by fetching meta separately.
    const intro = await maybeBuildIntro({
      djId,
      seedType: seed.type,
      mode: "cold",
      context: { name: generated.meta.name },
      sessionKey: sessionId,
      probability: 1,
      userEmail,
    })
    return {
      ready: true,
      jobId: null,
      tracks: generated.tracks,
      intro,
      stale: false,
      refreshJobId: null,
      session: {
        id: sessionId,
        seed,
        name: generated.meta.name,
        djId,
        djName: persona?.djName || null,
        image: generated.meta.imageUrl || null,
      },
    }
  }

  // Async path for mood / track / artist.
  // We need the descriptor's `name` BEFORE the tracks land (so the
  // now-playing bar can render it), which means we peek at the seed's
  // metadata up front.
  const previewMeta = await previewMetadata({ seed, spotifyAccessToken })

  // Launch tracks + intro IN PARALLEL — the intro should be playing
  // before the user starts asking why nothing is happening.
  const jobId = startGenerationJob({
    seed,
    spotifyAccessToken,
    excludeUris: [],
    generator,
  })

  const intro = await maybeBuildIntro({
    djId,
    seedType: seed.type,
    mode: "cold",
    context: {
      name: previewMeta.name,
      artistName: previewMeta.artistName || null,
    },
    sessionKey: sessionId,
    probability: 1,
    userEmail,
  })

  return {
    ready: false,
    jobId,
    tracks: null,
    intro,
    stale: false,
    refreshJobId: null,
    session: {
      id: sessionId,
      seed,
      name: previewMeta.name,
      djId,
      djName: persona?.djName || null,
      image: previewMeta.imageUrl || null,
    },
  }
}

async function startSession({ seed, spotifyAccessToken, exclusiveDjId, preferredDjId, userEmail }) {
  if (!seed || typeof seed !== "object") {
    const err = new Error("startSession: seed is required")
    err.status = 400
    throw err
  }
  if (seed.type === "station") {
    // Station seeds are catalog-pinned by design: the intro audio and
    // track-curation prompts are baked against the station's djId, and
    // a mismatched DJ would produce whiplash between intros and chatter.
    // Mid-session DJ swaps still work via the Mic2 picker, which only
    // affects /next-content (not intros).
    return fromStation({ seed, spotifyAccessToken, userEmail })
  }
  return startNonStationSession({
    seed,
    spotifyAccessToken,
    exclusiveDjId,
    preferredDjId,
    userEmail,
  })
}

/**
 * Refill an existing session with fresh recommendations. Always returns
 * a jobId — the client polls /jobs/:jobId to pick up the new tracks and
 * appends them to the Spotify SDK queue. `excludeUris` keeps the refill
 * from re-introducing songs the user has already heard or that are
 * still queued.
 *
 * Station + playlist seeds intentionally don't support refill via this
 * endpoint:
 *   - Station seeds use the existing weekly-cache refresh path.
 *   - Playlist seeds are authored — refilling them with random songs
 *     defeats the point. Use shuffle instead (client-side).
 */
async function refillSession({ seed, spotifyAccessToken, excludeUris = [] }) {
  if (!seed || typeof seed !== "object") {
    const err = new Error("refillSession: seed is required")
    err.status = 400
    throw err
  }
  if (!ASYNC_SEED_TYPES.has(seed.type)) {
    const err = new Error(
      `refillSession: not supported for "${seed.type}" seeds`
    )
    err.status = 400
    throw err
  }
  const generator = pickGenerator(seed.type)
  // Each refill is a fresh generation — bypass coalescing by using a
  // per-call key suffix so multiple refills don't piggyback on each
  // other. (Coalescing the INITIAL start is fine — two users tapping
  // the same seed should share. But refill means "give me something
  // NEW", so each call must produce its own result.)
  const baseKey = seedKey(seed)
  const refillKey = `${baseKey}#refill:${Date.now().toString(36)}`
  const safeKey = refillKey.replace(/[^a-zA-Z0-9_-]/g, "_")
  const id = `${safeKey}__${Date.now().toString(36)}`
  const job = {
    id,
    status: "pending",
    seedType: seed.type,
    startedAt: Date.now(),
    refill: true,
  }
  jobs.set(refillKey, job)
  trackEvent("session.refill.start", { seedType: seed.type, excludeCount: excludeUris.length })
  const t0 = Date.now()
  ;(async () => {
    try {
      const { tracks } = await generator({
        seed,
        spotifyAccessToken,
        excludeUris,
      })
      if (!tracks || tracks.length === 0) {
        throw Object.assign(new Error("Refill returned no playable tracks"), {
          status: 502,
        })
      }
      settleJob(refillKey, { status: "ready", tracks })
      trackEvent(
        "session.refill.end",
        { seedType: seed.type, success: true },
        { ms: Date.now() - t0, tracks: tracks.length }
      )
    } catch (err) {
      logger.error(
        { err: err?.message, stack: err?.stack, refillKey, seedType: seed.type },
        "session.refill.failed"
      )
      settleJob(refillKey, {
        status: "failed",
        error: err?.message || "Refill failed",
        errorStatus: err?.status || 500,
      })
      trackEvent(
        "session.refill.end",
        { seedType: seed.type, success: false, error: err?.message || "unknown" },
        { ms: Date.now() - t0 }
      )
    } finally {
      scheduleJobEviction(refillKey)
    }
  })()
  return { jobId: id }
}

/**
 * Look up a job by id across both stores. Local Map first, then the
 * legacy aiStations Map. Returns the same shape regardless of where
 * the job lives so the client only has one polling endpoint.
 */
function getJobStatus(jobId) {
  const local = findLocalJobById(jobId)
  if (local) {
    if (local.status === "ready") return { status: "ready", tracks: local.tracks }
    if (local.status === "failed") return { status: "failed", error: local.error }
    return { status: "pending" }
  }
  return getStationJobStatus(jobId)
}

module.exports = {
  startSession,
  refillSession,
  getJobStatus,
  // Exposed for tests
  HOUSE_DJ_ID,
}
