import React from "react"
import { Sparkles } from "lucide-react"
import { useSelector } from "react-redux"
import ScrollableRow from "../shell/ScrollableRow"
import { useStartSession } from "../player/useStartSession"

/**
 * Horizontal row of "AI Station" cards.
 *
 * Each card is just a tap-target that hands a station-shaped seed to
 * the unified `useStartSession` hook. All the orchestration (intro
 * audio, cold-start polling, stale-cache refresh) lives in the hook
 * so the row doesn't have to know any of that.
 *
 * Stations carry a gradient swatch — we pass it through as
 * `tuningOverride.gradient` so NowPlayingBar paints the same colors
 * during the tuning phase that the card itself shows, preserving the
 * visual thread from tap to playback.
 */
export default function AIStationsRow({ genreId, stations }) {
  const { start } = useStartSession()
  const error = useSelector((s) => s.player?.sessionError)

  const handleStart = (station) => {
    start(
      { type: "station", genreId, stationId: station.id },
      {
        tuningOverride: {
          name: station.name,
          gradient: station.gradient,
          // No image — station tiles use gradient swatches.
        },
      }
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <ScrollableRow
        title="AI Stations"
        subtitle="Generated playlists tuned to this genre — refreshed weekly"
      >
        {stations.map((station) => (
          <StationCard
            key={station.id}
            station={station}
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

function StationCard({ station, onClick }) {
  const [from, to] = station.gradient || ["#a855f7", "#ec4899"]
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-32 w-40 overflow-hidden rounded-xl text-left shadow-md shadow-black/40 transition-transform active:scale-95"
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
        <Sparkles className="h-3 w-3" />
        AI
      </span>
      <span className="absolute bottom-3 left-3 right-3 text-base font-semibold leading-tight text-white drop-shadow">
        {station.name}
      </span>
    </button>
  )
}
