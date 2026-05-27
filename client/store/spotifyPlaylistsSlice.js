import { createSlice } from "@reduxjs/toolkit"
import axios from "axios"
import SpotifyWebApi from "spotify-web-api-node"

const spotifyApi = new SpotifyWebApi()

/**
 * Holds the user's saved Spotify playlists fetched from the Spotify Web API.
 *
 * NOTE: confusingly named "stations" until May 2026 — it has NEVER held
 * SpotifAI's own AI Stations (those live in `playerSlice.currentStation`
 * and the static catalog in `server/services/aiStations/catalog.js`).
 * This slice is purely about Spotify-side playlist objects.
 *
 * Today's only active consumer is the Home tab's "Your playlists" row,
 * populated on app boot via `fetchUserPlaylists()` in AppAuthWrapper.
 * The other thunks (`fetchPlaylist`, `fetchPlaylists`,
 * `setCurrentPlaylistByUri`) and the `removePlaylist` / `clearPlaylists`
 * actions are kept for future surfaces (e.g. a playlist-detail view)
 * but currently have no callers.
 */
const initialState = {
  allPlaylists: [],
  currentPlaylist: null,
  loading: false,
  error: null,
}

const spotifyPlaylistsSlice = createSlice({
  name: "spotifyPlaylists",
  initialState,
  reducers: {
    addPlaylist: (state, action) => {
      if (
        !state.allPlaylists.find((playlist) => playlist.id === action.payload.id)
      ) {
        state.allPlaylists.push(action.payload)
      }
    },
    addPlaylists: (state, action) => {
      state.allPlaylists = [...state.allPlaylists, ...action.payload]
    },
    removePlaylist: (state, action) => {
      state.allPlaylists = state.allPlaylists.filter(
        (playlist) => playlist.id !== action.payload.id
      )
    },
    clearPlaylists: (state) => {
      state.allPlaylists = []
    },
    setPlaylistsLoading: (state, action) => {
      state.loading = action.payload
    },
    setPlaylistsError: (state, action) => {
      state.error = action.payload
    },
    setCurrentPlaylist: (state, action) => {
      state.currentPlaylist = action.payload
    },
    clearCurrentPlaylist: (state) => {
      state.currentPlaylist = null
    },
  },
})

export const {
  addPlaylist,
  addPlaylists,
  removePlaylist,
  clearPlaylists,
  setPlaylistsLoading,
  setPlaylistsError,
  setCurrentPlaylist,
  clearCurrentPlaylist,
} = spotifyPlaylistsSlice.actions

// Pull a plain-string error message out of a SpotifyWebApi / fetch / generic
// error so we can put it into Redux state without triggering RTK's
// non-serializable warning.
const toErrorMessage = (error) =>
  error?.body?.error?.message ??
  error?.message ??
  (typeof error === 'string' ? error : 'Unknown error')

export const fetchPlaylists = (uriArray) => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setPlaylistsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    // Fetch each playlist independently so one missing/forbidden ID doesn't
    // tank the whole batch. Spotify deprecated editorial playlists for
    // Dev-Mode apps in Nov 2024, so 404s on `37i9dQZF1...` IDs are expected
    // and should be skipped rather than surfaced as an error.
    const results = await Promise.allSettled(
      uriArray.map((uri) => spotifyApi.getPlaylist(uri))
    )

    const playlistArray = []
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        playlistArray.push(result.value.body)
      } else {
        console.warn(
          `fetchPlaylists: skipped playlist ${uriArray[idx]}:`,
          toErrorMessage(result.reason)
        )
      }
    })

    if (playlistArray.length > 0) dispatch(addPlaylists(playlistArray))
  } catch (error) {
    dispatch(setPlaylistsError(toErrorMessage(error)))
  } finally {
    dispatch(setPlaylistsLoading(false))
  }
}

export const fetchPlaylist = (uri) => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setPlaylistsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    const res = await spotifyApi.getPlaylist(uri)
    dispatch(addPlaylist(res.body))
  } catch (error) {
    dispatch(setPlaylistsError(toErrorMessage(error)))
  } finally {
    dispatch(setPlaylistsLoading(false))
  }
}

export const setCurrentPlaylistByUri = (uri) => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setPlaylistsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    const res = await spotifyApi.getPlaylist(uri)
    dispatch(setCurrentPlaylist(res.body))
  } catch (error) {
    dispatch(setPlaylistsError(toErrorMessage(error)))
  } finally {
    dispatch(setPlaylistsLoading(false))
  }
}

export const fetchUserPlaylists = () => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setPlaylistsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    const res = await spotifyApi.getUserPlaylists()
    dispatch(addPlaylists(res.body.items))
  } catch (error) {
    dispatch(setPlaylistsError(toErrorMessage(error)))
  } finally {
    dispatch(setPlaylistsLoading(false))
  }
}

export default spotifyPlaylistsSlice.reducer
