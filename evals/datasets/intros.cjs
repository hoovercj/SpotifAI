/**
 * Test corpus generator. Promptfoo loads this and uses the returned
 * array as its `tests:` block. Each case passes `vars` into both the
 * prompt builder AND the llm-rubric template, so adding a station to
 * the catalog automatically extends eval coverage.
 */
'use strict'

const path = require('node:path')

const { CATALOG } = require(
  path.resolve(__dirname, '../../server/services/aiStations/catalog')
)
const { djCharacters } = require(
  path.resolve(__dirname, '../../server/services/djCharacters')
)

module.exports = async function () {
  const cases = []
  for (const [genreId, genreEntry] of Object.entries(CATALOG)) {
    for (const station of genreEntry.stations) {
      const persona = await djCharacters(station.djId)
      const base = {
        genreId,
        stationId: station.id,
        djId: station.djId,
        djName: persona.djName,
        // djStyle goes verbatim into the rubric so the judge knows what
        // "in character" should look like.
        djStyle: persona.details.djStyle,
        stationName: station.name,
        genreName: genreEntry.name,
      }
      cases.push({
        description: `${genreId}/${station.id} cold — ${persona.djName}`,
        vars: { ...base, mode: 'cold' },
      })
      cases.push({
        description: `${genreId}/${station.id} warm — ${persona.djName}`,
        vars: { ...base, mode: 'warm' },
      })
    }
  }
  return cases
}
