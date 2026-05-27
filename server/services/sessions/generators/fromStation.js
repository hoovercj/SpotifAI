/**
 * Station seed generator.
 *
 * For now this is a thin shim around the existing AI Stations orchestrator —
 * the warm-cache + weekly-stale-refresh + intro-on-cold-start behavior is
 * already battle-tested there, and we want station UX to remain
 * bit-for-bit identical when the client flips to `/api/sessions`.
 *
 * The shim's only job is shape translation: the legacy result uses
 * `{ station, genre }` descriptors while sessions return a uniform
 * `{ session: { id, seed, name, djId, djName } }`.
 *
 * Future: when we add an `excludeUris` parameter for refill, this is the
 * file that grows. The legacy aiStations orchestrator stays unchanged.
 */

const { startStation } = require("../../aiStations")
const { lookupStation } = require("../../aiStations/catalog")
const { djCharacters } = require("../../djCharacters")
const { seedKey } = require("../seedKey")

async function fromStation({ seed, spotifyAccessToken }) {
  const result = await startStation({
    genreId: seed.genreId,
    stationId: seed.stationId,
    spotifyAccessToken,
  })

  // Re-derive the descriptor from the catalog so we don't have to thread
  // a separate "session metadata" return out of the legacy orchestrator.
  const entry = lookupStation(seed.genreId, seed.stationId)
  const djId = entry.station.djId
  const persona = await djCharacters(djId)

  return {
    ready: result.ready,
    jobId: result.jobId || null,
    tracks: result.tracks || null,
    intro: result.intro || null,
    stale: result.stale || false,
    refreshJobId: result.refreshJobId || null,
    session: {
      id: seedKey(seed),
      seed,
      name: entry.station.name,
      djId,
      djName: persona?.djName || null,
    },
  }
}

module.exports = { fromStation }
