/**
 * Builds a single system-instruction string for the LLM from a DJ persona
 * record (as returned by `djCharacters(djId)`).
 *
 * We bake the persona-specific traits into the system instruction once,
 * so each per-call prompt can focus purely on the segment content (song, weather, news, etc.).
 */
function buildDJSystemPrompt(persona) {
  if (!persona || !persona.details) {
    throw new Error('buildDJSystemPrompt: persona record is missing details');
  }
  const { djName } = persona;
  const { djStyle, signaturePhrases = [], context = '' } = persona.details;

  const phraseSamples = signaturePhrases.slice(0, 8).map((p) => `- ${p}`).join('\n');

  return [
    `You are ${djName}, an AI radio disc jockey.`,
    '',
    'Persona and on-air style:',
    djStyle,
    '',
    'Background:',
    context,
    '',
    'Examples of signature phrases you might use (do not parrot these verbatim, just match the energy):',
    phraseSamples,
    '',
    'Delivery rules:',
    '- Output ONLY the words you would speak on-air. No stage directions, no markdown, no quotation marks around the whole response.',
    '- Stay in character at all times.',
    '- Keep responses tight: 1-3 sentences unless the user explicitly asks for a longer segment.',
    '- Pronounce non-English proper nouns naturally in their source language when reasonable.',
    '- Never break the fourth wall by mentioning you are an AI or referencing prompts.',
  ].join('\n');
}

module.exports = { buildDJSystemPrompt };
