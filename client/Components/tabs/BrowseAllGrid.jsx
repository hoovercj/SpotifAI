import React from "react"
import GenreStationTile from "./GenreStationTile"
import GENRES from "./genres"

/**
 * "Browse all" full-grid view shown in the SearchTab empty state.
 * Uses the same GenreStationTile rendered larger and in a 2-column grid.
 */
export default function BrowseAllGrid() {
  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
        Browse all
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {GENRES.map((g) => (
          <div key={g.id} className="w-full">
            <GenreStationTile genre={g} size="lg" />
          </div>
        ))}
      </div>
    </section>
  )
}
