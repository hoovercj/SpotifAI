import { useCallback, useRef, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import {
  setSessionLoading,
  setSessionError,
  replaceSessionTracksIfMatch,
} from "../../store/playerSlice"
import {
  fetchRecentSessions,
  promoteRecent,
} from "../../store/recentSessionsSlice"

/**
 * Single entry point for "the user tapped something playable".
 *
 * Drives the entire orchestration for ANY seed type:
 *
 *   1. Dispatch `setSessionLoading` so NowPlayingBar shows the tuning UI.
 *   2. POST /api/sessions/start with the seed.
 *   3. If the response includes an `intro` (audio URL + DJ name), play
 *      it through an off-DOM <audio> element while we wait on tracks.
 *      Flip the tuning UI from 'loading' to 'intro' so the listener
 *      sees who's about to speak.
 *   4. If the response is async (`ready: false`), poll
 *      /api/sessions/jobs/:jobId every POLL_INTERVAL_MS until tracks
 *      arrive (or we time out / fail / unmount).
 *   5. Wait for the intro to wrap (so the DJ never gets cut off), then
 *      call `playSession()` to actually start Spotify playback.
 *   6. If the server flagged the cached row stale (station-only — that
 *      mechanic stays specific to weekly-cache refreshes), poll the
 *      `refreshJobId` on the side and dispatch
 *      `replaceSessionTracksIfMatch` when the fresh tracks land.
 *
 * Returned API:
 *   start(seed, { tuningOverride? })  — kick off the orchestration
 *   abort()                            — cancel everything in flight
 *
 * `tuningOverride` is optional metadata the CALLER already knows about
 * the tile (name, image, gradient) — used to populate the NowPlayingBar
 * tuning row instantly, before the server has had a chance to respond
 * with the canonical session descriptor. Especially important for
 * stations (they have a gradient swatch that defines the visual
 * thread).
 */

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 90 * 1000

export function useStartSession() {
  const dispatch = useDispatch()
  const { playSession } = useSpotifyPlayer()
  const loading = useSelector((s) => s.player?.sessionLoading)

  const audioRef = useRef(null)
  const abortedRef = useRef(false)

  // If the consumer unmounts mid-orchestration, abort cleanly so we
  // don't leave the tuning bar spinning forever on whatever page the
  // user lands on next.
  useEffect(() => {
    return () => {
      abortedRef.current = true
      stopIntroAudio(audioRef)
      dispatch(setSessionLoading(null))
    }
  }, [dispatch])

  const start = useCallback(
    async (seed, { tuningOverride = null } = {}) => {
      if (loading) return // one session-start in flight at a time
      abortedRef.current = false

      const baseTuning = {
        seed,
        name: tuningOverride?.name || "Loading…",
        image: tuningOverride?.image || null,
        gradient: tuningOverride?.gradient || null,
      }
      dispatch(setSessionLoading({ ...baseTuning, phase: "loading" }))

      try {
        const startRes = await fetch("/api/sessions/start", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seed }),
        })
        if (!startRes.ok) {
          const body = await safeJson(startRes)
          throw new Error(
            body?.message ||
              body?.error ||
              `Session start failed (${startRes.status})`
          )
        }
        const payload = await startRes.json()
        if (abortedRef.current) return

        // Once the server has spoken, prefer its session.name/image over
        // whatever placeholder the caller passed — the server may have
        // resolved a richer label (e.g. "Songs like Bohemian Rhapsody"
        // for a track seed when the caller only knew the URI).
        const serverTuning = {
          ...baseTuning,
          name: payload.session?.name || baseTuning.name,
          image: payload.session?.image || baseTuning.image,
        }

        const hasIntro = !!payload.intro?.audioUrl

        if (hasIntro) {
          dispatch(
            setSessionLoading({
              ...serverTuning,
              phase: "intro",
              djName: payload.intro.djName,
            })
          )
        } else {
          dispatch(setSessionLoading({ ...serverTuning, phase: "loading" }))
        }

        // Play intro in parallel with track resolution. The promise
        // never rejects — we always reach `await introPromise` below.
        let tracksReady = !!payload.tracks
        const introPromise = hasIntro
          ? playIntroAudio(payload.intro.audioUrl, audioRef).then(() => {
              if (!abortedRef.current && !tracksReady) {
                dispatch(
                  setSessionLoading({ ...serverTuning, phase: "loading" })
                )
              }
            })
          : Promise.resolve()

        // Resolve tracks. Sync (playlist seeds, warm station hits):
        // already in the payload. Async (mood/track/artist seeds, cold
        // station starts): poll the job until ready/failed/timeout.
        let tracks = payload.tracks
        if (!payload.ready) {
          tracks = await pollForTracks(payload.jobId, abortedRef)
        }
        tracksReady = true
        if (abortedRef.current) return
        if (!Array.isArray(tracks) || tracks.length === 0) {
          throw new Error("Session returned no tracks")
        }

        // Wait for the intro to wrap. Cutting the DJ off mid-sentence
        // defeats the purpose of the tuning UX.
        await introPromise
        if (abortedRef.current) return

        // Hand off to the player. PlayerProvider takes care of the
        // currentContext/currentSession bookkeeping + actual Spotify
        // play() call.
        await playSession({
          id: payload.session?.id,
          seed: payload.session?.seed || seed,
          name: payload.session?.name,
          djId: payload.session?.djId ?? null,
          djName: payload.session?.djName ?? payload.intro?.djName ?? null,
          image: payload.session?.image ?? null,
          gradient: tuningOverride?.gradient ?? null,
          tracks,
        })

        dispatch(setSessionLoading(null))

        // Keep the home screen's "Jump back in" row current. The server
        // already upserted this session into recent_session on /start
        // — we just need the client cache to reflect it. Optimistic
        // promote (so the tile moves to the front instantly if it was
        // already in the list) + background refetch (so a freshly-
        // played seed that wasn't there before shows up).
        if (payload.session?.id) {
          dispatch(promoteRecent(payload.session.id))
        }
        dispatch(fetchRecentSessions())

        // Station-only background-refresh path: if the server flagged
        // the cached setlist as stale, it kicked off a regen and gave
        // us a refreshJobId. Poll on the side and swap the fresh tracks
        // into the session slice when they arrive.
        if (payload.stale && payload.refreshJobId && payload.session?.id) {
          const sessionId = payload.session.id
          pollForTracks(payload.refreshJobId, abortedRef)
            .then((freshTracks) => {
              if (abortedRef.current) return
              if (!Array.isArray(freshTracks) || freshTracks.length === 0) return
              dispatch(
                replaceSessionTracksIfMatch({
                  id: sessionId,
                  tracks: freshTracks,
                })
              )
            })
            .catch((err) => {
              // Background refresh failure is non-fatal: the user keeps
              // hearing the cached setlist. Log and move on.
              console.warn("Session background refresh poll failed:", err)
            })
        }
      } catch (err) {
        console.warn("Session start failed:", err)
        // Flip the abort flag BEFORE anything else — the in-flight
        // introPromise has a `.then` that re-dispatches setSessionLoading.
        // Without this, that callback fires later, clobbers the error
        // we're about to set, and leaves the user staring at a permanent
        // "Tuning…" bar.
        abortedRef.current = true
        stopIntroAudio(audioRef)
        dispatch(
          setSessionError(prettifySessionError(err) || "Failed to start session")
        )
      }
    },
    [loading, dispatch, playSession]
  )

  const abort = useCallback(() => {
    abortedRef.current = true
    stopIntroAudio(audioRef)
    dispatch(setSessionLoading(null))
  }, [dispatch])

  return { start, abort, loading }
}

/**
 * Play a one-shot intro audio file. The returned promise resolves on
 * `ended`, `error`, or a play() rejection (e.g. autoplay blocked). It
 * never rejects — losing the intro should never break the start flow.
 */
function playIntroAudio(url, audioRef) {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    try {
      const audio = new Audio(url)
      audio.preload = "auto"
      audioRef.current = audio
      audio.addEventListener("ended", finish, { once: true })
      audio.addEventListener("error", finish, { once: true })
      audio.play().catch(() => finish())
    } catch {
      finish()
    }
  })
}

function stopIntroAudio(audioRef) {
  const audio = audioRef.current
  if (!audio) return
  try {
    audio.pause()
    audio.src = ""
  } catch {
    /* noop */
  }
  audioRef.current = null
}

async function pollForTracks(jobId, abortedRef) {
  if (!jobId) throw new Error("Server did not return a job id for cold start")
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (abortedRef.current) throw new Error("aborted")
    await sleep(POLL_INTERVAL_MS)
    if (abortedRef.current) throw new Error("aborted")
    const res = await fetch(`/api/sessions/jobs/${jobId}`, {
      credentials: "include",
    })
    if (!res.ok) {
      // 404 = job evicted / never existed. Hard failure so the user
      // sees an error instead of spinning forever.
      const body = await safeJson(res)
      throw new Error(body?.error || `Job poll failed (${res.status})`)
    }
    const status = await res.json()
    if (status.status === "ready") return status.tracks
    if (status.status === "failed") {
      throw new Error(status.error || "Session generation failed")
    }
    // status === "pending" → loop
  }
  throw new Error("Session generation timed out")
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Make a presentable error string out of whatever showed up. Job-status
 * payloads sometimes carry a raw upstream JSON blob (e.g. Gemini's 503
 * "high demand" envelope). Extract the friendly bits.
 */
function prettifySessionError(err) {
  const raw = err?.message || String(err || "")
  if (!raw) return null

  // Try to parse a JSON envelope. Gemini errors come through as the full
  // `{"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}`.
  const jsonStart = raw.indexOf("{")
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart))
      const inner = parsed?.error || parsed
      if (inner?.status === "UNAVAILABLE" || inner?.code === 503) {
        return "The DJ booth is overloaded right now — try again in a moment."
      }
      if (inner?.message) return inner.message
    } catch {
      /* not JSON — fall through */
    }
  }
  return raw
}
