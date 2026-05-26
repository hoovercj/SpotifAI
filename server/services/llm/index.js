/**
 * LLM provider entry point. Selects an implementation based on the
 * LLM_PROVIDER env var (default: "gemini") and returns a chat session
 * with a stable `sendMessage(input) -> string` interface.
 *
 * Provider modules must export:
 *   async createChatSession({ systemInstruction, sessionId }) -> {
 *     sessionId,
 *     async sendMessage(input) -> string,
 *   }
 */
const gemini = require('./gemini');

const PROVIDERS = { gemini };

async function createChatSession({ systemInstruction, sessionId }) {
  const providerName = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${providerName}". Available: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return provider.createChatSession({ systemInstruction, sessionId });
}

module.exports = { createChatSession };
