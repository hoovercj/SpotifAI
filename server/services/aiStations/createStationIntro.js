/**
 * Generate a short in-character DJ intro for an AI station, returning a
 * playable audio URL plus the spoken text.
 *
 *   const { audioUrl, filePath, text, djName } = await createStationIntro({
 *     djId, genre, station, mode: "cold" | "warm",
 *   })
 *
 * Two prompt modes:
 *   - "cold": the user just tuned in for the first time and the playlist
 *     is generating in the background. The intro should welcome them to
 *     the station, describe what they're going to hear, and politely buy
 *     us 8-15 seconds while we wait for tracks.
 *   - "warm": there's already a playlist. The intro is a quick "welcome
 *     back" line that flows into the first track. Should be short.
 *
 * The synthesized WAV lands in <repo>/runtime/audio/ (gitignored runtime
 * output) and is served at /audio/<basename> by both Express (prod) and
 * Vite (dev), so we hand the client a relative URL it can drop straight
 * into an <audio> element.
 */
const path = require("node:path")
const { djCharacters } = require("../djCharacters")
const { createChatSession } = require("../llm")
const { buildDJSystemPrompt } = require("../llm/buildDJSystemPrompt")
const { loadPrompt } = require("../utl/loadPrompt")
const { buildTtsPrompt } = require("../utl/buildTtsPrompt")
const { synthesize } = require("../tts")

function buildIntroPrompt({ genreName, stationName, mode }) {
  return loadPrompt("station-intro", {
    stationTag: `Spotif-AI ${stationName}`,
    stationName,
    genreName,
    mode,
  })
}

async function createStationIntro({ djId, genre, station, mode = "warm" }) {
  if (!djId) throw new Error("createStationIntro: djId is required")
  if (!genre?.name) throw new Error("createStationIntro: genre.name is required")
  if (!station?.name) throw new Error("createStationIntro: station.name is required")

  // 1. Resolve persona + voice + per-voice TTS direction.
  const persona = await djCharacters(djId)
  const voiceId = persona?.details?.voiceID
  if (!voiceId) {
    throw new Error(`createStationIntro: no voiceID on DJ ${djId}`)
  }
  const ttsDirection = persona?.details?.ttsDirection

  // 2. Ask Gemini for the script. We use createChatSession even for a
  // one-shot call so the same system-prompt machinery used elsewhere keeps
  // the persona consistent.
  const chat = await createChatSession({
    systemInstruction: buildDJSystemPrompt(persona),
    sessionId: `ai-station-intro:${djId}:${genre.id || genre.name}:${station.id || station.name}`,
  })
  const userPrompt = buildIntroPrompt({
    genreName: genre.name,
    stationName: station.name,
    mode,
  })
  const text = (await chat.sendMessage(userPrompt))?.trim()
  if (!text) throw new Error("createStationIntro: empty LLM response")

  // 3. Synthesize. Wrap the LLM output with a Director's-Notes preamble
  // per the Gemini speech-generation prompting guide; the TTS provider
  // writes a WAV to <repo>/runtime/audio/ and returns the absolute file
  // path. We translate that to the URL the client will fetch. Both
  // public/audio/ (seeded) and runtime/audio/ (generated) are mounted at
  // the URL root, so /audio/<basename> resolves to either transparently.
  const ttsInput = buildTtsPrompt({
    djName: persona.djName,
    ttsDirection,
    transcript: text,
  })
  const baseName = `aistation_${djId}_${(genre.id || "g")}_${(station.id || "s")}_${Date.now()}`
  const { filePath } = await synthesize({
    text: ttsInput,
    voiceId,
    fileBaseName: baseName,
  })

  const audioUrl = `/audio/${path.basename(filePath)}`

  return {
    audioUrl,
    filePath,
    text,
    djName: persona.djName,
  }
}

module.exports = { createStationIntro, buildIntroPrompt }
