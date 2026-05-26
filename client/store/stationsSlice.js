import { createSlice } from "@reduxjs/toolkit"
import axios from "axios"
import SpotifyWebApi from "spotify-web-api-node"

const spotifyApi = new SpotifyWebApi()

const initialState = {
  allStations: [],
  currentStation: null,
  loading: false,
  error: null,
}

const stationsSlice = createSlice({
  name: "stations",
  initialState,
  reducers: {
    addStation: (state, action) => {
      if (
        !state.allStations.find((station) => station.id === action.payload.id)
      ) {
        state.allStations.push(action.payload)
      }
    },
    addStations: (state, action) => {
      state.allStations = [...state.allStations, ...action.payload]
    },
    removeStation: (state, action) => {
      state.allStations = state.allStations.filter(
        (station) => station.id !== action.payload.id
      )
    },
    clearStations: (state) => {
      state.allStations = []
    },
    setStationsLoading: (state, action) => {
      state.loading = action.payload
    },
    setStationsError: (state, action) => {
      state.error = action.payload
    },
    setCurrentStation: (state, action) => {
      state.currentStation = action.payload
    },
    clearCurrentStation: (state) => {
      state.currentStation = null
    },
  },
})

export const {
  addStation,
  addStations,
  removeStation,
  clearStations,
  setStationsLoading,
  setStationsError,
  setCurrentStation,
  clearCurrentStation,
} = stationsSlice.actions

// Pull a plain-string error message out of a SpotifyWebApi / fetch / generic
// error so we can put it into Redux state without triggering RTK's
// non-serializable warning.
const toErrorMessage = (error) =>
  error?.body?.error?.message ??
  error?.message ??
  (typeof error === 'string' ? error : 'Unknown error')

export const fetchStations = (uriArray) => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setStationsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    // Fetch each playlist independently so one missing/forbidden ID doesn't
    // tank the whole batch. Spotify deprecated editorial playlists for
    // Dev-Mode apps in Nov 2024, so 404s on `37i9dQZF1...` IDs are expected
    // and should be skipped rather than surfaced as an error.
    const results = await Promise.allSettled(
      uriArray.map((uri) => spotifyApi.getPlaylist(uri))
    )

    const stationArray = []
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        stationArray.push(result.value.body)
      } else {
        console.warn(
          `fetchStations: skipped playlist ${uriArray[idx]}:`,
          toErrorMessage(result.reason)
        )
      }
    })

    if (stationArray.length > 0) dispatch(addStations(stationArray))
  } catch (error) {
    dispatch(setStationsError(toErrorMessage(error)))
  } finally {
    dispatch(setStationsLoading(false))
  }
}

export const fetchStation = (uri) => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setStationsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    const res = await spotifyApi.getPlaylist(uri)
    dispatch(addStation(res.body))
  } catch (error) {
    dispatch(setStationsError(toErrorMessage(error)))
  } finally {
    dispatch(setStationsLoading(false))
  }
}

export const setCurrentStationByUri = (uri) => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setStationsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    const res = await spotifyApi.getPlaylist(uri)
    dispatch(setCurrentStation(res.body))
  } catch (error) {
    dispatch(setStationsError(toErrorMessage(error)))
  } finally {
    dispatch(setStationsLoading(false))
  }
}

export const fetchUserStations = () => async (dispatch, getState) => {
  try {
    if (!getState().user.details.accessToken) return
    dispatch(setStationsLoading(true))

    spotifyApi.setAccessToken(getState().user.details.accessToken)
    const res = await spotifyApi.getUserPlaylists()
    dispatch(addStations(res.body.items))
  } catch (error) {
    dispatch(setStationsError(toErrorMessage(error)))
  } finally {
    dispatch(setStationsLoading(false))
  }
}

export default stationsSlice.reducer
