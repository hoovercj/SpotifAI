/**
 * TTS provider entry point. Selects an implementation based on the
 * TTS_PROVIDER env var (default: "gemini") and returns stable
 * `synthesize` + `synthesizeBuffer` functions.
 *
 * Provider modules must export:
 *   async synthesize({ text, voiceId, fileBaseName }) -> {
 *     filePath: string,  // absolute path to the generated audio file
 *     text:     string,
 *     format:   "wav" | "mp3",
 *   }
 *   async synthesizeBuffer({ text, voiceId }) -> {
 *     wavBuffer: Buffer, // in-memory WAV (header + PCM)
 *     text:      string,
 *     format:    "wav" | "mp3",
 *   }
 *
 * `synthesizeBuffer` is the preferred entry point for callers that
 * upload the result to blob storage themselves (the intro-audio
 * cache); `synthesize` is kept for callers that still want a local
 * disk file (per-track DJ chatter via createContent).
 */
const gemini = require('./gemini');

const PROVIDERS = { gemini };

function provider() {
  const providerName = (process.env.TTS_PROVIDER || 'gemini').toLowerCase();
  const p = PROVIDERS[providerName];
  if (!p) {
    throw new Error(
      `Unknown TTS_PROVIDER "${providerName}". Available: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return p;
}

async function synthesize({ text, voiceId, fileBaseName }) {
  return provider().synthesize({ text, voiceId, fileBaseName });
}

async function synthesizeBuffer({ text, voiceId }) {
  return provider().synthesizeBuffer({ text, voiceId });
}

module.exports = { synthesize, synthesizeBuffer };
