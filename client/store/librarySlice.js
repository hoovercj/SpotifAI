import { createSlice } from "@reduxjs/toolkit"
import SpotifyWebApi from "spotify-web-api-node"

const spotifyApi = new SpotifyWebApi()

// 5-minute cache so flipping between tabs doesn't re-fetch immediately.
const CACHE_TTL_MS = 5 * 60 * 1000

const emptyCatalog = () => ({
  items: [],
  loading: false,
  error: null,
  fetchedAt: 0,
})

const initialState = {
  savedTracks: emptyCatalog(),
  savedAlbums: emptyCatalog(),
  savedShows: emptyCatalog(),
  savedAudiobooks: emptyCatalog(),
  followedArtists: emptyCatalog(),
  topArtists: {
    short_term: emptyCatalog(),
    medium_term: emptyCatalog(),
    long_term: emptyCatalog(),
  },
  topTracks: {
    short_term: emptyCatalog(),
    medium_term: emptyCatalog(),
    long_term: emptyCatalog(),
  },
  recentlyPlayed: emptyCatalog(),
}

const toErrorMessage = (error) =>
  error?.body?.error?.message ??
  error?.message ??
  (typeof error === "string" ? error : "Unknown error")

const librarySlice = createSlice({
  name: "library",
  initialState,
  reducers: {
    setLoading(state, action) {
      const { key, value } = action.payload
      state[key].loading = value
    },
    setError(state, action) {
      const { key, error } = action.payload
      state[key].error = error
    },
    setItems(state, action) {
      const { key, items } = action.payload
      state[key].items = items
      state[key].error = null
      state[key].fetchedAt = Date.now()
    },
    setRangedLoading(state, action) {
      const { key, range, value } = action.payload
      state[key][range].loading = value
    },
    setRangedError(state, action) {
      const { key, range, error } = action.payload
      state[key][range].error = error
    },
    setRangedItems(state, action) {
      const { key, range, items } = action.payload
      state[key][range].items = items
      state[key][range].error = null
      state[key][range].fetchedAt = Date.now()
    },
    clearAll() {
      return initialState
    },
  },
})

export const {
  setLoading,
  setError,
  setItems,
  setRangedLoading,
  setRangedError,
  setRangedItems,
  clearAll,
} = librarySlice.actions

// ── Internal helpers ──────────────────────────────────────────────────────
function ensureToken(getState) {
  const token = getState().user?.details?.accessToken
  if (!token) return null
  spotifyApi.setAccessToken(token)
  return token
}

function isFresh(catalog) {
  return catalog?.fetchedAt && Date.now() - catalog.fetchedAt < CACHE_TTL_MS
}

function makeFlatThunk(key, fetcher) {
  return (force = false) =>
    async (dispatch, getState) => {
      if (!ensureToken(getState)) return
      const catalog = getState().library[key]
      if (!force && (isFresh(catalog) || catalog.loading)) return
      dispatch(setLoading({ key, value: true }))
      try {
        const items = await fetcher(spotifyApi)
        dispatch(setItems({ key, items }))
      } catch (error) {
        dispatch(setError({ key, error: toErrorMessage(error) }))
      } finally {
        dispatch(setLoading({ key, value: false }))
      }
    }
}

// ── Thunks ────────────────────────────────────────────────────────────────
//
// We unwrap the Spotify response shapes so the slice stores a flat array of
// homogeneous items per catalog, e.g. savedTracks.items[] are `track`
// objects rather than `{ added_at, track }` wrappers.

export const fetchSavedTracks = makeFlatThunk("savedTracks", async (api) => {
  const res = await api.getMySavedTracks({ limit: 50 })
  return res.body.items.map((item) => item.track).filter(Boolean)
})

export const fetchSavedAlbums = makeFlatThunk("savedAlbums", async (api) => {
  const res = await api.getMySavedAlbums({ limit: 50 })
  return res.body.items.map((item) => item.album).filter(Boolean)
})

export const fetchSavedShows = makeFlatThunk("savedShows", async (api) => {
  const res = await api.getMySavedShows({ limit: 50 })
  return res.body.items.map((item) => item.show).filter(Boolean)
})

export const fetchSavedAudiobooks = makeFlatThunk(
  "savedAudiobooks",
  async (api) => {
    // spotify-web-api-node doesn't expose getMySavedAudiobooks in our
    // installed version — fall back to a raw fetch. The endpoint requires
    // user-library-read, which we already request.
    const token = api.getAccessToken()
    const res = await fetch("https://api.spotify.com/v1/me/audiobooks?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      // 403 = market restriction; treat as empty.
      if (res.status === 403 || res.status === 404) return []
      throw new Error(`audiobooks: HTTP ${res.status}`)
    }
    const body = await res.json()
    return (body.items || []).map((item) => item.audiobook || item).filter(Boolean)
  }
)

export const fetchFollowedArtists = makeFlatThunk(
  "followedArtists",
  async (api) => {
    const res = await api.getFollowedArtists({ limit: 50 })
    return res.body.artists?.items ?? []
  }
)

export const fetchRecentlyPlayed = makeFlatThunk(
  "recentlyPlayed",
  async (api) => {
    const res = await api.getMyRecentlyPlayedTracks({ limit: 50 })
    return res.body.items.map((item) => item.track).filter(Boolean)
  }
)

const VALID_RANGES = ["short_term", "medium_term", "long_term"]

export const fetchTopArtists = (range = "medium_term", force = false) =>
  async (dispatch, getState) => {
    if (!VALID_RANGES.includes(range)) return
    if (!ensureToken(getState)) return
    const catalog = getState().library.topArtists[range]
    if (!force && (isFresh(catalog) || catalog.loading)) return
    dispatch(setRangedLoading({ key: "topArtists", range, value: true }))
    try {
      const res = await spotifyApi.getMyTopArtists({
        limit: 50,
        time_range: range,
      })
      dispatch(setRangedItems({ key: "topArtists", range, items: res.body.items }))
    } catch (error) {
      dispatch(
        setRangedError({
          key: "topArtists",
          range,
          error: toErrorMessage(error),
        })
      )
    } finally {
      dispatch(setRangedLoading({ key: "topArtists", range, value: false }))
    }
  }

export const fetchTopTracks = (range = "medium_term", force = false) =>
  async (dispatch, getState) => {
    if (!VALID_RANGES.includes(range)) return
    if (!ensureToken(getState)) return
    const catalog = getState().library.topTracks[range]
    if (!force && (isFresh(catalog) || catalog.loading)) return
    dispatch(setRangedLoading({ key: "topTracks", range, value: true }))
    try {
      const res = await spotifyApi.getMyTopTracks({
        limit: 50,
        time_range: range,
      })
      dispatch(setRangedItems({ key: "topTracks", range, items: res.body.items }))
    } catch (error) {
      dispatch(
        setRangedError({
          key: "topTracks",
          range,
          error: toErrorMessage(error),
        })
      )
    } finally {
      dispatch(setRangedLoading({ key: "topTracks", range, value: false }))
    }
  }

export default librarySlice.reducer
