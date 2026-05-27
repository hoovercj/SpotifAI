/**
 * DJ persona lookup. Personas are defined as markdown files under
 * `<repo>/personas/`; this module just adapts the loader to the legacy
 * `djCharacters(djId)` signature so callers don't have to change.
 *
 *   djCharacters()       → full roster, sorted by id
 *   djCharacters(djId)   → the matching persona, or undefined
 */
const { loadPersonas } = require('./utl/loadPersonas')

async function djCharacters(djId) {
  const roster = await loadPersonas()
  if (djId) {
    return roster.find((dj) => dj.id === parseInt(djId, 10))
  }
  return roster
}

module.exports = { djCharacters }
