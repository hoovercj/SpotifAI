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
const path = require("node:path")
const { djCharacters } = require("../djCharacters")
const { createChatSession } = require("../llm")
const { buildDJSystemPrompt } = require("../llm/buildDJSystemPrompt")
const { loadPrompt } = require("../utl/loadPrompt")
const { buildTtsPrompt } = require("../utl/buildTtsPrompt")
const { synthesize } = require("../tts")

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

  // 1. Resolve persona + voice.
  const persona = await djCharacters(djId)
  const voiceId = persona?.details?.voiceID
  if (!voiceId) {
    throw new Error(`createSessionIntro: no voiceID on DJ ${djId}`)
  }
  const ttsDirection = persona?.details?.ttsDirection

  // 2. Ask Gemini for the script. Chat session id includes the session
  // key so multiple in-flight intros don't clobber each other's state.
  const chat = await createChatSession({
    systemInstruction: buildDJSystemPrompt(persona),
    sessionId: `session-intro:${djId}:${sessionKey || seedType}`,
  })
  const userPrompt = buildIntroPrompt({ seedType, mode, context })
  const text = (await chat.sendMessage(userPrompt))?.trim()
  if (!text) throw new Error("createSessionIntro: empty LLM response")

  // 3. Synthesize to WAV.
  const ttsInput = buildTtsPrompt({
    djName: persona.djName,
    ttsDirection,
    transcript: text,
  })
  const slug = (sessionKey || seedType).replace(/[^a-z0-9]+/gi, "_").slice(0, 40)
  const baseName = `session_${djId}_${seedType}_${slug}_${Date.now()}`
  const { filePath } = await synthesize({
    text: ttsInput,
    voiceId,
    fileBaseName: baseName,
  })

  // filePath lives under runtime/audio/ (gitignored). Express + Vite both
  // serve runtime/ and public/ at the URL root, so /audio/<basename>
  // resolves regardless of which dir the file actually sits in.
  const audioUrl = `/audio/${path.basename(filePath)}`

  return {
    audioUrl,
    filePath,
    text,
    djName: persona.djName,
  }
}

module.exports = { createSessionIntro, buildIntroPrompt }
