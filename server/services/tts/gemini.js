/**
 * Gemini implementation of the TTS provider interface.
 *
 * Calls Gemini's preview TTS model, which returns 24 kHz, 16-bit, mono
 * little-endian PCM as base64. We wrap it in a 44-byte WAV header and
 * write to disk.
 *
 * Voice IDs are Gemini preset voice names (Fenrir, Aoede, Charon, Kore,
 * Puck, Zephyr, etc.) — NOT ElevenLabs voice hashes.
 */
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { buildWavHeader } = require('./wavHeader');

let aiClient;

function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY env var is required for the Gemini TTS provider'
      );
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

function sanitizeBaseName(name) {
  return String(name).replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'segment';
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AUDIO_DIR = path.join(PROJECT_ROOT, 'public', 'audio');

async function synthesize({ text, voiceId, fileBaseName }) {
  const requestedFormat = (process.env.TTS_OUTPUT || 'wav').toLowerCase();
  if (requestedFormat !== 'wav') {
    throw new Error(
      `TTS_OUTPUT="${requestedFormat}" is not supported by the gemini provider in this build. ` +
        `Only "wav" is implemented. Add an ffmpeg-based transcode step to enable mp3.`
    );
  }

  const ai = getClient();
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceId },
        },
      },
    },
  });

  const inlineData =
    response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData || !inlineData.data) {
    throw new Error('Gemini TTS returned no audio data');
  }

  const pcmBytes = Buffer.from(inlineData.data, 'base64');
  const wavHeader = buildWavHeader({ dataLength: pcmBytes.length });
  const wavBuffer = Buffer.concat([wavHeader, pcmBytes]);

  await fs.promises.mkdir(AUDIO_DIR, { recursive: true });
  const safeName = sanitizeBaseName(fileBaseName);
  const filePath = path.join(AUDIO_DIR, `${safeName}.wav`);
  await fs.promises.writeFile(filePath, wavBuffer);

  return { filePath, text, format: 'wav' };
}

module.exports = { synthesize };
