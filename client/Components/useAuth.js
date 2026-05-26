import { useState, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { setUser } from "../store/userSlice"
import { fetchProfile } from "../store/userSlice"
import { setJamSessionId } from "../store/jamSessionSlice"
import { useNavigate } from "react-router-dom"
import axios from "axios"

export default function useAuth(code) {
  const [accessToken, setAccessToken] = useState()
  const [expiresIn, setExpiresIn] = useState()
  const user = useSelector((state) => state.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  // If the session was restored on mount, pick up the accessToken/expiresIn
  // from the store so the refresh interval below can take over without
  // needing the user to go through the OAuth code-exchange path.
  useEffect(() => {
    if (!accessToken && user?.details?.accessToken) {
      setAccessToken(user.details.accessToken)
      setExpiresIn(user.details.expiresIn)
    }
  }, [user?.details?.accessToken])

  useEffect(() => {
    const fetchSpotifyAuthData = async () => {
      try {
        const response = await axios.post("/api/spotify/login", {
          code,
        })

        dispatch(setUser(response.data))
        dispatch(fetchProfile())
        dispatch(setJamSessionId())
        setAccessToken(response.data.accessToken)
        setExpiresIn(response.data.expiresIn)

        window.history.pushState({}, null, "/")
        // navigate("/home")
      } catch (error) {
        window.location = "/"
      }
    }

    if (code) {
      fetchSpotifyAuthData()
    }
  }, [!!(code || user?.details?.accessToken)])

  useEffect(() => {
    // The refresh token lives on the server (in the signed session cookie).
    // We just need to poke /api/spotify/refresh before the current access
    // token expires; the server uses its session copy of the refresh token
    // to mint a new access token.
    if (!expiresIn) return

    const interval = setInterval(async () => {
      try {
        const response = await axios.post("/api/spotify/refresh")

        dispatch(setUser(response.data))
        setAccessToken(response.data.accessToken)
        setExpiresIn(response.data.expiresIn)
      } catch (error) {
        window.location = "/"
      }
    }, Math.max(60, expiresIn - 60) * 1000)

    return () => clearInterval(interval)
  }, [expiresIn])

  return accessToken
}
