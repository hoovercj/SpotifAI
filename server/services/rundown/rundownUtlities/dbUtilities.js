const UserSessionTracks = require("../../../db/UserSessionTracks");
const logger = require("../../logger");

async function saveToDb(
  userSessionId,
  currentRundownIndex,
  uri,
  name,
  artist,
  audioDataURI,
  transcript
) {
  try {
    await UserSessionTracks.create({
      userSessionId: userSessionId,
      runDownIndex: currentRundownIndex,
      spotifyTrackId: uri,
      spotifyTrackName: name,
      spotifyTrackArtist: artist,
      djAudioDataURI: audioDataURI,
      djAudioTranscript: transcript,
    });
    logger.debug('rundown.saveToDb.ok');
  } catch (error) {
    logger.error({ err: error?.message, stack: error?.stack }, 'rundown.saveToDb.failed');
  }
}

async function reset(userEmail) {
  await updateCurrentRundownIndex(userEmail, 0);
}

module.exports = { saveToDb, reset };
