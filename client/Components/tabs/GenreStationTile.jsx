import React from "react"
import { useNavigate } from "react-router-dom"

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
 */
export default function GenreStationTile({ genre, size = "md", onClick }) {
  const navigate = useNavigate()
  const handleClick = () => {
    if (typeof onClick === "function") {
      onClick(genre)
      return
    }
    const q = genre.name.toLowerCase()
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }
  const dim = size === "lg" ? "h-32 w-40" : "h-28 w-36"
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
    </button>
  )
}
