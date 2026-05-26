import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  // Spotify SDK state (mirrored from react-spotify-web-playback events)
  currentTrack: null, // { id, name, uri, image, artists: [{name}], duration_ms }
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  deviceId: null,

  // Context that triggered playback (so NowPlayingScreen can show "Playing from {playlist}")
  currentContext: null, // { type: 'playlist'|'album'|'track', uri, name, image }

  // DJ
  currentDj: null, // mirrored from djs.currentDj for convenience on player screens
  djSpeaking: false,

  // Volume + mute (master across Spotify + DJ overlay)
  volume: 0.7,
  isMuted: false,

  // UI: whether the full-screen Now Playing drawer is open
  nowPlayingOpen: false,

  // Misc
  loading: false,
  error: null,
}

const playerSlice = createSlice({
  name: "player",
  initialState,
  reducers: {
    setCurrentTrack: (state, action) => {
      state.currentTrack = action.payload
      if (action.payload?.duration_ms) {
        state.durationMs = action.payload.duration_ms
      }
    },
    clearCurrentTrack: (state) => {
      state.currentTrack = null
      state.positionMs = 0
      state.durationMs = 0
    },
    setIsPlaying: (state, action) => {
      state.isPlaying = action.payload
    },
    setPosition: (state, action) => {
      state.positionMs = action.payload
    },
    setDuration: (state, action) => {
      state.durationMs = action.payload
    },
    setDeviceId: (state, action) => {
      state.deviceId = action.payload
    },
    setCurrentContext: (state, action) => {
      state.currentContext = action.payload
    },
    setCurrentDj: (state, action) => {
      state.currentDj = action.payload
    },
    setDjSpeaking: (state, action) => {
      state.djSpeaking = action.payload
    },
    setVolume: (state, action) => {
      state.volume = action.payload
    },
    setIsMuted: (state, action) => {
      state.isMuted = action.payload
    },
    toggleMuted: (state) => {
      state.isMuted = !state.isMuted
    },
    openNowPlaying: (state) => {
      state.nowPlayingOpen = true
    },
    closeNowPlaying: (state) => {
      state.nowPlayingOpen = false
    },
    setNowPlayingOpen: (state, action) => {
      state.nowPlayingOpen = Boolean(action.payload)
    },
    setPlayerLoading: (state, action) => {
      state.loading = action.payload
    },
    setPlayerError: (state, action) => {
      state.error = action.payload
    },
  },
})

export const {
  setCurrentTrack,
  clearCurrentTrack,
  setIsPlaying,
  setPosition,
  setDuration,
  setDeviceId,
  setCurrentContext,
  setCurrentDj,
  setDjSpeaking,
  setVolume,
  setIsMuted,
  toggleMuted,
  openNowPlaying,
  closeNowPlaying,
  setNowPlayingOpen,
  setPlayerLoading,
  setPlayerError,
} = playerSlice.actions

export default playerSlice.reducer
