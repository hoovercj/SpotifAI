import React, { useEffect } from "react"
import { useDispatch } from "react-redux"
import { Routes, Route, Navigate } from "react-router-dom"
import useAuth from "./useAuth"
import UserProfile from "./UserProfile"
import AppShell from "./shell/AppShell"
import HomeTab from "./tabs/HomeTab"
import SearchTab from "./tabs/SearchTab"
import LibraryTab from "./tabs/LibraryTab"
import { PlayerProvider } from "./player/PlayerProvider"
import NowPlayingScreen from "./player/NowPlayingScreen"
import { fetchDjs } from "../store/djsSlice"
import { fetchUserPlaylists } from "../store/spotifyPlaylistsSlice"

/**
 * Mounted once the user is authenticated (or has a fresh OAuth `code`).
 *  - Drives the OAuth/refresh loop via `useAuth(code)`
 *  - Boots the Redux catalogs once an accessToken is available
 *  - Renders the AppShell with the three nested tab routes
 *  - Hosts the UserProfile dialog (opens from AccountMenu)
 *  - Redirects legacy /radio/* bookmarks to /home
 */
export default function AppAuthWrapper({ code }) {
  const dispatch = useDispatch()
  const accessToken = useAuth(code)

  useEffect(() => {
    dispatch(fetchDjs())
  }, [dispatch])

  useEffect(() => {
    if (accessToken) {
      // Spotify deprecated Dev-Mode access to editorial/algorithmic
      // playlists in Nov 2024. We only show playlists owned by the
      // signed-in user.
      dispatch(fetchUserPlaylists())
    }
  }, [accessToken, dispatch])

  return (
    <PlayerProvider>
      <UserProfile />
      <NowPlayingScreen />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomeTab />} />
          <Route path="/search" element={<SearchTab />} />
          <Route path="/library" element={<LibraryTab />} />
          {/* Backwards-compat: old HashRouter paths used /radio/* */}
          <Route path="/radio/*" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </PlayerProvider>
  )
}
