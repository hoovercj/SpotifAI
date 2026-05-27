/**
 * Seed-type → generator dispatch.
 *
 * Generator contract:
 *   - `station`: SPECIAL. Returns the full `SessionStartResult` shape
 *     because it delegates to the legacy aiStations orchestrator which
 *     owns its own job store + DB cache.
 *   - All other generators: pure track producers. Return
 *     `Promise<{ tracks, meta }>` and let the orchestrator handle DJ
 *     resolution, intros, jobs, and session descriptors.
 *
 * The orchestrator at `services/sessions/index.js` switches on seed.type
 * and runs the station path or the non-station path accordingly.
 */

const { fromStation } = require("./fromStation")
const { fromPlaylist } = require("./fromPlaylist")
const { fromMood } = require("./fromMood")
const { fromTrack } = require("./fromTrack")
const { fromArtist } = require("./fromArtist")

const GENERATORS = {
  station:  fromStation,
  playlist: fromPlaylist,
  mood:     fromMood,
  track:    fromTrack,
  artist:   fromArtist,
}

function pickGenerator(seedType) {
  const gen = GENERATORS[seedType]
  if (!gen) {
    const err = new Error(`Unknown seed type: "${seedType}"`)
    err.status = 400
    throw err
  }
  return gen
}

module.exports = { pickGenerator }
