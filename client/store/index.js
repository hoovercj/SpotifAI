import { configureStore } from "@reduxjs/toolkit"
import { createLogger } from "redux-logger"
import jamSessionReducer from "./jamSessionSlice"
import playerReducer from "./playerSlice"
import userReducer from "./userSlice"
import spotifyPlaylistsReducer from "./spotifyPlaylistsSlice"
import djsReducer from "./djsSlice"
import djPreferencesReducer from "./djPreferencesSlice"
import libraryReducer from "./librarySlice"
import searchReducer from "./searchSlice"
import recentSessionsReducer from "./recentSessionsSlice"

const loggerMiddleware = createLogger({
  collapsed: true,
})

// @reduxjs/toolkit already includes redux-thunk in getDefaultMiddleware().
const store = configureStore({
  reducer: {
    user: userReducer,
    jamSession: jamSessionReducer,
    player: playerReducer,
    spotifyPlaylists: spotifyPlaylistsReducer,
    djs: djsReducer,
    djPreferences: djPreferencesReducer,
    library: libraryReducer,
    search: searchReducer,
    recentSessions: recentSessionsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(loggerMiddleware),
})

export default store
