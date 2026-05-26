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
  const currentStation = useSelector((s) => s.stations?.currentStation)
  const jamSession = useSelector((s) => s.jamSession)
  const useBackendApis = useSelector((s) => s.user?.useBackendApis)
  const volume = useSelector((s) => s.player?.volume ?? DEFAULT_INITIAL_VOLUME)
  const isMuted = useSelector((s) => s.player?.isMuted ?? false)

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

  // Mirror redux values into refs so callbacks don't need to re-bind on each
  // change (we'd lose timer continuity otherwise).
  const currentDjRef = useRef(currentDj)
  const currentStationRef = useRef(currentStation)
  const jamSessionRef = useRef(jamSession)
  const useBackendApisRef = useRef(useBackendApis)
  const volumeRef = useRef(volume)
  const isMutedRef = useRef(isMuted)

  useEffect(() => { currentDjRef.current = currentDj }, [currentDj])
  useEffect(() => { currentStationRef.current = currentStation }, [currentStation])
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
            name: currentStationRef.current?.name,
            description: currentStationRef.current?.description,
            uri: currentStationRef.current?.uri,
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
        <SpotifyPlayer
          token={accessToken}
          getPlayer={getPlayer}
          callback={spotifyEventHandler}
          initialVolume={DEFAULT_INITIAL_VOLUME}
          play={false}
          // The wrapper renders a small visible control bar by default. We
          // hide it because the UI is fully driven by our own NowPlayingBar
          // / NowPlayingScreen, but we still need it mounted so the SDK
          // initializes and emits events.
          styles={{ height: 0 }}
          magnifySliderOnHover={false}
        />
      )}
      {accessToken && (
        <style>{`
          /* Suppress the react-spotify-web-playback footer chrome — we use
             our own NowPlayingBar / NowPlayingScreen instead. */
          [class*="rswp__"]{display:none!important;}
        `}</style>
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
