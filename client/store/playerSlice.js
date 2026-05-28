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

  // Session that's currently driving playback, if any. Player effects
  // watch this to know when to refill the SDK queue.
  // Shape:
  //   {
  //     id:         string,                 // seedKey returned by the server
  //     seed:       { type, ... },          // station|mood|track|artist|playlist
  //     name:       string,
  //     djId:       number|null,
  //     djName:     string|null,
  //     image:      string|null,            // tile / album / artist artwork
  //     gradient?:  [from, to],             // station-only swatch colors
  //     tracks:     [{ uri, name, artists, image, durationMs }],
  //     queuedUris: [uri, ...],             // every URI already handed to the SDK
  //   }
  //
  // Replaced `currentStation` from earlier — the shape is a superset so
  // station seeds still work, and other seed types (mood/track/artist/
  // playlist) populate `seed.type` accordingly.
  currentSession: null,

  // Tuning indicator for a session that's spinning up. Rendered by
  // NowPlayingBar in place of the regular track row from the moment the
  // user taps a tile until startSession()'s tracks arrive.
  //
  // Shape:
  //   {
  //     seed:       { type, ... },     // identifies which card was tapped
  //     name:       string,            // human label, e.g. "2010s Throwbacks"
  //     image?:     string,            // artwork
  //     gradient?:  [from, to],        // CSS colors for station swatches
  //     phase:      'intro' | 'loading',
  //     djName?:    string,            // shown during phase='intro'
  //   }
  sessionLoading: null,
  sessionError: null,

  // DJ
  currentDj: null, // mirrored from djs.currentDj for convenience on player screens
  djSpeaking: false,

  // Volume + mute (master across Spotify + DJ overlay)
  volume: 0.7,
  isMuted: false,

  // DJ-only volume multiplier (0–1). Applied to the DJ overlay's <audio>
  // element on top of the master `volume`, so dropping it makes the DJ
  // quieter relative to the music without affecting the Spotify track
  // playback. Default 1.0 → DJ plays at full master volume (parity with
  // pre-slider behavior). Master mute (`isMuted`) still silences
  // everything regardless of djVolume.
  djVolume: 1.0,

  // UI: whether the full-screen Now Playing drawer is open
  nowPlayingOpen: false,

  // UI hand-off: when the DJ Action Bar's left avatar is tapped we want
  // NowPlayingScreen to open AND auto-expand the DJ picker. Set true by
  // requestDjPicker(); NowPlayingScreen consumes + clears it on render.
  nowPlayingPickerRequest: false,

  // Refresh rehydration: when the page is reloaded, the persistence
  // layer restores currentSession + currentContext immediately, but the
  // DJ persona has to wait for djs.allDjs to load. We park the id here
  // so PlayerProvider can promote it to djs.currentDj as soon as the
  // roster arrives, then clear it.
  pendingRehydrateDjId: null,

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
    setCurrentSession: (state, action) => {
      // `queuedUris` tracks every track URI we've handed to the Spotify
      // SDK during this session (initial play + every queue refill).
      // It's read by `replaceSessionTracksIfMatch` when a stale-cache
      // refresh (or a Phase 3 refill) swaps in a new track list — we
      // filter the incoming tracks against this set so the user never
      // hears a song play twice.
      const payload = action.payload || {}
      const initialUris = Array.isArray(payload.tracks)
        ? payload.tracks.map((t) => t?.uri).filter(Boolean)
        : []
      state.currentSession = {
        ...payload,
        queuedUris: initialUris,
      }
      // Clear any leftover loading/error chrome when a session starts.
      state.sessionLoading = null
      state.sessionError = null
    },
    clearCurrentSession: (state) => {
      state.currentSession = null
    },
    // Swap in a freshly-generated track list for the currently-playing
    // session. Used by:
    //   - station seeds: after a stale weekly-cache hit triggers a
    //     background refresh on the server (the existing flow).
    //   - mood/track/artist seeds: after a Phase 3 refill request
    //     completes with brand-new recommendations.
    //
    // Matching is by `id` (the session's stable seedKey) so a stale poll
    // can't clobber a session the user navigated AWAY from to start a
    // different one.
    //
    // The incoming `tracks` are filtered against `queuedUris` so any
    // song we've already handed to Spotify's SDK (currently playing OR
    // sitting in the queue ahead of us) is excluded.
    replaceSessionTracksIfMatch: (state, action) => {
      const { id, tracks } = action.payload || {}
      if (!state.currentSession) return
      if (state.currentSession.id !== id) return
      if (!Array.isArray(tracks) || tracks.length === 0) return
      const alreadyQueued = new Set(state.currentSession.queuedUris || [])
      const filtered = tracks.filter(
        (t) => t?.uri && !alreadyQueued.has(t.uri)
      )
      // If overlap eliminated everything, keep the old list rather than
      // wiping the session to nothing.
      if (filtered.length === 0) return
      state.currentSession = {
        ...state.currentSession,
        tracks: filtered,
      }
    },
    // Append more tracks to the session WITHOUT replacing the existing
    // list. Used by Phase 3 refill: when /api/sessions/refill returns
    // fresh tracks, the player has already drained most of the queue,
    // so we want to ADD the new ones rather than replace the (empty)
    // list. Matching by id so a stale refill from an abandoned session
    // can't pollute a new one. URIs already in `queuedUris` are
    // skipped to avoid duplicates.
    appendSessionTracksIfMatch: (state, action) => {
      const { id, tracks } = action.payload || {}
      if (!state.currentSession) return
      if (state.currentSession.id !== id) return
      if (!Array.isArray(tracks) || tracks.length === 0) return
      const alreadyQueued = new Set(state.currentSession.queuedUris || [])
      const existingUris = new Set(
        (state.currentSession.tracks || []).map((t) => t?.uri).filter(Boolean)
      )
      const filtered = tracks.filter(
        (t) =>
          t?.uri && !alreadyQueued.has(t.uri) && !existingUris.has(t.uri)
      )
      if (filtered.length === 0) return
      state.currentSession = {
        ...state.currentSession,
        tracks: [...(state.currentSession.tracks || []), ...filtered],
      }
    },
    // Called by the player-side refill effect after it adds URIs to the
    // Spotify SDK queue, so future `replaceSessionTracksIfMatch` /
    // `appendSessionTracksIfMatch` calls know those URIs are already
    // spoken for and shouldn't be re-introduced.
    recordSessionQueueAdditions: (state, action) => {
      const uris = action.payload
      if (!state.currentSession || !Array.isArray(uris)) return
      const set = new Set(state.currentSession.queuedUris || [])
      for (const u of uris) if (u) set.add(u)
      state.currentSession = {
        ...state.currentSession,
        queuedUris: Array.from(set),
      }
    },
    setSessionLoading: (state, action) => {
      // Accepts the full tuning payload (see initialState comment), or
      // null to clear. We don't normalize — callers in the start-session
      // hook + AIStationsRow already build the right shape per phase.
      state.sessionLoading = action.payload
      if (action.payload) state.sessionError = null
    },
    setSessionError: (state, action) => {
      state.sessionError = action.payload
      state.sessionLoading = null
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
    setDjVolume: (state, action) => {
      // Clamp defensively — the underlying HTMLMediaElement.volume API
      // throws on values outside [0,1], and the slider is the only
      // intended caller so anything else is a bug we'd rather swallow.
      const v = Number(action.payload)
      if (Number.isFinite(v)) {
        state.djVolume = Math.max(0, Math.min(1, v))
      }
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
    // Open NowPlaying AND ask it to expand the DJ picker on next render.
    // Used by the DJ Action Bar avatar tap.
    requestDjPicker: (state) => {
      state.nowPlayingOpen = true
      state.nowPlayingPickerRequest = true
    },
    clearDjPickerRequest: (state) => {
      state.nowPlayingPickerRequest = false
    },
    setPlayerLoading: (state, action) => {
      state.loading = action.payload
    },
    setPlayerError: (state, action) => {
      state.error = action.payload
    },
    // Rehydrate the persistable subset on app boot. Only touches the
    // fields the persistence layer manages; everything else (track,
    // position, isPlaying) is left to the SDK reconnect to refill.
    hydratePersisted: (state, action) => {
      const payload = action.payload || {}
      if (payload.currentSession) state.currentSession = payload.currentSession
      if (payload.currentContext) state.currentContext = payload.currentContext
      if (payload.currentDjId != null) {
        state.pendingRehydrateDjId = payload.currentDjId
      }
    },
    clearPendingRehydrateDjId: (state) => {
      state.pendingRehydrateDjId = null
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
  setCurrentSession,
  clearCurrentSession,
  replaceSessionTracksIfMatch,
  appendSessionTracksIfMatch,
  recordSessionQueueAdditions,
  setSessionLoading,
  setSessionError,
  setCurrentDj,
  setDjSpeaking,
  setVolume,
  setDjVolume,
  setIsMuted,
  toggleMuted,
  openNowPlaying,
  closeNowPlaying,
  setNowPlayingOpen,
  requestDjPicker,
  clearDjPickerRequest,
  setPlayerLoading,
  setPlayerError,
  hydratePersisted,
  clearPendingRehydrateDjId,
} = playerSlice.actions

export default playerSlice.reducer
