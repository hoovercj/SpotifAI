import { createSlice } from '@reduxjs/toolkit'
import axios from 'axios'
import { clearPersistedPlayer } from './persistPlayer'
import { setUserSessionId } from './userSessionSlice'
import {
  clearPlaybackSession,
  setCurrentContext,
} from './playerSlice'
import { setCurrentDj } from './djsSlice'
import { setAuthUser, clearAuthUser } from '../lib/telemetry'

const initialState = {
  code: null,
  details: null,
  profile: null,
  showProfile: false,
  useBackendApis: true,
  // True until the initial /api/spotify/session probe finishes. The login
  // screen is suppressed while this is true so the UI doesn't flash the
  // "Login With Spotify" card on every page-load for already-signed-in users.
  sessionLoading: true,
}

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.details = action.payload
    },
    clearUser: (state) => {
      state.details = null
      state.profile = null
    },
    setCode: (state, action) => {
      state.code = action.payload
    },
    setProfile: (state, action) => {
      state.profile = action.payload
    },
    clearProfile: (state) => {
      state.profile = null
    },
    showProfile: (state, action) => {
      state.showProfile = true
    },
    hideProfile: (state, action) => {
      state.showProfile = false
    },
    toggleUseBackendApis: (state) => {
      state.useBackendApis = !state.useBackendApis
    },
    setSessionLoading: (state, action) => {
      state.sessionLoading = action.payload
    },
  },
})

export const {
  setUser,
  clearUser,
  setCode,
  setProfile,
  clearProfile,
  showProfile,
  hideProfile,
  toggleUseBackendApis,
  setSessionLoading,
} = userSlice.actions

export const fetchProfile = () => async (dispatch) => {
  try {
    const { data } = await axios.get('api/profile')
    dispatch(setProfile(data))
  } catch (err) {
    console.log(err)
  }
}

export const updateProfile = (profile) => async (dispatch) => {
  try {
    const { data } = await axios.put('api/profile', profile)
    dispatch(setProfile(data))
    dispatch(hideProfile())
  } catch (err) {
    console.log(err)
  }
}

// Hydrate Redux from an existing server-side session on app startup. The
// server returns 401 when there is no usable session (or the refresh token has
// been revoked), in which case we just leave the store empty so the login
// screen renders.
export const restoreSession = () => async (dispatch) => {
  try {
    const { data } = await axios.get('/api/spotify/session')
    const { profile, ...details } = data
    dispatch(setUser(details))
    // Identify the user to App Insights using the server-supplied
    // HMAC hash. The plain email never leaves our DB.
    if (details?.userIdHash) setAuthUser(details.userIdHash)
    if (profile) dispatch(setProfile(profile))
  } catch (err) {
    if (err?.response?.status !== 401) {
      console.warn('restoreSession failed:', err?.response?.status, err?.message)
    }
  } finally {
    dispatch(setSessionLoading(false))
  }
}

// Destroy the server session, then clear local state. Done in that order so a
// network failure leaves the user visibly signed in (rather than locked out
// client-side with a stale cookie still being respected by the server).
export const logoutUser = () => async (dispatch) => {
  try {
    await axios.post('/api/spotify/logout')
  } catch (err) {
    console.warn('Server logout failed:', err?.response?.status, err?.message)
  }
  // Reset the persistable player slice fields BEFORE wiping localStorage,
  // otherwise the next subscriber tick would re-persist the previous
  // user's session/context/DJ on top of the empty snapshot we just wrote.
  dispatch(clearPlaybackSession())
  dispatch(setCurrentContext(null))
  dispatch(setCurrentDj(null))
  // Null the user session id too so the next sign-in mints a fresh
  // one. Passing null explicitly because the slice's payloadless call
  // would generate a new nanoid here, which would be wasteful and
  // briefly tracked in App Insights against the logged-out tab.
  dispatch(setUserSessionId(null))
  clearPersistedPlayer()
  clearAuthUser()
  dispatch(clearUser())
}

export default userSlice.reducer
