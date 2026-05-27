import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import SpotifyPlayer, { spotifyApi as spotifyApiHelpers } from "react-spotify-web-playback"
import SpotifyWebApi from "spotify-web-api-node"
import axios from "axios"
import {
  setCurrentTrack,
  setIsPlaying,
  setPosition,
  setDuration,
  setDeviceId,
  setDjSpeaking,
  setCurrentContext,
  setCurrentSession,
  clearCurrentSession,
  recordSessionQueueAdditions,
  appendSessionTracksIfMatch,
} from "../../store/playerSlice"
import { setCurrentDj as setStoreCurrentDj } from "../../store/djsSlice"
import { showProfile } from "../../store/userSlice"

const PlayerContext = createContext(null)

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) {
    throw new Error("usePlayer() must be used inside <PlayerProvider>")
  }
  return ctx
}

// Constants — preserved verbatim from the original Radio.jsx tuning.
const MAX_VOICEOVER_DURATION = 20000
const SPOTIFY_VOL_ATTENUATION = 0.5
const DEFAULT_INITIAL_VOLUME = 0.7

// Tiny promise-based sleep — used by the session refill polling loop.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Fisher–Yates shuffle. Returns a new array; doesn't mutate input.
// Used by `shuffleCurrentSession` so the playlist-shuffle button gives
// the user a genuinely random reordering on every tap.
function shuffleArray(arr) {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * PlayerProvider owns:
 *  - the underlying react-spotify-web-playback SDK instance (mounted headless)
 *  - the imperative API (play / pause / next / etc.) exposed via context
 *  - the AI-DJ audio overlay (HTMLAudioElement + scheduling + volume ducking)
 *
 * All Redux dispatches for player state happen here so any component can
 * simply read from `state.player.*`.
 */
export function PlayerProvider({ children }) {
  const dispatch = useDispatch()

  const accessToken = useSelector((s) => s.user?.details?.accessToken)
  const profile = useSelector((s) => s.user?.profile)
  const currentDj = useSelector((s) => s.djs?.currentDj)
  const allDjs = useSelector((s) => s.djs?.allDjs)
  // The session the DJ is currently providing chatter for. Was
  // historically `s.stations.currentStation` (a field that never
  // actually existed — the selector silently returned undefined and
  // the DJ chatter payload carried empty station context). Now points
  // to the unified `player.currentSession` slice so any seed type
  // (station / mood / track / artist / playlist) lights up the DJ.
  const currentSession = useSelector((s) => s.player?.currentSession)
  const jamSession = useSelector((s) => s.jamSession)
  const useBackendApis = useSelector((s) => s.user?.useBackendApis)
  const volume = useSelector((s) => s.player?.volume ?? DEFAULT_INITIAL_VOLUME)
  const isMuted = useSelector((s) => s.player?.isMuted ?? false)
  const playerCurrentTrack = useSelector((s) => s.player?.currentTrack)
  const playerCurrentSession = useSelector((s) => s.player?.currentSession)

  // ── Refs ───────────────────────────────────────────────────────────────
  const playerRef = useRef({ player: null })
  const audioRef = useRef(null)
  const djAudioTimeoutRef = useRef(null)
  const delayNextTrackTimeoutRef = useRef(null)

  const delayNextTrackRef = useRef(false)
  const trackDelaySetRef = useRef(false)
  const djAudioPendingRef = useRef(false)
  const needNextDjAudioRef = useRef(true)
  const isSpotifyPlayingRef = useRef(false)

  const spotifyApiRef = useRef(new SpotifyWebApi())

  // Refill / shuffle guards — both consumed by the queue-refill effect
  // below AND reset by `shuffleCurrentSession`. Declared up here so
  // both call sites share the same refs.
  const lastRefillAtUriRef = useRef(null)
  const refillInFlightRef = useRef(false)

  // Mirror redux values into refs so callbacks don't need to re-bind on each
  // change (we'd lose timer continuity otherwise).
  const currentDjRef = useRef(currentDj)
  const allDjsRef = useRef(allDjs)
  const currentSessionRef = useRef(currentSession)
  const jamSessionRef = useRef(jamSession)
  const useBackendApisRef = useRef(useBackendApis)
  const volumeRef = useRef(volume)
  const isMutedRef = useRef(isMuted)

  useEffect(() => { currentDjRef.current = currentDj }, [currentDj])
  useEffect(() => { allDjsRef.current = allDjs }, [allDjs])
  useEffect(() => { currentSessionRef.current = currentSession }, [currentSession])
  useEffect(() => { jamSessionRef.current = jamSession }, [jamSession])
  useEffect(() => { useBackendApisRef.current = useBackendApis }, [useBackendApis])
  useEffect(() => {
    volumeRef.current = volume
    // Apply live volume changes to the underlying SDK + DJ overlay.
    if (isMutedRef.current) return
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.volume = volume
      playerRef.current?.player?.setVolume(volume * SPOTIFY_VOL_ATTENUATION)
    } else {
      if (audioRef.current) audioRef.current.volume = volume
      playerRef.current?.player?.setVolume(volume)
    }
  }, [volume])
  useEffect(() => {
    isMutedRef.current = isMuted
    if (isMuted) {
      if (audioRef.current) audioRef.current.volume = 0
      playerRef.current?.player?.setVolume(0)
    } else {
      const v = volumeRef.current
      if (audioRef.current) audioRef.current.volume = v
      playerRef.current?.player?.setVolume(
        audioRef.current && !audioRef.current.paused
          ? v * SPOTIFY_VOL_ATTENUATION
          : v
      )
    }
  }, [isMuted])

  // ── Stable callbacks (use refs to avoid stale closures) ────────────────
  const scheduleDjAudio = useCallback(async (state = null) => {
    if (djAudioPendingRef.current) return
    let duration
    let progress
    window.clearTimeout(djAudioTimeoutRef.current)

    if (!state) {
      if (!playerRef.current?.player) return
      const currentState = await playerRef.current.player.getCurrentState()
      duration = currentState?.duration
      progress = currentState?.position
    } else {
      duration = state.track.durationMs
      progress = state.progressMs
    }
    if (!duration || !audioRef.current?.duration) return

    const audioDurationMs = audioRef.current.duration * 1000
    let djTimeOut
    if (audioDurationMs > MAX_VOICEOVER_DURATION) {
      delayNextTrackRef.current = true
      djTimeOut = duration - progress - MAX_VOICEOVER_DURATION / 2
      delayNextTrackTimeoutRef.current = window.setTimeout(() => {
        playerRef.current?.player?.resume()
      }, djTimeOut + audioDurationMs - MAX_VOICEOVER_DURATION / 2)
    } else {
      djTimeOut = duration - progress - audioDurationMs / 2
    }

    djAudioTimeoutRef.current = window.setTimeout(() => {
      audioRef.current?.play().catch((err) => {
        console.warn("DJ audio play() rejected:", err)
      })
    }, djTimeOut)
  }, [])

  const prepareNextDjAudio = useCallback(async () => {
    if (
      needNextDjAudioRef.current &&
      !djAudioPendingRef.current &&
      isSpotifyPlayingRef.current &&
      (!audioRef.current || audioRef.current.paused)
    ) {
      djAudioPendingRef.current = true

      try {
        const trackState = (await playerRef.current?.player?.getCurrentState())
          ?.track_window
        if (!trackState) {
          djAudioPendingRef.current = false
          return
        }

        const payload = {
          jamSessionId: jamSessionRef.current?.id,
          djName: currentDjRef.current?.djName,
          djId: currentDjRef.current?.id,
          station: {
            // Carries the current session's display name + identifying
            // URI/seedKey through to the backend DJ-chatter route, which
            // expects this shape for backwards compatibility with the
            // station-only era. Once the backend route is generalized
            // to accept a richer session descriptor, drop the `station:`
            // wrapper.
            name: currentSessionRef.current?.name,
            description: currentSessionRef.current?.seed?.type ?? null,
            uri: currentSessionRef.current?.id ?? null,
          },
          curTrack: {
            uri: trackState.current_track.uri,
            name: trackState.current_track.name,
            artist: trackState.current_track.artists[0].name,
          },
        }
        if (trackState.next_tracks?.length > 0) {
          payload.nextTrack = {
            uri: trackState.next_tracks[0].uri,
            name: trackState.next_tracks[0].name,
            artist: trackState.next_tracks[0].artists[0].name,
          }
        }

        let dataUri
        if (useBackendApisRef.current) {
          try {
            dataUri = await axios.post("/api/content/next-content", payload)
          } catch (err) {
            console.warn("next-content failed; falling back to generic segue:", err)
          }
        }

        const audio = audioRef.current
        if (!audio) {
          djAudioPendingRef.current = false
          return
        }

        const metadataLoadedPromise = new Promise((resolve) => {
          const handler = () => {
            audio.removeEventListener("loadedmetadata", handler)
            resolve()
          }
          audio.addEventListener("loadedmetadata", handler)
        })

        audio.src = dataUri?.data || "audio/generic_segue.mp3"
        await metadataLoadedPromise

        needNextDjAudioRef.current = false
      } finally {
        djAudioPendingRef.current = false
      }
    }

    if (
      isSpotifyPlayingRef.current &&
      audioRef.current?.paused &&
      !djAudioPendingRef.current
    ) {
      scheduleDjAudio()
    }
  }, [scheduleDjAudio])

  // ── Spotify SDK event handler ──────────────────────────────────────────
  const getPlayer = useCallback(async (playerInstance) => {
    const resolved = await playerInstance
    playerRef.current = { player: resolved }
    try {
      await resolved?.setName?.("SpotifAI Radio")
    } catch (err) {
      console.warn("Failed to set device name:", err)
    }
  }, [])

  const spotifyEventHandler = useCallback(
    async (state) => {
      if (state?.isPlaying !== undefined) {
        dispatch(setIsPlaying(state.isPlaying))
      }

      if (state.type === "status_update") {
        dispatch(setDeviceId(state.currentDeviceId))
      }

      if (state.type === "track_update") {
        if (state.track) {
          dispatch(setCurrentTrack(state.track))
          if (state.track.durationMs) {
            dispatch(setDuration(state.track.durationMs))
          }
        }
        needNextDjAudioRef.current = true
        isSpotifyPlayingRef.current = state.isPlaying

        if (delayNextTrackRef.current) {
          trackDelaySetRef.current = true
          delayNextTrackRef.current = false
          await playerRef.current?.player?.pause()
        }
        prepareNextDjAudio()
      }

      if (state.type === "player_update") {
        isSpotifyPlayingRef.current = state.isPlaying
        if (state.progressMs !== undefined) {
          dispatch(setPosition(state.progressMs))
        }
        if (isSpotifyPlayingRef.current) {
          prepareNextDjAudio()
        } else if (!trackDelaySetRef.current || state.progressMs > 50) {
          window.clearTimeout(djAudioTimeoutRef.current)
          window.clearTimeout(delayNextTrackTimeoutRef.current)
          delayNextTrackRef.current = false
          audioRef.current?.pause()
        } else {
          prepareNextDjAudio()
        }
      }

      if (state.type === "progress_update") {
        isSpotifyPlayingRef.current = state.isPlaying
        delayNextTrackRef.current = false
        window.clearTimeout(djAudioTimeoutRef.current)
        window.clearTimeout(delayNextTrackTimeoutRef.current)
        if (state.progressMs !== undefined) {
          dispatch(setPosition(state.progressMs))
        }
        if (isSpotifyPlayingRef.current) {
          audioRef.current?.pause()
          if (audioRef.current) audioRef.current.currentTime = 0
          scheduleDjAudio(state)
        }
      }
    },
    [dispatch, prepareNextDjAudio, scheduleDjAudio]
  )

  // ── Mount the DJ audio element ─────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio()
    audio.volume = volumeRef.current
    audioRef.current = audio

    const onPlay = () => {
      dispatch(setDjSpeaking(true))
      if (!isMutedRef.current) {
        playerRef.current?.player?.setVolume(
          volumeRef.current * SPOTIFY_VOL_ATTENUATION
        )
      }
    }
    const onEnded = () => {
      dispatch(setDjSpeaking(false))
      if (!isMutedRef.current) {
        playerRef.current?.player?.setVolume(volumeRef.current)
      }
      prepareNextDjAudio()
    }
    audio.addEventListener("play", onPlay)
    audio.addEventListener("ended", onEnded)

    return () => {
      audio.pause()
      window.clearTimeout(djAudioTimeoutRef.current)
      window.clearTimeout(delayNextTrackTimeoutRef.current)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("ended", onEnded)
      audioRef.current = null
    }
  }, [dispatch, prepareNextDjAudio])

  // Prompt for profile if missing — moved from Radio.jsx's componentDidMount.
  useEffect(() => {
    if (accessToken && (!profile?.name || !profile?.zip)) {
      dispatch(showProfile())
    }
  }, [accessToken, profile?.name, profile?.zip, dispatch])

  // ── Imperative API exposed via context ─────────────────────────────────
  const ensureToken = useCallback(() => {
    if (!accessToken) return false
    spotifyApiRef.current.setAccessToken(accessToken)
    return true
  }, [accessToken])

  const playTracks = useCallback(
    async (uris) => {
      if (!ensureToken() || !uris?.length) return
      window.clearTimeout(djAudioTimeoutRef.current)
      window.clearTimeout(delayNextTrackTimeoutRef.current)
      delayNextTrackRef.current = false
      trackDelaySetRef.current = false
      audioRef.current?.pause()
      dispatch(setDjSpeaking(false))
      dispatch(clearCurrentSession())
      dispatch(setCurrentContext({
        type: "track",
        uri: uris[0],
        name: null,
        image: null,
      }))
      try {
        await spotifyApiRef.current.play({ uris })
      } catch (err) {
        console.warn("playTracks failed:", err)
      }
    },
    [ensureToken, dispatch]
  )

  const playContext = useCallback(
    async (context) => {
      if (!ensureToken() || !context?.uri) return
      try {
        await spotifyApiRef.current.setShuffle(true)
      } catch (err) {
        console.warn("setShuffle failed (non-fatal):", err)
      }
      window.clearTimeout(djAudioTimeoutRef.current)
      window.clearTimeout(delayNextTrackTimeoutRef.current)
      delayNextTrackRef.current = false
      trackDelaySetRef.current = false
      audioRef.current?.pause()
      dispatch(setDjSpeaking(false))
      dispatch(clearCurrentSession())
      dispatch(setCurrentContext({
        type: context.type ?? guessContextType(context.uri),
        uri: context.uri,
        name: context.name ?? null,
        image: context.image ?? null,
      }))
      try {
        await spotifyApiRef.current.play({ context_uri: context.uri })
      } catch (err) {
        console.warn("playContext failed:", err)
      }
    },
    [ensureToken, dispatch]
  )

  const addToQueue = useCallback(
    async (uri) => {
      if (!ensureToken() || !uri) return
      try {
        await spotifyApiRef.current.addToQueue(uri)
      } catch (err) {
        console.warn("addToQueue failed:", err)
      }
    },
    [ensureToken]
  )

  /**
   * Start a session. Plays the first batch of tracks and records the
   * full session descriptor in Redux. The "queue refill" effect below
   * watches the SDK's currentTrack and re-queues from session.tracks
   * whenever we're close to running out, so the session never ends.
   *
   * `session` shape (matches the server's SessionStartResult.session
   * field plus the tracks array):
   *   {
   *     id:       string,            // seedKey
   *     seed:     { type, ... },
   *     name:     string,
   *     djId:     number|null,
   *     djName:   string|null,
   *     image:    string|null,
   *     gradient?: [from, to],       // station-only
   *     tracks:   [{ uri, name, artists, image, durationMs }],
   *   }
   */
  const playSession = useCallback(
    async (session) => {
      if (!ensureToken() || !session?.tracks?.length) return
      const uris = session.tracks.map((t) => t.uri).filter(Boolean)
      if (!uris.length) return
      // Reset DJ overlay state the same way playTracks does so we don't
      // step on the new playback.
      window.clearTimeout(djAudioTimeoutRef.current)
      window.clearTimeout(delayNextTrackTimeoutRef.current)
      delayNextTrackRef.current = false
      trackDelaySetRef.current = false
      audioRef.current?.pause()
      dispatch(setDjSpeaking(false))
      // Adopt the session's DJ persona so /api/content/next-content can
      // resolve a persona on the server side; without this it would be
      // called with djId=undefined and crash inside getOrCreateChat →
      // djCharacters(undefined) → buildDJSystemPrompt(<roster array>).
      if (session.djId) {
        const dj = (allDjsRef.current || []).find(
          (d) => Number(d?.id) === Number(session.djId)
        )
        if (dj && dj.id !== currentDjRef.current?.id) {
          dispatch(setStoreCurrentDj(dj))
        }
      }
      // The currentContext drives "Playing from {name}" in NowPlayingScreen.
      // For station seeds we keep the legacy spotifai:station:<g>:<s>
      // synthetic URI; for the other seed types the seed key itself is
      // the identifier (no Spotify URI exists for an artist-radio session).
      const isStation = session.seed?.type === "station"
      dispatch(setCurrentContext({
        type: session.seed?.type || "session",
        uri: isStation
          ? `spotifai:station:${session.seed.genreId}:${session.seed.stationId}`
          : session.id,
        name: session.name ?? null,
        image: session.image ?? session.tracks[0]?.image ?? null,
      }))
      dispatch(setCurrentSession({
        id: session.id,
        seed: session.seed,
        name: session.name,
        djId: session.djId ?? null,
        djName: session.djName ?? null,
        image: session.image ?? session.tracks[0]?.image ?? null,
        gradient: session.gradient ?? null,
        tracks: session.tracks,
      }))
      try {
        // Spotify's `play` accepts up to ~750 uris; the session catalog
        // is 30-200 tracks. Pass them all so the SDK has a healthy
        // `nextTracks` buffer and the refill effect rarely needs to
        // fire until ~track N-3.
        await spotifyApiRef.current.play({ uris })
      } catch (err) {
        console.warn("playSession failed:", err)
      }
    },
    [ensureToken, dispatch]
  )

  /**
   * Shuffle the current session's tracks and restart playback from the
   * top of the shuffled list. Intended for playlist seeds (where the
   * server returns tracks in playlist order) but seed-agnostic — it
   * only requires that `currentSession.tracks` be populated.
   *
   * Each call is a fresh shuffle, so repeated taps re-shuffle (rather
   * than toggle Spotify's shuffle flag). This is simpler and matches
   * how users typically use the shuffle button on a finished playlist:
   * "give me a new ordering, then play it."
   *
   * We reset `queuedUris` because the new order means previously-queued
   * URIs may need to be re-queued by the refill effect at the new tail.
   */
  const shuffleCurrentSession = useCallback(async () => {
    const session = currentSessionRef.current
    if (!session?.tracks?.length) return
    if (!ensureToken()) return
    const shuffled = shuffleArray(session.tracks)
    const uris = shuffled.map((t) => t.uri).filter(Boolean)
    if (!uris.length) return

    dispatch(setCurrentSession({
      ...session,
      tracks: shuffled,
      queuedUris: uris,
    }))
    // Reset the refill guards so the very next "near the end" check
    // triggers correctly against the new ordering.
    lastRefillAtUriRef.current = null

    try {
      await spotifyApiRef.current.play({ uris })
    } catch (err) {
      console.warn("shuffleCurrentSession failed:", err)
    }
  }, [ensureToken, dispatch])

  // Refill the SDK queue when we get within REFILL_THRESHOLD tracks of
  // the end of the current session, so the session feels infinite.
  //
  // Two refill strategies, picked by seed type:
  //
  //   - station, playlist  → LOOP: append the existing track list back
  //     onto the SDK queue. Stations have a fixed weekly setlist and
  //     playlists are explicitly bounded, so "loop the list" matches
  //     user expectations for those seed types.
  //
  //   - mood, track, artist  → REFILL: POST /api/sessions/refill and
  //     append the fresh tracks via `appendSessionTracksIfMatch`. These
  //     seed types are open-ended ("more like this"), so re-playing the
  //     same 20 tracks would feel like an actively bad bug. The server
  //     coalesces concurrent refills per seed and excludes the URIs the
  //     client has already heard, so it always returns new material.
  //
  // The `lastRefillAtUri` ref guards against re-firing while the SDK
  // sits on the same track across multiple state updates. The
  // `refillInFlightRef` flag prevents a second concurrent refill if
  // the threshold crosses again before the first one finishes. Both
  // are declared earlier so `shuffleCurrentSession` can reset them.
  useEffect(() => {
    const session = playerCurrentSession
    const trackUri = playerCurrentTrack?.uri
    if (!session?.tracks?.length || !trackUri) return
    const uris = session.tracks.map((t) => t.uri).filter(Boolean)
    const REFILL_THRESHOLD = 3
    const idx = uris.indexOf(trackUri)
    if (idx === -1) return
    if (uris.length - 1 - idx > REFILL_THRESHOLD) {
      lastRefillAtUriRef.current = null
      return
    }
    if (lastRefillAtUriRef.current === trackUri) return
    if (refillInFlightRef.current) return
    lastRefillAtUriRef.current = trackUri

    const seedType = session.seed?.type
    const isLoopType = seedType === "station" || seedType === "playlist"

    if (isLoopType) {
      // ---- LOOP strategy ----------------------------------------
      ;(async () => {
        // Re-queue the session's full list (Spotify's queue endpoint
        // takes one uri at a time). Sequential awaits avoid hammering
        // the API and keep playback ordering deterministic.
        const successfullyQueued = []
        for (const uri of uris) {
          if (!uri) continue
          try {
            await spotifyApiRef.current.addToQueue(uri)
            successfullyQueued.push(uri)
          } catch (err) {
            console.warn("session loop addToQueue failed:", err)
            break
          }
        }
        if (successfullyQueued.length > 0) {
          dispatch(recordSessionQueueAdditions(successfullyQueued))
        }
      })()
      return
    }

    // ---- REFILL strategy (mood / track / artist) --------------
    refillInFlightRef.current = true
    ;(async () => {
      try {
        // Tell the server which URIs the client has already heard so
        // it can exclude them from the next round. `queuedUris`
        // includes the originals + anything previously appended, so
        // this gives Gemini a clean "don't repeat" list.
        const excludeUris = Array.from(
          new Set([
            ...(session.queuedUris || []),
            ...uris,
          ])
        )
        const res = await fetch("/api/sessions/refill", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seed: session.seed,
            excludeUris,
          }),
        })
        if (!res.ok) {
          console.warn("session refill request failed:", res.status)
          return
        }
        const { jobId } = await res.json()
        if (!jobId) {
          console.warn("session refill returned no jobId")
          return
        }

        // Poll the job until tracks land or we time out. Reuses the
        // same lightweight contract `useStartSession` uses for the
        // cold-start case. Slower interval than the cold-start poll
        // because the user is still listening — there's no urgency
        // until they're literally on the last track.
        const POLL_MS = 2500
        const TIMEOUT_MS = 90_000
        const started = Date.now()
        let freshTracks = null
        while (Date.now() - started < TIMEOUT_MS) {
          await sleep(POLL_MS)

          // If the session changed under us mid-poll (user tapped
          // something else), drop the result — `appendSessionTracksIfMatch`
          // would no-op anyway but we may as well stop polling.
          const liveId = currentSessionRef.current?.id
          if (!liveId || liveId !== session.id) return

          const statusRes = await fetch(`/api/sessions/jobs/${jobId}`, {
            credentials: "include",
          })
          if (!statusRes.ok) continue
          const status = await statusRes.json()
          if (status.ready && Array.isArray(status.tracks)) {
            freshTracks = status.tracks
            break
          }
          if (status.error) {
            console.warn("session refill job failed:", status.error)
            return
          }
        }
        if (!freshTracks || freshTracks.length === 0) return

        // Append to Redux (filters dupes for us) AND push onto the
        // Spotify SDK queue so the next track actually plays.
        dispatch(
          appendSessionTracksIfMatch({
            id: session.id,
            tracks: freshTracks,
          })
        )
        const freshUris = freshTracks.map((t) => t.uri).filter(Boolean)
        const queued = []
        for (const uri of freshUris) {
          try {
            await spotifyApiRef.current.addToQueue(uri)
            queued.push(uri)
          } catch (err) {
            console.warn("refill addToQueue failed:", err)
            break
          }
        }
        if (queued.length > 0) {
          dispatch(recordSessionQueueAdditions(queued))
        }
      } catch (err) {
        console.warn("session refill failed:", err)
      } finally {
        refillInFlightRef.current = false
      }
    })()
  }, [playerCurrentTrack?.uri, playerCurrentSession])

  // Clear the session context the moment another playback action takes
  // over — handled inline by `playTracks` / `playContext` dispatching
  // `clearCurrentSession` so the refill effect stops firing.

  const togglePlay = useCallback(() => playerRef.current?.player?.togglePlay(), [])
  const resume = useCallback(() => playerRef.current?.player?.resume(), [])
  const pause = useCallback(() => playerRef.current?.player?.pause(), [])
  const next = useCallback(() => playerRef.current?.player?.nextTrack(), [])
  const previous = useCallback(() => playerRef.current?.player?.previousTrack(), [])
  const seek = useCallback((ms) => playerRef.current?.player?.seek(ms), [])

  const selectDj = useCallback(
    (dj) => {
      dispatch(setStoreCurrentDj(dj))
      audioRef.current?.pause()
      dispatch(setDjSpeaking(false))
      needNextDjAudioRef.current = true
    },
    [dispatch]
  )

  // Re-apply device transfer when deviceId changes (preserves Radio.jsx logic).
  const deviceId = useSelector((s) => s.player?.deviceId)
  useEffect(() => {
    if (!deviceId || !accessToken) return
    spotifyApiHelpers
      .setDevice(accessToken, deviceId, false)
      .catch((err) => console.warn("setDevice failed:", err))
  }, [deviceId, accessToken])

  const value = useMemo(
    () => ({
      playTracks,
      playContext,
      playSession,
      shuffleCurrentSession,
      addToQueue,
      togglePlay,
      resume,
      pause,
      next,
      previous,
      seek,
      selectDj,
    }),
    [
      playTracks,
      playContext,
      playSession,
      shuffleCurrentSession,
      addToQueue,
      togglePlay,
      resume,
      pause,
      next,
      previous,
      seek,
      selectDj,
    ]
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {accessToken && (
        // The wrapper renders its own visible player chrome (transport row +
        // scrubber). We want the SDK initialized but the chrome invisible —
        // our UI is fully driven by NowPlayingBar / NowPlayingScreen. The
        // node must stay in the DOM (not display:none) so the SDK script
        // can attach, so we render it off-canvas with zero hit area.
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: -10000,
            top: 0,
            width: 1,
            height: 1,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <SpotifyPlayer
            token={accessToken}
            getPlayer={getPlayer}
            callback={spotifyEventHandler}
            initialVolume={DEFAULT_INITIAL_VOLUME}
            play={false}
            magnifySliderOnHover={false}
          />
        </div>
      )}
    </PlayerContext.Provider>
  )
}

function guessContextType(uri) {
  if (!uri) return "track"
  if (uri.includes(":playlist:")) return "playlist"
  if (uri.includes(":album:")) return "album"
  if (uri.includes(":artist:")) return "artist"
  if (uri.includes(":show:")) return "show"
  return "track"
}
