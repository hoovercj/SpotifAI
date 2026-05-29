/**
 * Gemini implementation of the LLM provider interface.
 *
 * Uses @google/genai's built-in multi-turn chat,
 * which manages history internally per chat instance.
 */
const { GoogleGenAI } = require('@google/genai');
const { withDependency, trackEvent } = require('../telemetry');

let aiClient;

function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY env var is required for the Gemini LLM provider'
      );
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

async function createChatSession({ systemInstruction, sessionId }) {
  const ai = getClient();
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite';
  const temperature = Number(process.env.GEMINI_TEXT_TEMPERATURE ?? 1.0);

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction,
      temperature,
    },
    history: [],
  });

  return {
    sessionId,
    async sendMessage(input) {
      const inputChars = typeof input === 'string' ? input.length : 0;
      const result = await withDependency(
        'gemini',
        'llm.invoke',
        { model, sessionId, inputChars },
        () => chat.sendMessage({ message: input })
      );
      const text = result?.text || '';
      trackEvent(
        'llm.invoke',
        { model, sessionId },
        { inputChars, outputChars: text.length }
      );
      return text;
    },
  };
}

module.exports = { createChatSession };
