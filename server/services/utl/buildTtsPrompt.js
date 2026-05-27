/**
 * Wraps an LLM-generated transcript with a Director's-Notes preamble before
 * it is sent to Gemini TTS. Used by every code path that turns DJ scripts
 * into audio (createContent, createStationIntro).
 *
 * Per the Gemini speech-generation prompting guide
 * (https://ai.google.dev/gemini-api/docs/speech-generation#prompting-guide):
 *
 *   - A clear preamble instructing the model to synthesize speech keeps the
 *     prompt classifier from rejecting vague inputs as PROHIBITED_CONTENT
 *     or, worse, reading the style notes aloud.
 *   - An explicit TRANSCRIPT: label tells the model where the spoken text
 *     starts.
 *   - Per-voice Director's Notes (style/pacing/accent) align the prompt's
 *     written tone with the selected voice's profile, mitigating the
 *     "voice inconsistency with prompt instructions" limitation.
 *
 * `ttsDirection` is optional — when absent, the preamble is still emitted
 * (so the TRANSCRIPT: label is always there), just without the per-voice
 * style block.
 */
function buildTtsPrompt({ djName, ttsDirection, transcript }) {
  const directionBlock = ttsDirection ? `${ttsDirection}\n\n` : ''
  return `Read the following on-air radio segment as ${djName}.\n\n${directionBlock}TRANSCRIPT:\n${transcript}`
}

module.exports = { buildTtsPrompt }
