import { createSlice } from "@reduxjs/toolkit"
import SpotifyWebApi from "spotify-web-api-node"

const spotifyApi = new SpotifyWebApi()

const RECENT_KEY = "spotifai.recentSearches"
const RECENT_MAX = 10

function loadRecent() {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function persistRecent(list) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
  } catch {
    /* ignore quota errors */
  }
}

const DEFAULT_TYPES = ["track", "artist", "album", "playlist", "show", "audiobook"]

const initialState = {
  query: "",
  // request token of the most recent search; results from older tokens are
  // ignored so a stale slow response can't overwrite a fast new one.
  requestId: 0,
  loading: false,
  error: null,
  results: {
    tracks: [],
    artists: [],
    albums: [],
    playlists: [],
    shows: [],
    audiobooks: [],
  },
  recent: loadRecent(),
}

const toErrorMessage = (error) =>
  error?.body?.error?.message ??
  error?.message ??
  (typeof error === "string" ? error : "Unknown error")

const searchSlice = createSlice({
  name: "search",
  initialState,
  reducers: {
    setQuery(state, action) {
      state.query = action.payload
    },
    startSearch(state, action) {
      state.loading = true
      state.error = null
      state.requestId = action.payload
    },
    completeSearch(state, action) {
      const { requestId, results } = action.payload
      if (requestId !== state.requestId) return
      state.loading = false
      state.results = { ...initialState.results, ...results }
    },
    failSearch(state, action) {
      const { requestId, error } = action.payload
      if (requestId !== state.requestId) return
      state.loading = false
      state.error = error
    },
    clearResults(state) {
      state.results = initialState.results
      state.loading = false
      state.error = null
    },
    pushRecent(state, action) {
      const q = String(action.payload || "").trim()
      if (!q) return
      const existing = state.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())
      state.recent = [q, ...existing].slice(0, RECENT_MAX)
      persistRecent(state.recent)
    },
    removeRecent(state, action) {
      state.recent = state.recent.filter((r) => r !== action.payload)
      persistRecent(state.recent)
    },
    clearRecent(state) {
      state.recent = []
      persistRecent([])
    },
  },
})

export const {
  setQuery,
  startSearch,
  completeSearch,
  failSearch,
  clearResults,
  pushRecent,
  removeRecent,
  clearRecent,
} = searchSlice.actions

export const searchAll = (query, types = DEFAULT_TYPES) =>
  async (dispatch, getState) => {
    const token = getState().user?.details?.accessToken
    if (!token) return
    const trimmed = String(query || "").trim()
    if (!trimmed) {
      dispatch(clearResults())
      return
    }
    spotifyApi.setAccessToken(token)
    const requestId = Date.now()
    dispatch(startSearch(requestId))

    try {
      const res = await spotifyApi.search(trimmed, types, { limit: 8 })
      const body = res.body || {}
      dispatch(
        completeSearch({
          requestId,
          results: {
            tracks: body.tracks?.items ?? [],
            artists: body.artists?.items ?? [],
            albums: body.albums?.items ?? [],
            // Spotify occasionally returns nulls inside the playlists.items
            // array (deprecated editorial entries). Filter them out so the
            // UI doesn't crash when rendering name/uri.
            playlists: (body.playlists?.items ?? []).filter(Boolean),
            shows: body.shows?.items ?? [],
            audiobooks: body.audiobooks?.items ?? [],
          },
        })
      )
    } catch (error) {
      dispatch(failSearch({ requestId, error: toErrorMessage(error) }))
    }
  }

export default searchSlice.reducer
