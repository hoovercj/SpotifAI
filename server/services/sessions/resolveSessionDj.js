/**
 * Resolve which DJ should host a given session.
 *
 * Decision tree (Aug 2025 expansion):
 *
 *   1. Exclusive override   → if the user has set `Settings.exclusiveDjId`,
 *                             always use it (Phase 6 wires this in via
 *                             the optional `exclusiveDjId` arg).
 *   2. Per-seed preference  → if the user has previously locked a DJ for
 *                             this exact seed, use it (Phase 6 wires this
 *                             in via the optional `preferredDjId` arg).
 *   3. Cached pick          → if the caller has a recent pick for this
 *                             session key, reuse it (Phase 6 wires this
 *                             in via the optional `cachedDjId` arg).
 *   4. Station pin          → catalog's `(genreId, stationId).djId`.
 *   5. Mood pin             → moodCatalog's `mood.djId`.
 *   6. LLM pick             → `pickDjWithLlm` consulting Gemini against
 *                             the full roster + the seed's metadata.
 *   7. Regex fallback       → legacy `classifyGenreString` against any
 *                             Spotify-derived artist genres (preserved so
 *                             behavior degrades gracefully when the LLM
 *                             call fails or is rate-limited).
 *   8. House DJ             → M-Quake (id 2). Last-ditch default.
 *
 * Tracks and artists also enrich the seed with the fetched Spotify
 * artist metadata (genres, name) before invoking the LLM, so the picker
 * sees "artist X, genres [hip hop, trap, latin trap]" instead of just a
 * bare Spotify URI.
 */

const SpotifyWebApi = require("spotify-web-api-node")
const { lookupStation } = require("../aiStations/catalog")
const { lookupMood } = require("./moodCatalog")
const { pickDjWithLlm } = require("./pickDjWithLlm")

// House DJ for anything we can't otherwise classify. M-Quake (id 2) was
// picked because the pop register is the most musically forgiving — a
// rock-leaning playlist still survives a pop DJ better than a pop-leaning
// playlist survives a rock DJ.
const HOUSE_DJ_ID = 2

/**
 * Map a single genre string (from Spotify's artist.genres) onto a DJ id.
 * Order matters: rock-family is checked before pop because Spotify slaps
 * "pop punk" / "pop metal" labels on bands that belong with Rusty.
 *
 * Returns null when no rule matches; the caller falls back to HOUSE_DJ_ID.
 *
 * This is the safety-net used when the LLM picker is unavailable
 * (missing GOOGLE_API_KEY, network failure, JSON parse failure). It
 * intentionally only covers the original 4 DJs — that way a fallback
 * always picks a host with a baked avatar.
 */
function classifyGenreString(genreString) {
  const g = String(genreString || "").toLowerCase()
  if (!g) return null
  // Rusty — rock / metal / punk family
  if (/(rock|metal|punk|grunge|hardcore|emo|shoegaze)/.test(g)) return 1
  // Lady Lyric — hip-hop / R&B / global beats family
  if (/(hip.?hop|rap|r.?n.?b|rnb|soul|funk|afro|reggae|dancehall|trap|drill|grime)/.test(g)) return 4
  // Nigel — heritage / classical / jazz family
  if (/(classical|orchestra|symphony|opera|jazz|blues|broadway|musical|soundtrack|score|baroque|chamber|ragtime)/.test(g)) return 3
  // M-Quake — pop / electronic / country / indie family (catch-all)
  if (/(pop|country|folk|indie|k.?pop|latin|electronic|edm|house|techno|dance|disco|ambient|chill|lounge)/.test(g)) return 2
  return null
}

/** Extract a bare Spotify id ("XYZ") from a "spotify:track:XYZ" URI. */
function extractSpotifyId(uri) {
  if (!uri) return null
  const parts = String(uri).split(":")
  return parts.length === 3 ? parts[2] : null
}

/**
 * Fetch artist genres + display name for a track or artist seed.
 * Returns `{ name, genres }` (genres may be []), or null on failure
 * so the caller falls back cleanly without throwing.
 */
async function fetchArtistMeta({ seed, spotifyAccessToken }) {
  try {
    const api = new SpotifyWebApi()
    api.setAccessToken(spotifyAccessToken)

    if (seed.type === "artist") {
      const id = extractSpotifyId(seed.spotifyUri)
      if (!id) return null
      const res = await api.getArtist(id)
      return { name: res.body?.name || "", genres: res.body?.genres || [] }
    }

    if (seed.type === "track") {
      const trackId = extractSpotifyId(seed.spotifyUri)
      if (!trackId) return null
      const trackRes = await api.getTrack(trackId)
      const artistId = trackRes.body?.artists?.[0]?.id
      const artistName = trackRes.body?.artists?.[0]?.name || ""
      if (!artistId) return { name: artistName, genres: [] }
      const artistRes = await api.getArtist(artistId)
      return {
        name: artistRes.body?.name || artistName,
        genres: artistRes.body?.genres || [],
      }
    }

    return null
  } catch (err) {
    // Don't escalate — the worst case is "we host with M-Quake instead of
    // Rusty", which is a strictly cosmetic miss.
    console.warn(
      `resolveSessionDj: failed to fetch artist meta for ${seed.type} ${seed.spotifyUri || ""}:`,
      err?.message || err
    )
    return null
  }
}

/**
 * Resolve the DJ id for a session.
 *
 * @param {object} args
 * @param {object} args.seed                 - Session seed (type, ids, ...)
 * @param {string} args.spotifyAccessToken   - Required for track/artist seeds
 * @param {number} [args.exclusiveDjId]      - User's global "exclusive DJ"
 *                                             override (Phase 6 hook)
 * @param {number} [args.preferredDjId]      - User's per-seed preference
 *                                             (Phase 6 hook)
 * @param {number} [args.cachedDjId]         - Recent pick to reuse for
 *                                             continuity (Phase 6 hook)
 */
async function resolveSessionDj({
  seed,
  spotifyAccessToken,
  exclusiveDjId,
  preferredDjId,
  cachedDjId,
}) {
  if (!seed?.type) return HOUSE_DJ_ID

  // 1. Exclusive override beats everything.
  if (Number.isInteger(exclusiveDjId) && exclusiveDjId > 0) {
    return exclusiveDjId
  }

  // 2. Per-seed user preference.
  if (Number.isInteger(preferredDjId) && preferredDjId > 0) {
    return preferredDjId
  }

  // 3. Cached pick from a recent identical session.
  if (Number.isInteger(cachedDjId) && cachedDjId > 0) {
    return cachedDjId
  }

  // 4. Station seed → catalog pin (still authoritative; stations carry
  //    hand-picked DJs that beat anything the LLM could guess).
  if (seed.type === "station") {
    const entry = lookupStation(seed.genreId, seed.stationId)
    if (!entry) {
      const err = new Error(`Unknown station: ${seed.genreId}/${seed.stationId}`)
      err.status = 404
      throw err
    }
    return entry.station.djId || HOUSE_DJ_ID
  }

  // 5. Mood seed → moodCatalog pin.
  if (seed.type === "mood") {
    const mood = lookupMood(seed.moodId)
    if (mood?.djId) return mood.djId
    // Unknown mood id falls through to LLM rather than throwing —
    // playback shouldn't die on a typo in the client.
  }

  // 6/7. Track / artist / playlist / unknown — LLM pick with regex
  // fallback. Enrich track/artist seeds with Spotify-derived genres
  // before consulting the picker so it has something concrete to chew on.
  let llmSeed = { type: seed.type, name: seed.name || seed.moodId || null }
  let regexCandidates = []

  if (seed.type === "track" || seed.type === "artist") {
    const meta = await fetchArtistMeta({ seed, spotifyAccessToken })
    if (meta) {
      llmSeed = {
        ...llmSeed,
        artists: meta.name ? [meta.name] : null,
        genres: meta.genres,
      }
      regexCandidates = meta.genres
    }
  } else if (seed.type === "playlist") {
    llmSeed = {
      ...llmSeed,
      name: seed.name || null,
      extra: seed.description || null,
    }
  }

  const llmPick = await pickDjWithLlm({ seed: llmSeed })
  if (llmPick?.djId) return llmPick.djId

  for (const g of regexCandidates) {
    const dj = classifyGenreString(g)
    if (dj) return dj
  }

  return HOUSE_DJ_ID
}

module.exports = {
  resolveSessionDj,
  classifyGenreString, // exported for testing
  HOUSE_DJ_ID,
}
