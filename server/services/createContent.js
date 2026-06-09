const { synthesize } = require('./tts');

const { songPrompts } = require('./utl/promptConstructor');
const { buildTtsPrompt } = require('./utl/buildTtsPrompt');
const { djCharacters } = require('./djCharacters');
const logger = require('./logger');

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
    const persona = await djCharacters(djId);
    const { djName, slug, details } = persona;
    const { voiceID, ttsDirection } = details;

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
    const ttsInput = buildTtsPrompt({
      djName,
      ttsDirection,
      transcript: spokenText,
    });

    const timestamp = Date.now();
    const baseName = `${songName || 'segment'}_${bandName || 'dj'}_${timestamp}`;
    return await synthesize({
      text: ttsInput,
      voiceId: voiceID,
      fileBaseName: baseName,
      personaSlug: slug,
    });
  } catch (error) {
    logger.error({ err: error?.message, stack: error?.stack, djId, songName, bandName }, 'createContent.failed');
  }
}

module.exports = { createContent };
