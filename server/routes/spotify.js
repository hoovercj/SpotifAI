const router = require('express').Router()
const SpotifyWebApi = require('spotify-web-api-node')
const { User, Profile } = require('../db')
const logger = require('../services/logger')
const { trackEvent, trackException } = require('../services/telemetry')
const { hashUserId } = require('../services/utl/hashUserId')

const spotifyRedirect = process.env.SPOTIFY_REDIRECT_URI

// Refresh ~60s before the token actually expires so we don't hand the client a
// nearly-expired token.
const REFRESH_BUFFER_MS = 60 * 1000

// Build the JSON payload returned to the client whenever a session is created
// or restored. Mirrors what the original `/login` returned so the client store
// shape stays identical.
const buildUserPayload = (session, profile) => ({
  // Email is NOT shipped to the client — it's PII and nothing in the
  // client actually reads it. The hash below is enough to identify
  // the user to App Insights without exposing the address.
  displayName: session.displayName,
  accessToken: session.accessToken,
  // Note: refreshToken intentionally stays server-side only and is no longer
  // sent to the client (it used to be — that was unnecessary and risky).
  expiresIn: Math.max(
    1,
    Math.floor(((session.expiresAt || 0) - Date.now()) / 1000)
  ),
  isAdmin: session.isAdmin,
  // One-way hash of the email. The client passes this to App Insights as
  // the authenticated-user id so cross-device telemetry can collapse
  // onto a single user without leaking the email into the analytics
  // pipeline. The email itself stays in our DB.
  userIdHash: hashUserId(session.email),
  profile,
})

// Use the refresh token in the current session to mint a new access token and
// update `req.session` in place. Returns true on success, false on failure
// (e.g. refresh token revoked / expired).
async function refreshSessionToken(req) {
  if (!req.session?.refreshToken) return false
  const spotifyApi = new SpotifyWebApi({
    redirectUri: spotifyRedirect,
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    refreshToken: req.session.refreshToken,
  })
  try {
    const { body } = await spotifyApi.refreshAccessToken()
    req.session.accessToken = body.access_token
    req.session.expiresIn = body.expires_in
    req.session.expiresAt = Date.now() + body.expires_in * 1000
    // Spotify may rotate the refresh token; persist if so.
    if (body.refresh_token) req.session.refreshToken = body.refresh_token
    return true
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'spotify.refreshAccessToken_failed')
    trackException(err, { route: 'spotify.refresh' })
    return false
  }
}

router.post('/refresh', async (req, res) => {
  // Backwards-compatible refresh endpoint used by the legacy `useAuth` hook.
  // Prefer the server-side refresh path: only the session needs the refresh
  // token, so we ignore any token sent in the body and use the session copy.
  const ok = await refreshSessionToken(req)
  if (!ok) return res.sendStatus(400)
  const [profile] = await Profile.findOrCreate({
    where: { userEmail: req.session.email },
  })
  return res.json(buildUserPayload(req.session, profile))
})

router.post('/login', async (req, res) => {
  const code = req.body.code
  const spotifyApi = new SpotifyWebApi({
    redirectUri: spotifyRedirect,
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  })

  // 1. Exchange authorization code for tokens.
  let tokenBody
  try {
    ;({ body: tokenBody } = await spotifyApi.authorizationCodeGrant(code))
  } catch (err) {
    logger.error({ err: err?.message, statusCode: err?.statusCode }, 'spotify.authCodeGrant_failed')
    trackException(err, { route: 'spotify.login.authCodeGrant' })
    return res
      .status(400)
      .json({ error: 'spotify_auth_failed', message: 'Authorization code exchange failed.' })
  }

  spotifyApi.setAccessToken(tokenBody.access_token)

  // 2. Look up the Spotify user. A 403 here almost always means the Spotify
  //    account is not on the app's Users list (Spotify Developer Dashboard >
  //    your app > User Management) while the app is in Development Mode.
  let me
  try {
    ;({ body: me } = await spotifyApi.getMe())
  } catch (err) {
    logger.error({ err: err?.message, statusCode: err?.statusCode }, 'spotify.getMe_failed')
    trackException(err, { route: 'spotify.login.getMe' })
    const status = err && err.statusCode === 403 ? 403 : 502
    const message =
      status === 403
        ? 'Spotify rejected this account (403). If the app is in Development Mode, add this Spotify account under Dashboard > your app > User Management.'
        : 'Could not fetch Spotify profile.'
    return res.status(status).json({ error: 'spotify_get_me_failed', message })
  }

  if (!me || !me.email) {
    return res.status(502).json({
      error: 'spotify_no_email',
      message: 'Spotify did not return an email for this account.',
    })
  }

  // 3. Upsert local user + profile, store session, respond.
  try {
    const [user] = await User.upsert({
      email: me.email,
      product: me.product,
      display_name: me.display_name,
    })

    req.session.isAdmin = user.isAdmin
    req.session.email = me.email
    req.session.displayName = me.display_name
    req.session.accessToken = tokenBody.access_token
    req.session.refreshToken = tokenBody.refresh_token
    req.session.expiresIn = tokenBody.expires_in
    req.session.expiresAt = Date.now() + tokenBody.expires_in * 1000

    logger.info({ userIdHash: hashUserId(req.session.email) }, 'spotify.login.success')
    trackEvent('spotify.login.success', { product: me.product, userIdHash: hashUserId(req.session.email) })

    const [profile] = await Profile.findOrCreate({
      where: { userEmail: req.session.email },
    })

    return res.json(buildUserPayload(req.session, profile))
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'spotify.login.persistence_failed')
    trackException(err, { route: 'spotify.login.persistence' })
    return res
      .status(500)
      .json({ error: 'login_persist_failed', message: 'Failed to persist user session.' })
  }
})

// Resume an existing Spotify session from the signed cookie. The client calls
// this on page-load before showing the login screen. Returns 401 when there is
// no usable session so the client knows to render the login flow.
router.get('/session', async (req, res) => {
  if (!req.session?.refreshToken || !req.session?.email) {
    return res.sendStatus(401)
  }
  // Refresh proactively if the token is expired or close to it.
  if (
    !req.session.expiresAt ||
    req.session.expiresAt - REFRESH_BUFFER_MS <= Date.now()
  ) {
    const ok = await refreshSessionToken(req)
    if (!ok) {
      // Refresh token no longer valid — kill the session and force re-auth.
      req.session.destroy(() => {})
      return res.sendStatus(401)
    }
  }
  try {
    const [profile] = await Profile.findOrCreate({
      where: { userEmail: req.session.email },
    })
    return res.json(buildUserPayload(req.session, profile))
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'spotify.session_restore_failed')
    return res.status(500).json({
      error: 'session_restore_failed',
      message: 'Failed to load profile for session.',
    })
  }
})

// Destroy the server-side session and clear the cookie. The client should
// dispatch its local clearUser() after this resolves.
router.post('/logout', (req, res) => {
  if (!req.session) return res.sendStatus(204)
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err: err?.message, stack: err?.stack }, 'spotify.session_destroy_failed')
      return res.status(500).json({
        error: 'logout_failed',
        message: 'Failed to destroy session.',
      })
    }
    res.clearCookie('connect.sid')
    return res.sendStatus(204)
  })
})

module.exports = router
