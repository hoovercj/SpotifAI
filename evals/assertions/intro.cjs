/**
 * Custom JS assertions for AI station intros. Each function receives
 * `{ output, vars, ...promptfoo-context }` and returns `{ pass, reason }`.
 * Cheap structural checks live here so the eval fails fast before paying
 * for the LLM-as-judge run.
 */
'use strict'

function hasReasonableLength({ output }) {
  const len = (output || '').trim().length
  const pass = len >= 40 && len <= 600
  return {
    pass,
    reason: pass
      ? `length ${len} ok`
      : `length ${len} out of [40,600] — intros should be 1-4 sentences`,
  }
}

function hasFewSentences({ output, vars }) {
  const sentences = (output || '')
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const max = vars?.mode === 'warm' ? 3 : 5
  const pass = sentences.length >= 1 && sentences.length <= max
  return {
    pass,
    reason: pass
      ? `${sentences.length} sentence(s)`
      : `${sentences.length} sentences exceeds ${max} for mode=${vars?.mode}`,
  }
}

// Catches meta-references and breaking character entirely.
const FOURTH_WALL_RE =
  /\b(as an? (AI|assistant|model|language model)|I (am|'m) (an? )?(AI|assistant|language model|chatbot)|my (instructions|prompt|system prompt))\b/i

function noBrokenFourthWall({ output }) {
  const m = (output || '').match(FOURTH_WALL_RE)
  return {
    pass: !m,
    reason: m ? `broke character: matched "${m[0]}"` : 'stayed in character',
  }
}

// Want plain spoken text — no markdown / list dashes / code fences.
const MARKDOWN_RE = /(^|\n)\s*(?:[-*•+]\s|#{1,6}\s|>\s|\d+\.\s)|```|`[^`]+`/

function noMarkdownNoise({ output }) {
  const m = (output || '').match(MARKDOWN_RE)
  return {
    pass: !m,
    reason: m ? `markdown noise: "${m[0].slice(0, 40)}"` : 'clean prose',
  }
}

function mentionsStation({ output, vars }) {
  const name = vars?.stationName || ''
  if (!name) return { pass: true, reason: 'no stationName var — skipped' }
  // Loose match: stems of the station name, case-insensitive. Some intros
  // rephrase ("the 90s pop classics station") instead of quoting verbatim.
  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w.toLowerCase())
  const hay = (output || '').toLowerCase()
  const hits = words.filter((w) => hay.includes(w)).length
  const pass = hits >= Math.min(2, words.length)
  return {
    pass,
    reason: pass
      ? `mentioned ${hits}/${words.length} station-name words`
      : `mentioned only ${hits}/${words.length} of "${name}"`,
  }
}

module.exports = {
  hasReasonableLength,
  hasFewSentences,
  noBrokenFourthWall,
  noMarkdownNoise,
  mentionsStation,
}
