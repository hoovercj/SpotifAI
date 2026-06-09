const router = require('express').Router()
const Tracks = require('../db/Tracks')
const UserSession = require('../db/UserSession')
const { User, Profile, Settings, UserDjPreference } = require('../db/index.js')
const { djCharacters } = require('../services/djCharacters')
const { showRunner } = require('../services/rundown/showRunner')
const { reset } = require('../services/rundown/rundownUtlities/dbUtilities')
const { createChatSession } = require('../services/llm')
const { buildDJSystemPrompt } = require('../services/llm/buildDJSystemPrompt')
const { createContent } = require('../services/createContent')
const { convertFileToDataURI } = require('../services/utl/convertMP3FileToDataURI')
const currentWeather = require('../services/currentWeather')
const { newsSegment } = require('../services/news')
const { musicFactsSegment } = require('../services/musicFacts')
const logger = require('../services/logger')
const { trackEvent, trackException } = require('../services/telemetry')
const { ipGeo } = require('../services/ipGeo')

// Per-(UserSession, dj) chat sessions. Keyed so each DJ keeps an independent
// conversation history within a single listening session, and multiple
// concurrent jam sessions don't collide.
const chatSessions = new Map()
async function getOrCreateChat(UserSessionId, djId) {
  const key = `${UserSessionId}::${djId}`
  if (!chatSessions.has(key)) {
    const persona = await djCharacters(djId)
    const systemInstruction = buildDJSystemPrompt(persona)
    chatSessions.set(
      key,
      await createChatSession({ systemInstruction, sessionId: key })
    )
  }
  return chatSessions.get(key)
}

router.post('/next-content', async (req, res) => {
  const t0 = Date.now()
  try {
    const { curTrack, nextTrack, UserSessionId, djId, station } = req.body

    // Hard requirement — every downstream call depends on knowing who the
    // listener is and which DJ to voice. Bail with a clear 400 instead of
    // crashing deep in showRunner / getOrCreateChat.
    const userEmail = req.session.email
    if (!userEmail) {
      return res.status(401).json({ error: 'session_required' })
    }
    if (!djId) {
      return res.status(400).json({ error: 'dj_id_required' })
    }
    // UserSession's primary key is non-nullable. The client should always be
    // sending one (UserSessionSlice seeds an id on login + session restore),
    // but defend so a null payload doesn't put the route back into a 500.
    if (!UserSessionId) {
      return res.status(400).json({ error: 'user_session_id_required' })
    }

    const chat = await getOrCreateChat(UserSessionId, djId)
    // Resolve the persona once so the chatter event can carry slug +
    // voice. Independent of getOrCreateChat's internal lookup — the
    // overhead is a single cached file read.
    const persona = await djCharacters(djId)

    const user = await User.findOne({
      where: { email: userEmail },
      include: {
        model: Profile,
        attributes: ['name'],
      },
    })
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' })
    }

    // Coarse IP-based location for weather / news / transit segments.
    // Result is per-IP cached for 6h — most listening sessions get one
    // geocoder hit. Null in dev (private IP) and on provider failure;
    // downstream segments fall back to a song intro.
    const geo = await ipGeo(req.ip)
    user.location = geo

    let UserSession = await UserSession.findOne({
      where: { UserSessionId, userEmail },
    })
    if (!UserSession) {
      UserSession = await UserSession.create({ userEmail, UserSessionId })
    }

    await Tracks.upsert({ userEmail, curTrack, nextTrack })

    const content = await showRunner(
      userEmail,
      UserSessionId,
      user,
      djId,
      station,
      chat
    )
    trackEvent('content.next-content', {
      djId,
      personaSlug: persona?.slug || null,
      voiceId: persona?.details?.voiceID || null,
      UserSessionId,
      seedKey: station?.uri || null,
      seedType: station?.description || null,
      curTrackUri: curTrack?.uri || null,
      geoCountry: geo?.country || null,
      hasLocation: Boolean(geo),
    }, { ms: Date.now() - t0 })
    res.json(content)
  } catch (err) {
    // Without this catch the route was crashing the request without any
    // surface-level log of what blew up. Print the full stack so future
    // failures are diagnosable from the server terminal.
    logger.error(
      { err: err?.message, stack: err?.stack, requestId: req.requestId },
      'content.next-content.failed'
    )
    trackException(err, { route: '/api/content/next-content' })
    res.status(500).json({
      error: 'next_content_failed',
      message: err?.message || 'Internal Server Error',
    })
  }
})

router.post('/reset', (req, res) => {
  reset()
  res.send('Rundown index reset!')
})

router.get('/dj-characters/:djId', async (req, res) => {
  const djId = req.params.djId

  const characterDetails = await djCharacters(djId)

  if (characterDetails) {
    res.json(characterDetails)
  } else {
    res.status(404).send('Character not found')
  }
})

router.get('/dj-characters', async (req, res) => {
  const characterDetails = await djCharacters()

  if (characterDetails) {
    res.json(characterDetails)
  } else {
    res.status(404).send('Character not found')
  }
})

// ---------------------------------------------------------------------
// DJ preference endpoints (Phase 6)
//
//   GET    /exclusive-dj                   → { djId | null }
//   PUT    /exclusive-dj          body: { djId | null }
//   GET    /dj-preference/:seedKey         → { djId } | 404
//   PUT    /dj-preference/:seedKey body: { djId }
//   DELETE /dj-preference/:seedKey
//
// All require an authenticated session. seedKey comes from
// server/services/sessions/seedKey.js — the client builds it from the
// same seed it passes to /api/sessions/start, so the two stay aligned.
// ---------------------------------------------------------------------

function requireEmail(req, res) {
  const email = req.session?.email
  if (!email) {
    res.status(401).json({ error: 'session_required' })
    return null
  }
  return email
}

function parseDjId(val, { allowNull = false } = {}) {
  if (val === null && allowNull) return null
  const n = Number(val)
  if (!Number.isInteger(n) || n <= 0) return undefined
  return n
}

router.get('/exclusive-dj', async (req, res) => {
  const email = requireEmail(req, res)
  if (!email) return
  try {
    const settings = await Settings.findOne({ where: { userEmail: email } })
    return res.json({ djId: settings?.exclusiveDjId ?? null })
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'content.exclusive-dj.read_failed')
    return res.status(500).json({ error: 'exclusive_dj_read_failed' })
  }
})

router.put('/exclusive-dj', async (req, res) => {
  const email = requireEmail(req, res)
  if (!email) return
  const djId = parseDjId(req.body?.djId, { allowNull: true })
  if (djId === undefined) {
    return res.status(400).json({ error: 'invalid_dj_id' })
  }
  try {
    // Upsert: create settings row if the user has no existing settings
    // (older accounts pre-Phase-6 may not have one).
    const [settings] = await Settings.upsert(
      { userEmail: email, exclusiveDjId: djId },
      { returning: true }
    )
    return res.json({ djId: settings.exclusiveDjId ?? null })
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'content.exclusive-dj.write_failed')
    return res.status(500).json({ error: 'exclusive_dj_write_failed' })
  }
})

router.get('/dj-preference/:seedKey', async (req, res) => {
  const email = requireEmail(req, res)
  if (!email) return
  const { seedKey } = req.params
  if (!seedKey) return res.status(400).json({ error: 'seed_key_required' })
  try {
    const pref = await UserDjPreference.findOne({
      where: { userEmail: email, seedKey },
    })
    if (!pref) return res.status(404).json({ error: 'not_found' })
    return res.json({ djId: pref.djId })
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack, seedKey }, 'content.dj-preference.read_failed')
    return res.status(500).json({ error: 'dj_preference_read_failed' })
  }
})

router.put('/dj-preference/:seedKey', async (req, res) => {
  const email = requireEmail(req, res)
  if (!email) return
  const { seedKey } = req.params
  if (!seedKey) return res.status(400).json({ error: 'seed_key_required' })
  const djId = parseDjId(req.body?.djId)
  if (djId === undefined) {
    return res.status(400).json({ error: 'invalid_dj_id' })
  }
  try {
    const [pref] = await UserDjPreference.upsert(
      { userEmail: email, seedKey, djId },
      { returning: true }
    )
    return res.json({ djId: pref.djId })
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack, seedKey }, 'content.dj-preference.write_failed')
    return res.status(500).json({ error: 'dj_preference_write_failed' })
  }
})

router.delete('/dj-preference/:seedKey', async (req, res) => {
  const email = requireEmail(req, res)
  if (!email) return
  const { seedKey } = req.params
  if (!seedKey) return res.status(400).json({ error: 'seed_key_required' })
  try {
    const count = await UserDjPreference.destroy({
      where: { userEmail: email, seedKey },
    })
    return res.json({ deleted: count })
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack, seedKey }, 'content.dj-preference.delete_failed')
    return res.status(500).json({ error: 'dj_preference_delete_failed' })
  }
})

// ---------------------------------------------------------------------
// On-demand DJ info segments (DJ Action Bar)
//
//   POST /info-request
//     body: {
//       kind:          'news' | 'weather' | 'music-info',
//       UserSessionId:  string,
//       djId:          number,
//       currentTrack:  { name, artist }    // what's playing right now
//     }
//     -> 200 { audioURI, transcript, kind }
//        204                                  (no body) when kind=news|music-info
//                                            has no fresh material to deliver
//        4xx { error }                        on validation / missing data
//
// This is distinct from the rundown's scheduled DJ chatter — the
// segment is NOT added to UserSessionTracks, so it leaves the show
// running untouched. The DJ talks over the current track via the
// HTMLAudio overlay, ducking Spotify just like a scheduled break.
// ---------------------------------------------------------------------
const VALID_INFO_KINDS = new Set(['news', 'weather', 'music-info'])

router.post('/info-request', async (req, res) => {
  try {
    const email = requireEmail(req, res)
    if (!email) return

    const { kind, UserSessionId, djId: rawDjId, currentTrack } = req.body || {}
    if (!VALID_INFO_KINDS.has(kind)) {
      return res.status(400).json({ error: 'invalid_kind' })
    }
    if (!UserSessionId) {
      return res.status(400).json({ error: 'user_session_id_required' })
    }
    const djId = parseDjId(rawDjId)
    if (djId === undefined) {
      return res.status(400).json({ error: 'invalid_dj_id' })
    }
    if (!currentTrack?.name || !currentTrack?.artist) {
      return res.status(400).json({ error: 'current_track_required' })
    }

    const user = await User.findOne({
      where: { email },
      include: {
        model: Profile,
        attributes: ['name'],
      },
    })
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' })
    }

    const name = user.profile?.name || user.display_name || 'there'
    const chat = await getOrCreateChat(UserSessionId, djId)

    let prompt = null
    if (kind === 'weather') {
      const geo = await ipGeo(req.ip)
      if (!geo) {
        return res
          .status(412)
          .json({ error: 'location_unavailable' })
      }
      const weatherReport = await currentWeather(geo.lat, geo.long)
      prompt = `${name} just asked for a quick weather update. Deliver it in two or three short sentences using the data below. Do NOT introduce, name, or announce any song — the music is already playing underneath you. End with a brief sign-off.\n\nWeather: ${weatherReport}`
    } else if (kind === 'news') {
      prompt = await newsSegment({
        name,
        // The on-demand path passes the CURRENT track only so the
        // music-fact lookup (musicFactsSegment) can find the right
        // recording; newsSegment ignores it once omitSegue is set.
        nextTrackTitle: currentTrack.name,
        nextTrackArtist: currentTrack.artist,
        omitSegue: true,
      })
      if (!prompt) return res.status(204).end()
    } else if (kind === 'music-info') {
      prompt = await musicFactsSegment({
        name,
        nextTrackTitle: currentTrack.name,
        nextTrackArtist: currentTrack.artist,
        omitSegue: true,
      })
      if (!prompt) return res.status(204).end()
    }

    const content = await createContent(
      null,
      null,
      null,
      null,
      null,
      null,
      user,
      djId,
      null,
      chat,
      prompt
    )
    if (!content?.filePath) {
      return res.status(500).json({ error: 'content_generation_failed' })
    }

    const audioURI = await convertFileToDataURI(
      content.filePath,
      content.format
    )
    return res.json({ audioURI, transcript: content.text, kind })
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'content.info-request.failed')
    return res.status(500).json({
      error: 'info_request_failed',
      message: err?.message || 'Internal Server Error',
    })
  }
})

module.exports = router
