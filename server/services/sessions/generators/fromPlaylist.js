/**
 * Playlist seed generator.
 *
 * Pure track producer — no Gemini, no DJ resolution, no intro work.
 * Fetches the playlist's tracks from Spotify in authored order and
 * returns them along with the metadata the orchestrator needs to build
 * the session descriptor.
 *
 * Returns:
 *   {
 *     tracks: Array<{ uri, name, artists[], image, durationMs }>,
 *     meta:   { name, imageUrl, ownerName },
 *   }
 *
 * Caps at MAX_TRACKS so a 5000-track megaplaylist doesn't choke the SDK
 * queue / DJ refill loop. The cap is generous enough that 99% of
 * personal playlists fit comfortably under it.
 */
const SpotifyWebApi = require("spotify-web-api-node")

const MAX_TRACKS = 200
const PAGE_SIZE = 100 // Spotify's per-page max for /v1/playlists/{id}/tracks

function extractPlaylistId(uri) {
  if (!uri) return null
  const parts = String(uri).split(":")
  return parts.length === 3 && parts[1] === "playlist" ? parts[2] : null
}

async function fetchPlaylistTracks(api, playlistId) {
  const out = []
  let offset = 0
  while (out.length < MAX_TRACKS) {
    const res = await api.getPlaylistTracks(playlistId, {
      limit: PAGE_SIZE,
      offset,
    })
    const items = res?.body?.items || []
    if (items.length === 0) break
    for (const item of items) {
      const track = item?.track
      if (!track || track.is_local || !track.uri) continue
      // Spotify returns stubs for unavailable tracks (region-locked,
      // taken down, etc.) — they have a uri but no duration. Drop them
      // so the queue refill doesn't choke later.
      if (!track.duration_ms) continue
      out.push({
        uri: track.uri,
        name: track.name,
        artists: (track.artists || []).map((a) => a.name),
        image: track.album?.images?.[0]?.url || null,
        durationMs: track.duration_ms ?? null,
      })
      if (out.length >= MAX_TRACKS) break
    }
    if (items.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return out
}

async function fromPlaylist({ seed, spotifyAccessToken }) {
  const playlistId = extractPlaylistId(seed.spotifyUri)
  if (!playlistId) {
    const err = new Error(`fromPlaylist: invalid Spotify URI "${seed.spotifyUri}"`)
    err.status = 400
    throw err
  }

  const api = new SpotifyWebApi()
  api.setAccessToken(spotifyAccessToken)

  // Meta + tracks in parallel for snappy response.
  const [metaRes, tracks] = await Promise.all([
    api.getPlaylist(playlistId, { fields: "name,owner.display_name,images" }).catch((err) => {
      console.warn("fromPlaylist: getPlaylist meta failed:", err?.message || err)
      return null
    }),
    fetchPlaylistTracks(api, playlistId),
  ])

  const meta = metaRes?.body || {}
  return {
    tracks,
    meta: {
      name: meta.name || "Your playlist",
      imageUrl: meta.images?.[0]?.url || null,
      ownerName: meta.owner?.display_name || null,
    },
  }
}

module.exports = { fromPlaylist }
