import { useCallback, useRef } from "react"
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
  const { playSession, stopCurrentPlayback } = useSpotifyPlayer()
  const loading = useSelector((s) => s.player?.sessionLoading)

  const audioRef = useRef(null)
  const abortedRef = useRef(false)

  // NOTE: we deliberately do NOT abort on unmount. A session-start is a
  // tab-agnostic, app-wide operation: the intro DJ plays through an
  // <audio> element this hook holds, and the orchestration ends with
  // playSession() in PlayerProvider (which is always mounted). The
  // tuning UI lives in NowPlayingBar (AppShell, also always mounted)
  // and is bound to Redux state, so it clears naturally when
  // orchestration finishes. Aborting on unmount would cut the DJ off
  // and prevent Spotify from ever starting whenever the user tapped
  // a station tile in SearchTab and then switched tabs while the
  // intro was still playing. Callers who explicitly want to cancel
  // can use the returned `abort()`.

  const start = useCallback(
    async (seed, { tuningOverride = null } = {}) => {
      if (loading) return // one session-start in flight at a time
      abortedRef.current = false

      // Cut any in-progress playback the instant a new session is
      // committed. Without this, the old session's Spotify tracks and
      // DJ overlay keep playing while the new intro audio (which
      // routes through its own <audio> element below) plays on top at
      // full volume. PlayerProvider.playSession will set up the new
      // tracks once the intro wraps and tracks are ready.
      stopCurrentPlayback()

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
          ? playIntroAudio(payload.intro.audioUrl, audioRef).then(({ ended }) => {
              if (!abortedRef.current && !tracksReady) {
                dispatch(
                  setSessionLoading({ ...serverTuning, phase: "loading" })
                )
              }
              // Tell the server "this user has heard the intro for
              // this (seedKey, djId) combo" so the next start of the
              // same combo for the same user goes straight to music.
              // Only fire on a clean `ended` — if the audio bombed
              // (autoplay rejected, network error) we keep the intro
              // primed for the next attempt.
              if (
                ended &&
                payload.session?.id &&
                payload.session?.djId
              ) {
                // fire-and-forget; failure here is non-fatal
                fetch("/api/sessions/intro-played", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    seedKey: payload.session.id,
                    djId: payload.session.djId,
                  }),
                }).catch(() => {})
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
    [loading, dispatch, playSession, stopCurrentPlayback]
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
 *
 * Resolves with `{ ended: boolean }` so the caller can distinguish a
 * clean end (mark the intro as played) from an error or autoplay
 * rejection (don't mark it — we want the user to actually hear it
 * once).
 */
function playIntroAudio(url, audioRef) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ended) => {
      if (settled) return
      settled = true
      resolve({ ended: Boolean(ended) })
    }
    try {
      const audio = new Audio(url)
      audio.preload = "auto"
      audioRef.current = audio
      audio.addEventListener("ended", () => finish(true), { once: true })
      audio.addEventListener("error", () => finish(false), { once: true })
      audio.play().catch(() => finish(false))
    } catch {
      finish(false)
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
