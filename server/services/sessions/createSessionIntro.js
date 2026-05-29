/**
 * Generic DJ intro for non-station sessions (mood / track / artist /
 * playlist seeds). Station seeds still use `createStationIntro` from the
 * legacy aiStations service.
 *
 *   const { audioUrl, filePath, text, djName } = await createSessionIntro({
 *     djId,
 *     seedType,           // "mood" | "track" | "artist" | "playlist"
 *     mode,               // "cold" | "warm"
 *     context: {          // type-specific labels rendered into the prompt
 *       name,             // mood / track / artist / playlist name
 *       artistName?,      // only for track seeds
 *     },
 *     sessionKey,         // used to scope the chat session id (so concurrent
 *                         // intros for different sessions don't share state)
 *   })
 *
 * Mirrors `createStationIntro` in shape — emits a WAV in
 * <repo>/runtime/audio/ (gitignored runtime output), returns the
 * /audio/<basename> URL the client can drop into <audio>.
 */
const { djCharacters } = require("../djCharacters")
const { createChatSession } = require("../llm")
const { buildDJSystemPrompt } = require("../llm/buildDJSystemPrompt")
const { loadPrompt } = require("../utl/loadPrompt")
const { buildTtsPrompt } = require("../utl/buildTtsPrompt")
const { synthesizeBuffer } = require("../tts")
const { getOrGenerateIntro } = require("../intros/getOrGenerateIntro")
const { loadPersonaMetadata } = require("../utl/loadPersonas")

const VALID_SEED_TYPES = new Set(["mood", "track", "artist", "playlist"])
const VALID_MODES = new Set(["cold", "warm"])

function buildIntroPrompt({ seedType, mode, context }) {
  return loadPrompt("session-intro", {
    seedType,
    mode,
    name: context.name,
    artistName: context.artistName || null,
  })
}

async function createSessionIntro({
  djId,
  seedType,
  mode = "warm",
  context = {},
  sessionKey,
}) {
  if (!djId) throw new Error("createSessionIntro: djId is required")
  if (!VALID_SEED_TYPES.has(seedType)) {
    throw new Error(`createSessionIntro: seedType must be one of ${[...VALID_SEED_TYPES].join("/")}`)
  }
  if (!VALID_MODES.has(mode)) {
    throw new Error(`createSessionIntro: mode must be "cold" or "warm"`)
  }
  if (!context?.name) {
    throw new Error("createSessionIntro: context.name is required")
  }
  if (seedType === "track" && !context.artistName) {
    throw new Error("createSessionIntro: track seed requires context.artistName")
  }
  if (!sessionKey) {
    throw new Error("createSessionIntro: sessionKey is required (seedKey from caller)")
  }

  // 1. Resolve persona + voice + slug.
  const persona = await djCharacters(djId)
  const voiceId = persona?.details?.voiceID
  if (!voiceId) {
    throw new Error(`createSessionIntro: no voiceID on DJ ${djId}`)
  }
  const ttsDirection = persona?.details?.ttsDirection
  const personaSlug = persona?.slug
    || loadPersonaMetadata().find((m) => Number(m.id) === Number(djId))?.slug
  if (!personaSlug) {
    throw new Error(`createSessionIntro: no slug for DJ ${djId}`)
  }

  // 2. Blob-cache lookup keyed on (seedKey, djId). Generate on miss.
  const { audioUrl, text, cached, blobPath } = await getOrGenerateIntro({
    seedKey: sessionKey,
    djId,
    personaSlug,
    generate: async () => {
      const chat = await createChatSession({
        systemInstruction: buildDJSystemPrompt(persona),
        sessionId: `session-intro:${djId}:${sessionKey || seedType}`,
      })
      const userPrompt = buildIntroPrompt({ seedType, mode, context })
      const scriptText = (await chat.sendMessage(userPrompt))?.trim()
      if (!scriptText) throw new Error("createSessionIntro: empty LLM response")
      const ttsInput = buildTtsPrompt({
        djName: persona.djName,
        ttsDirection,
        transcript: scriptText,
      })
      const { wavBuffer } = await synthesizeBuffer({
        text: ttsInput,
        voiceId,
      })
      return { wavBuffer, text: scriptText }
    },
  })

  return {
    audioUrl,
    filePath: null,
    blobPath,
    cached,
    text,
    djName: persona.djName,
  }
}

module.exports = { createSessionIntro, buildIntroPrompt }
