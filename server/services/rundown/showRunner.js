const {
  addPlaylistToRundown,
} = require('./rundownUtlities/addPlaylistToRundown')
const {
  getCurrentRundownIndex,
  updateCurrentRundownIndex,
} = require('./rundownUtlities/rundownIndex')
const { saveToDb, reset } = require('../rundown/rundownUtlities/dbUtilities')
const currentWeather = require('../currentWeather')
const historySegment = require('../historySegment')
const { newsSegment } = require('../news')
const { transitSegment } = require('../transit/copenhagen')
const { convertFileToDataURI } = require('../utl/convertMP3FileToDataURI')
const { createContent } = require('../createContent')

/**
 * Generate audio for a non-song segment, save it to the rundown, return the
 * playable data URI. Shared by weather / history / news / transit branches.
 */
async function emitTalkSegment({
  jamSessionId,
  rundownIndex,
  nextTrackURI,
  tempSongName,
  tempBandName,
  user,
  djId,
  station,
  chat,
  prompt,
}) {
  const content = await createContent(
    null,
    null,
    null,
    null,
    null,
    null,
    user,
    djId,
    station,
    chat,
    prompt
  )
  const audioURI = await convertFileToDataURI(content.filePath, content.format)
  await saveToDb(
    jamSessionId,
    rundownIndex,
    nextTrackURI,
    tempSongName,
    tempBandName,
    audioURI,
    content.text
  )
  return audioURI
}

async function showRunner(userEmail, jamSessionId, user, djId, station, chat) {
  const { lat, long } = user.profile
  const { display_name } = user
  let { show, nextTrackURI, tempSongName, tempBandName } =
    await addPlaylistToRundown(userEmail, jamSessionId)
  const currentRundownIndex = await getCurrentRundownIndex(userEmail)
  const nextSlot = show.rundown[currentRundownIndex + 1]
  const slotAfterNext = show.rundown[currentRundownIndex + 2]

  if (nextSlot.type === 'song') {
    await updateCurrentRundownIndex(userEmail, currentRundownIndex + 1)
    const content = await createContent(
      show.radioStation,
      show.showName,
      nextSlot.songName,
      nextSlot.bandName,
      show.date,
      show.timeSlot,
      user,
      djId,
      station,
      chat
    )
    const audioURI = await convertFileToDataURI(
      content.filePath,
      content.format
    )
    await saveToDb(
      jamSessionId,
      currentRundownIndex + 1,
      nextTrackURI,
      tempSongName,
      tempBandName,
      audioURI,
      content.text
    )
    return audioURI
  }

  // Talk segments — all advance two slots (over the talk slot AND the next song).
  await updateCurrentRundownIndex(userEmail, currentRundownIndex + 2)

  if (nextSlot.type === 'weather') {
    const weatherReport = await currentWeather(lat, long)
    const prompt = `Summarize this weather, be brief. Weather: ${weatherReport}. End the weather report by announcing this song by ${slotAfterNext.bandName} called ${slotAfterNext.songName}. Be very brief.`
    return emitTalkSegment({
      jamSessionId,
      rundownIndex: currentRundownIndex + 2,
      nextTrackURI,
      tempSongName,
      tempBandName,
      user,
      djId,
      station,
      chat,
      prompt,
    })
  }

  if (nextSlot.type === 'history') {
    const prompt = await historySegment(
      user.profile.name,
      slotAfterNext.songName,
      slotAfterNext.bandName
    )
    return emitTalkSegment({
      jamSessionId,
      rundownIndex: currentRundownIndex + 2,
      nextTrackURI,
      tempSongName,
      tempBandName,
      user: display_name,
      djId,
      station,
      chat,
      prompt,
    })
  }

  if (nextSlot.type === 'news') {
    const prompt = await newsSegment({
      name: user.profile.name || display_name,
      nextTrackTitle: slotAfterNext.songName,
      nextTrackArtist: slotAfterNext.bandName,
    })
    if (!prompt) {
      // No fresh article available — degrade to a plain song intro for the
      // slot we were going to skip into.
      return runSongFallback({
        jamSessionId,
        slot: slotAfterNext,
        rundownIndex: currentRundownIndex + 2,
        nextTrackURI,
        tempSongName,
        tempBandName,
        show,
        user,
        djId,
        station,
        chat,
      })
    }
    return emitTalkSegment({
      jamSessionId,
      rundownIndex: currentRundownIndex + 2,
      nextTrackURI,
      tempSongName,
      tempBandName,
      user,
      djId,
      station,
      chat,
      prompt,
    })
  }

  if (nextSlot.type === 'transit') {
    const prompt = await transitSegment({
      name: user.profile.name || display_name,
      nextTrackTitle: slotAfterNext.songName,
      nextTrackArtist: slotAfterNext.bandName,
    })
    if (!prompt) {
      return runSongFallback({
        jamSessionId,
        slot: slotAfterNext,
        rundownIndex: currentRundownIndex + 2,
        nextTrackURI,
        tempSongName,
        tempBandName,
        show,
        user,
        djId,
        station,
        chat,
      })
    }
    return emitTalkSegment({
      jamSessionId,
      rundownIndex: currentRundownIndex + 2,
      nextTrackURI,
      tempSongName,
      tempBandName,
      user,
      djId,
      station,
      chat,
      prompt,
    })
  }
}

async function runSongFallback({
  jamSessionId,
  slot,
  rundownIndex,
  nextTrackURI,
  tempSongName,
  tempBandName,
  show,
  user,
  djId,
  station,
  chat,
}) {
  const content = await createContent(
    show.radioStation,
    show.showName,
    slot.songName,
    slot.bandName,
    show.date,
    show.timeSlot,
    user,
    djId,
    station,
    chat
  )
  const audioURI = await convertFileToDataURI(content.filePath, content.format)
  await saveToDb(
    jamSessionId,
    rundownIndex,
    nextTrackURI,
    tempSongName,
    tempBandName,
    audioURI,
    content.text
  )
  return audioURI
}

module.exports = { showRunner }

