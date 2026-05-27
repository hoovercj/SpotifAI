/**
 * Shared helper for route handlers that need a valid Spotify access token.
 *
 * If the session's access token is expired (or within REFRESH_BUFFER_MS of
 * expiring), uses the refresh token to mint a fresh one and mutates
 * `req.session` in place. Returns `true` if there is a usable token on the
 * session afterwards, `false` otherwise.
 *
 * Previously this lived inline in `routes/stations.js` (kept there to avoid
 * a circular import with `routes/spotify.js`). Extracted now so both
 * /api/stations and /api/sessions can share one implementation.
 */
const SpotifyWebApi = require("spotify-web-api-node")

const REFRESH_BUFFER_MS = 60 * 1000

async function ensureFreshAccessToken(req) {
  if (!req.session?.refreshToken) return false
  if (
    req.session.accessToken &&
    req.session.expiresAt &&
    req.session.expiresAt - REFRESH_BUFFER_MS > Date.now()
  ) {
    return true
  }
  const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    refreshToken: req.session.refreshToken,
  })
  try {
    const { body } = await spotifyApi.refreshAccessToken()
    req.session.accessToken = body.access_token
    req.session.expiresIn = body.expires_in
    req.session.expiresAt = Date.now() + body.expires_in * 1000
    if (body.refresh_token) req.session.refreshToken = body.refresh_token
    return true
  } catch (err) {
    console.error("Spotify token refresh failed:", err)
    return false
  }
}

module.exports = { ensureFreshAccessToken, REFRESH_BUFFER_MS }
