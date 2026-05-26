import React, { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Pause, Play, SkipForward } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import { openNowPlaying } from "../../store/playerSlice"
import DjOnAirIndicator from "./DjOnAirIndicator"

/**
 * Sticky mini-player rendered above the BottomTabBar inside AppShell.
 * Hidden entirely when there is no current track.
 *
 * Tap anywhere on the bar (other than transport buttons) to open the
 * NowPlayingScreen drawer.
 */
export default function NowPlayingBar() {
  const dispatch = useDispatch()
  const { togglePlay, next } = useSpotifyPlayer()
  const currentTrack = useSelector((s) => s.player?.currentTrack)
  const isPlaying = useSelector((s) => s.player?.isPlaying)

  // Drive the CSS variable that AppShell's <main> uses to add bottom padding
  // so the mini-bar never covers content.
  useEffect(() => {
    const root = document.documentElement
    if (currentTrack) {
      root.style.setProperty("--player-offset", "64px")
    } else {
      root.style.setProperty("--player-offset", "0px")
    }
    return () => {
      // Don't blow away the variable on unmount of the visible bar — the
      // shell will set it back to 0 the next time it renders.
    }
  }, [currentTrack])

  if (!currentTrack) return null

  const artists = Array.isArray(currentTrack.artists)
    ? currentTrack.artists.map((a) => a.name).join(", ")
    : ""

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => dispatch(openNowPlaying())}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          dispatch(openNowPlaying())
        }
      }}
      className={cn(
        "pointer-events-auto mx-2 mb-2 flex h-16 cursor-pointer items-center gap-3",
        "rounded-xl border border-border/60 bg-card/95 px-3 shadow-lg shadow-black/40 backdrop-blur",
        "transition-colors hover:bg-card"
      )}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {currentTrack.image && (
          <img
            src={currentTrack.image}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{currentTrack.name}</p>
          <DjOnAirIndicator />
        </div>
        {artists && (
          <p className="truncate text-xs text-muted-foreground">{artists}</p>
        )}
      </div>

      <button
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={(e) => {
          e.stopPropagation()
          togglePlay()
        }}
        className="grid h-10 w-10 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>

      <button
        type="button"
        aria-label="Next track"
        onClick={(e) => {
          e.stopPropagation()
          next()
        }}
        className="hidden h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:grid"
      >
        <SkipForward className="h-5 w-5" />
      </button>
    </div>
  )
}
