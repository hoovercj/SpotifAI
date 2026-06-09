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
const { djCharacters } = require("../djCharacters")
const { createChatSession } = require("../llm")
const { buildDJSystemPrompt } = require("../llm/buildDJSystemPrompt")
const { loadPrompt } = require("../utl/loadPrompt")
const { buildTtsPrompt } = require("../utl/buildTtsPrompt")
const { synthesizeBuffer } = require("../tts")
const { seedKey } = require("../sessions/seedKey")
const { getOrGenerateIntro } = require("../intros/getOrGenerateIntro")
const { loadPersonaMetadata } = require("../utl/loadPersonas")

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

  // 1. Resolve persona + voice + slug.
  const persona = await djCharacters(djId)
  const voiceId = persona?.details?.voiceID
  if (!voiceId) {
    throw new Error(`createStationIntro: no voiceID on DJ ${djId}`)
  }
  const ttsDirection = persona?.details?.ttsDirection
  const personaSlug = persona?.slug
    || loadPersonaMetadata().find((m) => Number(m.id) === Number(djId))?.slug
  if (!personaSlug) {
    throw new Error(`createStationIntro: no slug for DJ ${djId}`)
  }

  // 2. Look up the blob-cached intro for this (station, dj) combo.
  // If present we return immediately; if not, the generate() callback
  // does the LLM + TTS work and the blob is populated for next time.
  // NOTE: `mode` (cold/warm) is intentionally NOT in the cache key —
  // we only ever serve a cached intro to repeat listeners, who by
  // definition already have a warm track cache, so the difference
  // between cold/warm script wording doesn't matter for cache hits.
  const sKey = seedKey({
    type: "station",
    genreId: genre.id,
    stationId: station.id,
  })
  const { audioUrl, text, cached, blobPath } = await getOrGenerateIntro({
    seedKey: sKey,
    djId,
    personaSlug,
    generate: async () => {
      const chat = await createChatSession({
        systemInstruction: buildDJSystemPrompt(persona),
        sessionId: `ai-station-intro:${djId}:${genre.id || genre.name}:${station.id || station.name}`,
      })
      const userPrompt = buildIntroPrompt({
        genreName: genre.name,
        stationName: station.name,
        mode,
      })
      const scriptText = (await chat.sendMessage(userPrompt))?.trim()
      if (!scriptText) throw new Error("createStationIntro: empty LLM response")
      const ttsInput = buildTtsPrompt({
        djName: persona.djName,
        ttsDirection,
        transcript: scriptText,
      })
      const { wavBuffer } = await synthesizeBuffer({
        text: ttsInput,
        voiceId,
        personaSlug,
      })
      return { wavBuffer, text: scriptText }
    },
  })

  return {
    audioUrl,
    filePath: null,
    blobPath,
    cached,
    // `text` is null on cache hits — we don't persist the transcript
    // alongside the WAV. Callers that need the transcript (currently
    // none) should consume it on the generation path.
    text,
    djName: persona.djName,
  }
}

module.exports = { createStationIntro, buildIntroPrompt }
