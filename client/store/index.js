import { configureStore } from "@reduxjs/toolkit"
import { createLogger } from "redux-logger"
import jamSessionReducer from "./jamSessionSlice"
import playerReducer, { hydratePersisted } from "./playerSlice"
import userReducer from "./userSlice"
import spotifyPlaylistsReducer from "./spotifyPlaylistsSlice"
import djsReducer from "./djsSlice"
import djPreferencesReducer from "./djPreferencesSlice"
import libraryReducer from "./librarySlice"
import searchReducer from "./searchSlice"
import recentSessionsReducer from "./recentSessionsSlice"
import {
  loadPersistedPlayer,
  subscribePlayerPersistence,
} from "./persistPlayer"

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

// Boot-time rehydration: restore the persistable subset of player
// state (session, context, DJ id) from localStorage so a page refresh
// preserves "Playing from {station}" and the DJ avatar — without this
// the Spotify SDK reconnect would bring the track back but the bar
// would read "Playing from your library" with no host.
const persistedPlayer = loadPersistedPlayer()
if (persistedPlayer) {
  store.dispatch(hydratePersisted(persistedPlayer))
}
subscribePlayerPersistence(store)

export default store

