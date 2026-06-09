import { createSlice } from '@reduxjs/toolkit'
import { nanoid } from 'nanoid'

// One user session = sign-in to sign-out. The id is a nanoid minted on
// OAuth success (or session restore if missing) and persisted to
// localStorage so the per-DJ chat history on the server stays continuous
// across page reloads.
const initialState = {
  id: null,
}

const userSessionSlice = createSlice({
  name: 'userSession',
  initialState,
  reducers: {
    // Three modes:
    //   setUserSessionId()        → mint a fresh nanoid (login path)
    //   setUserSessionId(id)      → adopt the provided id (rehydration)
    //   setUserSessionId(null)    → clear (logout path)
    // The explicit `undefined` arg path is what the login flow uses;
    // null is reserved for the clear case so logout doesn't accidentally
    // re-mint an id and ping it against the logged-out account.
    setUserSessionId: (state, action) => {
      if (action.payload === null) {
        state.id = null
        return
      }
      state.id = action.payload ? action.payload : nanoid()
    },
  },
})

export const { setUserSessionId } = userSessionSlice.actions

export default userSessionSlice.reducer
