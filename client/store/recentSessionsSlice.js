import { createSlice, createAsyncThunk } from "@reduxjs/toolkit"

/**
 * Server-backed "recently played" sessions store.
 *
 * Mirrors the rows in the `recent_session` Postgres table for the
 * signed-in user, so the list follows them across devices.
 *
 * Each item:
 *   {
 *     seedKey:    string,         // stable identifier
 *     seed:       { type, ... },  // the original seed the server can replay
 *     name:       string,         // display name on the tile
 *     djId:       number|null,
 *     imageUrl:   string|null,
 *     lastUsedAt: string,         // ISO timestamp
 *   }
 *
 * Fetched lazily on HomeTab mount. Refetched after any successful
 * `useStartSession.start()` so the row stays current — but that refetch
 * is a fire-and-forget from the hook, not coupled to playback success.
 */

export const fetchRecentSessions = createAsyncThunk(
  "recentSessions/fetch",
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch("/api/sessions/recent?limit=20", {
        credentials: "include",
      })
      if (!res.ok) {
        // 401 just means we don't have a Spotify session yet — treat as
        // empty list rather than an error so the home screen renders
        // cleanly during the auth bounce.
        if (res.status === 401) return []
        const body = await safeJson(res)
        return rejectWithValue(
          body?.error || `Failed to fetch recent sessions (${res.status})`
        )
      }
      const json = await res.json()
      return Array.isArray(json?.items) ? json.items : []
    } catch (err) {
      return rejectWithValue(err?.message || "Network error")
    }
  }
)

export const removeRecentSession = createAsyncThunk(
  "recentSessions/remove",
  async (seedKey, { rejectWithValue }) => {
    try {
      const res = await fetch(
        `/api/sessions/recent/${encodeURIComponent(seedKey)}`,
        { method: "DELETE", credentials: "include" }
      )
      if (!res.ok) {
        const body = await safeJson(res)
        return rejectWithValue(
          body?.error || `Failed to remove recent (${res.status})`
        )
      }
      return seedKey
    } catch (err) {
      return rejectWithValue(err?.message || "Network error")
    }
  }
)

const initialState = {
  items: [],
  loading: false,
  error: null,
  // Bumped optimistically whenever a session starts (so HomeTab can
  // trigger a background refetch without a separate side-channel).
  bumpToken: 0,
}

const recentSessionsSlice = createSlice({
  name: "recentSessions",
  initialState,
  reducers: {
    bumpRecent: (state) => {
      state.bumpToken += 1
    },
    // Optimistic move-to-front when the user taps a tile in Home. The
    // server records the bump on the next /start anyway; this just
    // updates the UI immediately so the just-tapped tile doesn't briefly
    // sit in its old slot.
    promoteRecent: (state, action) => {
      const seedKey = action.payload
      const idx = state.items.findIndex((it) => it.seedKey === seedKey)
      if (idx <= 0) return
      const [item] = state.items.splice(idx, 1)
      state.items.unshift({ ...item, lastUsedAt: new Date().toISOString() })
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecentSessions.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchRecentSessions.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchRecentSessions.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || "Failed to fetch recent sessions"
      })
      .addCase(removeRecentSession.fulfilled, (state, action) => {
        state.items = state.items.filter((it) => it.seedKey !== action.payload)
      })
  },
})

async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export const { bumpRecent, promoteRecent } = recentSessionsSlice.actions
export default recentSessionsSlice.reducer
