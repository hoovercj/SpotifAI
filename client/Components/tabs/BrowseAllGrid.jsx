import React from "react"
import GenreStationTile from "./GenreStationTile"
import GENRES from "./genres"
import MOODS from "./moods"

/**
 * "Browse all" full-grid view shown in the SearchTab empty state.
 * Split into two parallel axes — musical-style genres and
 * mood/activity tiles — each rendered as its own labeled 2-column grid
 * of large GenreStationTiles. Both sections share the same tile
 * component because MOODS uses the same `{ id, name, from, to }` shape
 * as GENRES.
 */
export default function BrowseAllGrid() {
  return (
    <section className="flex flex-col gap-6 px-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
          Genres
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {GENRES.map((g) => (
            <div key={g.id} className="w-full">
              <GenreStationTile genre={g} size="lg" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
          Moods &amp; activities
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {MOODS.map((m) => (
            <div key={m.id} className="w-full">
              <GenreStationTile genre={m} size="lg" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
