const router = require('express').Router()
const Tracks = require('../db/Tracks')
const JamSession = require('../db/JamSession')
const { User, Profile, Settings, UserDjPreference } = require('../db/index.js')
const { djCharacters } = require('../services/djCharacters')
const { showRunner } = require('../services/rundown/showRunner')
const { reset } = require('../services/rundown/rundownUtlities/dbUtilities')
const { createChatSession } = require('../services/llm')
const { buildDJSystemPrompt } = require('../services/llm/buildDJSystemPrompt')

// Per-(jamSession, dj) chat sessions. Keyed so each DJ keeps an independent
// conversation history within a single listening session, and multiple
// concurrent jam sessions don't collide.
const chatSessions = new Map()
async function getOrCreateChat(jamSessionId, djId) {
  const key = `${jamSessionId}::${djId}`
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

const getLatLonFromZip = require('../services/locationIQ')

router.post('/next-content', async (req, res) => {
  try {
    const { curTrack, nextTrack, jamSessionId, djId, station } = req.body

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
    // JamSession's primary key is non-nullable. The client should always be
    // sending one (jamSessionSlice seeds an id on login + session restore),
    // but defend so a null payload doesn't put the route back into a 500.
    if (!jamSessionId) {
      return res.status(400).json({ error: 'jam_session_id_required' })
    }

    const chat = await getOrCreateChat(jamSessionId, djId)

    const user = await User.findOne({
      where: { email: userEmail },
      include: {
        model: Profile,
        attributes: ['name', 'zip', 'lat', 'long'],
      },
    })
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' })
    }

    // Profile may be missing entirely — station listeners aren't required to
    // have filled out their profile. Optional-chain everywhere so we don't
    // crash on `user.profile.zip`.
    const userZip = user.profile?.zip
    if (userZip && !user.profile?.lat && !user.profile?.long) {
      ;(async function () {
        const coordinates = await getLatLonFromZip(userZip)
        console.log(coordinates)
        const [profile, created] = await Profile.upsert(
          {
            userEmail: userEmail,
            lat: coordinates.latitude,
            long: coordinates.longitude,
          },
          {
            returning: true,
            where: { userEmail: userEmail },
          }
        )
      })()
    }

    let jamSession = await JamSession.findOne({
      where: { jamSessionId, userEmail },
    })
    if (!jamSession) {
      jamSession = await JamSession.create({ userEmail, jamSessionId })
    }

    await Tracks.upsert({ userEmail, curTrack, nextTrack })

    const content = await showRunner(
      userEmail,
      jamSessionId,
      user,
      djId,
      station,
      chat
    )
    res.json(content)
  } catch (err) {
    // Without this catch the route was crashing the request without any
    // surface-level log of what blew up. Print the full stack so future
    // failures are diagnosable from the server terminal.
    console.error('POST /api/content/next-content failed:', err)
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
    console.error('GET /exclusive-dj failed:', err)
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
    console.error('PUT /exclusive-dj failed:', err)
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
    console.error('GET /dj-preference failed:', err)
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
    console.error('PUT /dj-preference failed:', err)
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
    console.error('DELETE /dj-preference failed:', err)
    return res.status(500).json({ error: 'dj_preference_delete_failed' })
  }
})

module.exports = router
