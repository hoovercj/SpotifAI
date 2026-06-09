import React from "react"
import { useNavigate } from "react-router-dom"
import STATIONS_BY_GENRE_ID from "./aiStations"
import { useStationCovers, getStationCover } from "./useStationCovers"
import { getImageSources } from "@/lib/image"

/**
 * Gradient tile used in Home's browse rows and Search's "Browse all".
 *
 * Default behavior (no `onClick` prop): tap routes to /search?q=<name>
 * which Phase 5's SearchTab picks up via URL search params. Used for
 * genre tiles where we want to drop the user into a genre detail screen
 * with curated AI stations + Spotify search results.
 *
 * Override behavior: pass `onClick` to take over the tap, e.g. for mood
 * tiles which directly start a session via `useStartSession` instead
 * of routing through search.
 *
 * NOTE on the default search query: we deliberately send plain text
 * (e.g. "country") rather than the `genre:"country"` field-filter.
 * Spotify only supports `genre:` for track/album/artist searches —
 * using it would silently strip out playlists, shows, and audiobooks.
 *
 * Cover preview: for genres that have AI stations defined, we pull
 * the resolved cover of the first station and render it as a tilted
 * thumbnail in the bottom-right corner — a visual nod to "tap here
 * for AI hosts". For mood/genre tiles without AI stations the
 * thumbnail is simply omitted, falling back to the bare gradient.
 */
export default function GenreStationTile({ genre, size = "md", onClick, priority }) {
  const navigate = useNavigate()
  const { covers } = useStationCovers()

  const handleClick = () => {
    if (typeof onClick === "function") {
      onClick(genre)
      return
    }
    const q = genre.name.toLowerCase()
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }
  const dim = size === "lg" ? "h-32 w-40" : "h-28 w-36"

  // First AI station in the genre (if any) — its resolved cover is
  // the genre's "preview thumbnail". Not all genres have AI stations
  // (and mood tiles never do), so this can legitimately be undefined.
  const firstStation = genre?.id && STATIONS_BY_GENRE_ID[genre.id]?.[0]
  const previewCover = firstStation
    ? getStationCover(covers, { genreId: genre.id, stationId: firstStation.id })
    : null
  const previewSources = getImageSources(previewCover, "thumb")
  const hasPreview = previewSources.jpg || previewSources.webp

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative ${dim} overflow-hidden rounded-xl text-left shadow-md shadow-black/40 transition-transform active:scale-95`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${genre.from}, ${genre.to})`,
      }}
    >
      <span className="absolute left-3 top-3 max-w-[80%] text-base font-semibold leading-tight text-white drop-shadow">
        {genre.name}
      </span>
      {hasPreview && (
        // Tilted DJ/station-cover thumbnail tucked into the bottom-right.
        // Partial overflow comes from the parent `overflow-hidden`, so the
        // thumbnail "peeks" beyond the tile edge — adds depth without
        // crowding the title.
        <picture>
          {previewSources.webp && (
            <source srcSet={previewSources.webp} type="image/webp" />
          )}
          <img
            src={previewSources.jpg || previewSources.webp}
            alt=""
            // Marked `priority` when this tile sits above the fold
            // and there's nothing else above it that already claimed
            // the LCP slot. Drops lazy + asks the browser to fetch
            // this image at high priority.
            loading={priority ? undefined : "lazy"}
            fetchpriority={priority ? "high" : undefined}
            decoding="async"
            onError={(e) => {
              // Hide silently on 404 — falling back to the bare gradient
              // is preferable to a broken-image icon.
              e.currentTarget.style.display = "none"
            }}
            className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rotate-[-12deg] rounded-lg object-cover shadow-lg shadow-black/50 ring-1 ring-white/20"
          />
        </picture>
      )}
    </button>
  )
}
