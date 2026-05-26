/**
 * TTS provider entry point. Selects an implementation based on the
 * TTS_PROVIDER env var (default: "gemini") and returns a stable
 * `synthesize({ text, voiceId, fileBaseName }) -> { filePath, text, format }`
 * interface.
 *
 * Provider modules must export:
 *   async synthesize({ text, voiceId, fileBaseName }) -> {
 *     filePath: string,  // absolute path to the generated audio file
 *     text:     string,  // the spoken text (passthrough)
 *     format:   "wav" | "mp3",
 *   }
 */
const gemini = require('./gemini');

const PROVIDERS = { gemini };

async function synthesize({ text, voiceId, fileBaseName }) {
  const providerName = (process.env.TTS_PROVIDER || 'gemini').toLowerCase();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(
      `Unknown TTS_PROVIDER "${providerName}". Available: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return provider.synthesize({ text, voiceId, fileBaseName });
}

module.exports = { synthesize };
