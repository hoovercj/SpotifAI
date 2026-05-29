/**
 * Cache key + blob path helpers for DJ intro audio.
 *
 * Cache key (and blob path) encodes everything that affects the audio:
 *
 *   intros/{personaVersion}_{promptVersion}/{seedKey}/{djId}.wav
 *
 * - personaVersion: short hash of personas/<slug>.md (per-DJ).
 * - promptVersion:  short hash of the prompt templates + system-prompt
 *                   builder (shared across all DJs).
 * - seedKey:        from server/services/sessions/seedKey.js.
 *                   May contain ':' and '/' — flattened to '_' inside
 *                   the path so the blob path is a single segment.
 * - djId:           numeric DJ id.
 *
 * Edits to a persona OR the prompts fork the cache automatically; old
 * blobs are orphaned but harmless (Storage lifecycle rules can sweep
 * them later if desired).
 */

const { personaVersion } = require('../utl/personaVersion')
const { promptVersion } = require('../utl/promptVersion')

function flattenSeedKey(seedKey) {
  return String(seedKey).replace(/[:/]/g, '_')
}

function introBlobPath({ seedKey, djId, personaSlug }) {
  if (!seedKey) throw new Error('introBlobPath: seedKey required')
  if (!djId) throw new Error('introBlobPath: djId required')
  if (!personaSlug) throw new Error('introBlobPath: personaSlug required')
  const pv = personaVersion(personaSlug)
  const tv = promptVersion()
  return `intros/${pv}_${tv}/${flattenSeedKey(seedKey)}/${djId}.wav`
}

module.exports = { introBlobPath, flattenSeedKey }
