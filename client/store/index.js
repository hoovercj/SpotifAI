import { configureStore } from "@reduxjs/toolkit"
import { createLogger } from "redux-logger"
import jamSessionReducer from "./jamSessionSlice"
import playerReducer from "./playerSlice"
import userReducer from "./userSlice"
import stationsReducer from "./stationsSlice"
import djsReducer from "./djsSlice"
import libraryReducer from "./librarySlice"
import searchReducer from "./searchSlice"

const loggerMiddleware = createLogger({
  collapsed: true,
})

// @reduxjs/toolkit already includes redux-thunk in getDefaultMiddleware().
const store = configureStore({
  reducer: {
    user: userReducer,
    jamSession: jamSessionReducer,
    player: playerReducer,
    stations: stationsReducer,
    djs: djsReducer,
    library: libraryReducer,
    search: searchReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(loggerMiddleware),
})

export default store
