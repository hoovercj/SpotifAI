import React from "react"
import { useNavigate } from "react-router-dom"

/**
 * Gradient genre card used in Home's "Stations" row and Search's "Browse all".
 * Tapping it routes to /search?q=genre:"<name>" which Phase 5's SearchTab
 * picks up via URL search params.
 */
export default function GenreStationTile({ genre, size = "md" }) {
  const navigate = useNavigate()
  const handleClick = () => {
    const q = `genre:"${genre.name.toLowerCase()}"`
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
