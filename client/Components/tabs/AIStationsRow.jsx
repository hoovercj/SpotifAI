import React from "react"
import { Sparkles } from "lucide-react"
import { useSelector } from "react-redux"
import ScrollableRow from "../shell/ScrollableRow"
import { useStartSession } from "../player/useStartSession"
import { useStationCovers, getStationCover } from "./useStationCovers"
import { getImageSources } from "@/lib/image"

/**
 * Horizontal row of "AI Station" cards.
 *
 * Each card hands a station-shaped seed to the unified
 * `useStartSession` hook. All orchestration (intro audio, cold-start
 * polling, stale-cache refresh) lives in the hook so the row doesn't
 * have to know any of that.
 *
 * The row is **axis-aware**: stations can live on the genre axis or
 * the mood axis, and the two seed shapes differ slightly:
 *
 *   axis="genre"  →  { type: "station", genreId, stationId }
 *   axis="mood"   →  { type: "mood",    moodId,  stationId }
 *
 * The caller (SearchTab) decides which axis applies based on the
 * search query, and passes `axisId` accordingly. The row itself just
 * builds the matching seed and forwards it.
 *
 * Stations carry a gradient swatch — we pass it through as
 * `tuningOverride.gradient` so NowPlayingBar paints the same colors
 * during the tuning phase that the card itself shows, preserving the
 * visual thread from tap to playback.
 */
export default function AIStationsRow({ axis, axisId, stations }) {
  const { start } = useStartSession()
  const error = useSelector((s) => s.player?.sessionError)
  const { covers } = useStationCovers()

  const handleStart = (station) => {
    const seed =
      axis === "mood"
        ? { type: "mood", moodId: axisId, stationId: station.id }
        : { type: "station", genreId: axisId, stationId: station.id }
    start(seed, {
      tuningOverride: {
        name: station.name,
        gradient: station.gradient,
        // No image — station tiles use gradient swatches.
      },
    })
  }

  const subtitle =
    axis === "mood"
      ? "Generated playlists tuned to this mood — refreshed weekly"
      : "Generated playlists tuned to this genre — refreshed weekly"

  return (
    <div className="flex flex-col gap-1">
      <ScrollableRow title="AI Stations" subtitle={subtitle}>
        {stations.map((station) => (
          <StationCard
            key={station.id}
            station={station}
            coverUrl={getStationCover(covers, {
              genreId: axis === "mood" ? null : axisId,
              stationId: station.id,
            })}
            onClick={() => handleStart(station)}
          />
        ))}
      </ScrollableRow>
      {error && (
        <p className="px-4 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

/**
 * StationCard renders a square-ish AI-station tile. Layered top-down:
 *
 *   1. `<img>` cover (if resolved). Falls back to a gradient swatch
 *      on load error or when no cover URL is known yet — keeps a card
 *      from ever rendering as a blank rectangle.
 *   2. Bottom-up gradient mask so the title stays legible regardless
 *      of how busy the underlying image is.
 *   3. AI badge top-left, station name bottom — same content as the
 *      old gradient-only card, just sitting on top of the new visuals.
 */
function StationCard({ station, coverUrl, onClick }) {
  const [from, to] = station.gradient || ["#a855f7", "#ec4899"]
  const [imageBroken, setImageBroken] = React.useState(false)
  // coverUrl may be a string (legacy) OR an image descriptor object
  // from useStationCovers — getImageSources handles both. Tiles are
  // small (~160px) so thumb is plenty.
  const sources = getImageSources(coverUrl, "thumb")
  const showImage = (sources.jpg || sources.webp) && !imageBroken
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-32 w-40 overflow-hidden rounded-xl text-left shadow-md shadow-black/40 transition-transform active:scale-95"
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {showImage && (
        <picture>
          {sources.webp && <source srcSet={sources.webp} type="image/webp" />}
          <img
            src={sources.jpg || sources.webp}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageBroken(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        </picture>
      )}
      {/* Bottom-up dark mask: keeps the title and badge readable on
          top of arbitrary cover art. Stops well before the top so the
          AI badge still sits on the original image content. */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0) 75%)",
        }}
      />
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
        <Sparkles className="h-3 w-3" />
        AI
      </span>
      <span className="absolute bottom-3 left-3 right-3 text-base font-semibold leading-tight text-white drop-shadow-md">
        {station.name}
      </span>
    </button>
  )
}
