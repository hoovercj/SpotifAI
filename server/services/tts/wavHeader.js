/**
 * Build a 44-byte RIFF/WAVE PCM header for the given audio parameters,
 * suitable for prepending to raw little-endian PCM sample data.
 *
 * Gemini TTS returns 24 kHz, 16-bit, mono PCM by default. Browsers won't
 * play raw PCM, so we wrap it as a standard WAV file in-memory.
 */
function buildWavHeader({
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16,
  dataLength,
}) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4); // ChunkSize = 36 + Subchunk2Size
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  header.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

module.exports = { buildWavHeader };
