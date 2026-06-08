const router = require('express').Router()
const logger = require('../services/logger')
const { trackEvent } = require('../services/telemetry')
const { hashUserId } = require('../services/utl/hashUserId')

const MAX_MESSAGE_LEN = 4000
const MAX_PATH_LEN = 200
const MAX_TRACK_URI_LEN = 80

function clamp(s, max) {
  if (typeof s !== 'string') return null
  const trimmed = s.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

router.post('/', (req, res) => {
  const userEmail = req.session?.email
  if (!userEmail) {
    return res.status(401).json({ error: 'session_required' })
  }

  const message = clamp(req.body?.message, MAX_MESSAGE_LEN)
  if (!message) {
    return res.status(400).json({ error: 'message_required' })
  }

  const props = {
    userIdHash: hashUserId(userEmail),
    requestId: req.requestId,
    listenSessionId: req.listenSessionId || null,
    path: clamp(req.body?.path, MAX_PATH_LEN),
    seedKey: clamp(req.body?.seedKey, 120),
    seedType: clamp(req.body?.seedType, 32),
    djId: Number.isInteger(req.body?.djId) ? req.body.djId : null,
    trackUri: clamp(req.body?.trackUri, MAX_TRACK_URI_LEN),
    userAgent: clamp(req.headers['user-agent'], 240),
    contactOk: req.body?.contactOk === true,
    messageLen: message.length,
  }

  // App Insights customDimensions is limited per property; pipe the
  // free-text message through `message` (under the 8KB limit by virtue
  // of MAX_MESSAGE_LEN) and keep the structured fields separate so the
  // Kusto query can filter on them cheaply.
  trackEvent('feedback.submitted', { ...props, message })

  logger.info(
    { ...props, messagePreview: message.slice(0, 120) },
    'feedback.submitted'
  )

  res.status(201).json({ ok: true, requestId: req.requestId })
})

module.exports = router
