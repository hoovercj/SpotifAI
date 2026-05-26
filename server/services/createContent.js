const { synthesize } = require('./tts');

const { saveDebugTrackerToFile } = require('./utl/debugTracker');
const { songPrompts } = require('./utl/promptConstructor');
const { djCharacters } = require('./djCharacters');

/**
 * Generates spoken-word audio for a single rundown slot.
 *
 * If `customPrompt` is provided, it's sent verbatim to the DJ chat (used for
 * weather, history, news, transit, etc.). Otherwise the song-intro template
 * is built from the rundown metadata.
 */
async function createContent(
  radioStation,
  showName,
  songName,
  bandName,
  date,
  timeSlot,
  user,
  djId,
  station,
  chat,
  customPrompt
) {
  try {
    const { details } = await djCharacters(djId);
    const { voiceID } = details;

    const debugTracker = [];

    const input =
      customPrompt ||
      (await songPrompts(
        radioStation,
        showName,
        songName,
        bandName,
        date,
        timeSlot,
        user,
        djId,
        station
      ));

    const spokenText = await chat.sendMessage(input);

    saveDebugTrackerToFile(debugTracker);
    const timestamp = Date.now();
    const baseName = `${songName || 'segment'}_${bandName || 'dj'}_${timestamp}`;
    return await synthesize({
      text: spokenText,
      voiceId: voiceID,
      fileBaseName: baseName,
    });
  } catch (error) {
    console.log(error);
  }
}

module.exports = { createContent };
