/**
 * Builds a single system-instruction string for the LLM from a DJ persona
 * record (as returned by `djCharacters(djId)`).
 *
 * The actual prompt text lives in `prompts/dj-system.md` as a Nunjucks
 * template; this function just gathers the persona fields and renders it.
 * Editing the .md file changes both production and the Promptfoo eval.
 */
const { loadPrompt } = require('../utl/loadPrompt');

function buildDJSystemPrompt(persona) {
  if (!persona || !persona.details) {
    throw new Error('buildDJSystemPrompt: persona record is missing details');
  }
  const { djName } = persona;
  const { djStyle, signaturePhrases = [], context = '' } = persona.details;

  return loadPrompt('dj-system', {
    djName,
    djStyle,
    context,
    // Pre-slice in JS so the template stays declarative (no math/slicing).
    signaturePhrases: signaturePhrases.slice(0, 8),
  });
}

module.exports = { buildDJSystemPrompt };
