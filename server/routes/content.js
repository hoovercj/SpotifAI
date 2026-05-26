const router = require('express').Router()
const Tracks = require('../db/Tracks')
const JamSession = require('../db/JamSession')
const { User, Profile } = require('../db/index.js')
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
  const { curTrack, nextTrack, jamSessionId, djId, station } = req.body
  const chat = await getOrCreateChat(jamSessionId, djId)

  const userEmail = req.session.email
  //TODO: Update to use djId from req.body

  const user = await User.findOne({
    where: {
      email: userEmail,
    },
    include: {
      model: Profile,
      attributes: ['name', 'zip', 'lat', 'long'],
    },
  })
  const userZip = user.profile.zip
  if (user.profile.zip && !user.profile.lat && !user.profile.long) {
    ;(async function () {
      const coordinates = await getLatLonFromZip(userZip)
      console.log(coordinates)
      const [profile, created] = await Profile.upsert(
        {
          userEmail: userEmail, // ensure this is the correct email
          lat: coordinates.latitude,
          long: coordinates.longitude,
        },
        {
          returning: true,
          where: {
            userEmail: userEmail,
          },
        }
      )
    })()
  }

  let jamSession

  if (jamSessionId) {
    jamSession = await JamSession.findOne({
      where: {
        jamSessionId: jamSessionId,
        userEmail: userEmail,
      },
    })
  }

  if (!jamSession) {
    jamSession = await JamSession.create({
      userEmail: userEmail,
      jamSessionId: jamSessionId,
    })
  }

  await Tracks.upsert({
    userEmail: userEmail,
    curTrack: curTrack,
    nextTrack: nextTrack,
  })

  const content = await showRunner(
    userEmail,
    jamSessionId,
    user,
    djId,
    station,
    chat
  )
  res.json(content)
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

module.exports = router
