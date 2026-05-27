import { createSlice } from "@reduxjs/toolkit"
import SpotifyWebApi from "spotify-web-api-node"

const spotifyApi = new SpotifyWebApi()

const RECENT_KEY = "spotifai.recentSearches"
const RECENT_MAX = 10

// One Spotify search page per fetch. Post-Nov-2024 Spotify quietly capped
// search `limit` at 10 for new third-party apps (anything larger comes back
// as 400 "Invalid limit"). Keeping a small page size also makes pagination
// feel snappier.
const PAGE_SIZE = 10
const SPOTIFY_MAX_OFFSET = 1000

// Order here drives pill rendering order. Default selection is "playlist".
export const SEARCH_TYPES = [
  "playlist",
  "track",
  "artist",
  "album",
  "show",
  "audiobook",
]

const TYPE_TO_RESPONSE_KEY = {
  track: "tracks",
  artist: "artists",
  album: "albums",
  playlist: "playlists",
  show: "shows",
  audiobook: "audiobooks",
}

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

function emptyTypeState() {
  return {
    items: [],
    offset: 0,
    hasMore: true,
    loading: false,
    error: null,
    // Bumped every time we kick off a new page fetch so stale slow responses
    // (after the query changed mid-flight, for example) can be dropped.
    requestId: 0,
  }
}

function emptyByType() {
  return SEARCH_TYPES.reduce((acc, t) => {
    acc[t] = emptyTypeState()
    return acc
  }, {})
}

const initialState = {
  query: "",
  activeType: "playlist",
  byType: emptyByType(),
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
      const next = action.payload ?? ""
      if (next === state.query) return
      state.query = next
      // Every query change invalidates all per-type pages.
      state.byType = emptyByType()
    },
    setActiveType(state, action) {
      if (!SEARCH_TYPES.includes(action.payload)) return
      state.activeType = action.payload
    },
    startTypePage(state, action) {
      const { type, requestId } = action.payload
      const ts = state.byType[type]
      if (!ts) return
      ts.loading = true
      ts.error = null
      ts.requestId = requestId
    },
    completeTypePage(state, action) {
      const { type, requestId, items, nextOffset, hasMore } = action.payload
      const ts = state.byType[type]
      if (!ts || ts.requestId !== requestId) return
      ts.items = ts.items.concat(items)
      ts.offset = nextOffset
      ts.hasMore = hasMore
      ts.loading = false
    },
    failTypePage(state, action) {
      const { type, requestId, error } = action.payload
      const ts = state.byType[type]
      if (!ts || ts.requestId !== requestId) return
      ts.error = error
      ts.loading = false
      // Critical: stop the infinite-scroll sentinel from immediately
      // re-firing this same request after a 4xx/5xx. Without flipping
      // `hasMore` off, the IntersectionObserver in SearchTab.jsx sees the
      // empty results list and keeps triggering fetchNextPage forever.
      ts.hasMore = false
    },
    clearResults(state) {
      state.byType = emptyByType()
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
  setActiveType,
  startTypePage,
  completeTypePage,
  failTypePage,
  clearResults,
  pushRecent,
  removeRecent,
  clearRecent,
} = searchSlice.actions

/**
 * Fetch the next page for a single result type. Idempotent: refuses to fire
 * when the type is already loading, when there is nothing more to fetch, or
 * when the query is empty. Stale responses (query changed mid-flight) are
 * discarded by `requestId` matching inside the reducers.
 */
export const fetchNextPage = (type) => async (dispatch, getState) => {
  const state = getState()
  const query = state.search.query.trim()
  if (!query) return
  if (!SEARCH_TYPES.includes(type)) return
  const ts = state.search.byType[type]
  if (!ts || ts.loading || !ts.hasMore) return
  const token = state.user?.details?.accessToken
  if (!token) return

  spotifyApi.setAccessToken(token)
  const requestId = Date.now()
  dispatch(startTypePage({ type, requestId }))

  try {
    const res = await spotifyApi.search(query, [type], {
      limit: PAGE_SIZE,
      offset: ts.offset,
    })
    const key = TYPE_TO_RESPONSE_KEY[type]
    // Spotify occasionally returns nulls inside the items array (deprecated
    // editorial entries especially in playlists). Strip them so the UI does
    // not crash when rendering name/uri/owner.
    const items = (res.body?.[key]?.items ?? []).filter(Boolean)
    const total = res.body?.[key]?.total ?? 0
    const nextOffset = ts.offset + PAGE_SIZE
    const hasMore =
      items.length === PAGE_SIZE &&
      nextOffset < Math.min(total || Infinity, SPOTIFY_MAX_OFFSET)
    dispatch(completeTypePage({ type, requestId, items, nextOffset, hasMore }))
  } catch (error) {
    dispatch(failTypePage({ type, requestId, error: toErrorMessage(error) }))
  }
}

export default searchSlice.reducer
