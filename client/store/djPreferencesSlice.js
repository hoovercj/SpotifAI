import { createSlice } from '@reduxjs/toolkit'
import axios from 'axios'

/**
 * DJ preferences (Phase 6/7).
 *
 *   exclusiveDjId            — if non-null, the user has locked one DJ
 *                              as the global host for every non-station
 *                              session.
 *   preferencesBySeedKey     — per-seed overrides. Map seedKey → djId.
 *
 * The server stores these in the `settings.exclusiveDjId` column and the
 * `user_dj_preferences` table respectively. The reducer just mirrors
 * them client-side for synchronous render decisions in the Mic2 picker.
 */

const initialState = {
  exclusiveDjId: null,
  preferencesBySeedKey: {}, // { [seedKey: string]: number }
  loading: false,
  error: null,
}

const slice = createSlice({
  name: 'djPreferences',
  initialState,
  reducers: {
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
    },
    setExclusiveDjId: (state, action) => {
      state.exclusiveDjId = action.payload ?? null
    },
    setPreference: (state, action) => {
      const { seedKey, djId } = action.payload
      if (!seedKey) return
      state.preferencesBySeedKey[seedKey] = djId
    },
    removePreference: (state, action) => {
      const seedKey = action.payload
      if (!seedKey) return
      delete state.preferencesBySeedKey[seedKey]
    },
  },
})

export const {
  setLoading,
  setError,
  setExclusiveDjId,
  setPreference,
  removePreference,
} = slice.actions

export const fetchExclusiveDj = () => async (dispatch) => {
  try {
    dispatch(setLoading(true))
    const { data } = await axios.get('/api/content/exclusive-dj')
    dispatch(setExclusiveDjId(data?.djId ?? null))
  } catch (err) {
    // Anonymous / not-yet-saved users get 401/404 here; that's fine —
    // null is the correct "no exclusive DJ" state.
    if (err?.response?.status !== 401 && err?.response?.status !== 404) {
      dispatch(setError(err.message))
    }
  } finally {
    dispatch(setLoading(false))
  }
}

export const updateExclusiveDj = (djId) => async (dispatch) => {
  try {
    const { data } = await axios.put('/api/content/exclusive-dj', { djId })
    dispatch(setExclusiveDjId(data?.djId ?? null))
  } catch (err) {
    dispatch(setError(err.message))
  }
}

export const clearExclusiveDj = () => updateExclusiveDj(null)

export const fetchPreferenceForSeed = (seedKey) => async (dispatch) => {
  if (!seedKey) return
  try {
    const { data } = await axios.get(
      `/api/content/dj-preference/${encodeURIComponent(seedKey)}`
    )
    if (data?.djId) {
      dispatch(setPreference({ seedKey, djId: data.djId }))
    } else {
      dispatch(removePreference(seedKey))
    }
  } catch (err) {
    // 404 = no preference for this seed yet, which is the common path.
    if (err?.response?.status === 404) {
      dispatch(removePreference(seedKey))
    } else if (err?.response?.status !== 401) {
      dispatch(setError(err.message))
    }
  }
}

export const setPreferenceForSeed =
  ({ seedKey, djId }) =>
  async (dispatch) => {
    if (!seedKey || !djId) return
    try {
      const { data } = await axios.put(
        `/api/content/dj-preference/${encodeURIComponent(seedKey)}`,
        { djId }
      )
      dispatch(setPreference({ seedKey, djId: data?.djId ?? djId }))
    } catch (err) {
      dispatch(setError(err.message))
    }
  }

export const deletePreferenceForSeed = (seedKey) => async (dispatch) => {
  if (!seedKey) return
  try {
    await axios.delete(
      `/api/content/dj-preference/${encodeURIComponent(seedKey)}`
    )
    dispatch(removePreference(seedKey))
  } catch (err) {
    dispatch(setError(err.message))
  }
}

export default slice.reducer
