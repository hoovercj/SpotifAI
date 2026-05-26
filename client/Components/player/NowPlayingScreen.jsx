import React, { useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import {
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Mic2,
} from "lucide-react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/Components/ui/drawer"
import { Slider } from "@/Components/ui/slider"
import { Button } from "@/Components/ui/button"
import {
  closeNowPlaying,
  setNowPlayingOpen,
  setVolume,
  toggleMuted,
} from "../../store/playerSlice"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import DjOnAirIndicator from "./DjOnAirIndicator"

function formatTime(ms) {
  if (!ms || ms < 0) return "0:00"
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Full-screen Now Playing drawer (bottom sheet, snaps to top of viewport).
 * Opened by tapping NowPlayingBar; closed by chevron-down or drag-down.
 */
export default function NowPlayingScreen() {
  const dispatch = useDispatch()
  const open = useSelector((s) => Boolean(s.player?.nowPlayingOpen))
  const track = useSelector((s) => s.player?.currentTrack)
  const isPlaying = useSelector((s) => s.player?.isPlaying)
  const positionMs = useSelector((s) => s.player?.positionMs ?? 0)
  const durationMs = useSelector(
    (s) => s.player?.durationMs ?? s.player?.currentTrack?.duration_ms ?? 0
  )
  const volume = useSelector((s) => s.player?.volume ?? 0.7)
  const isMuted = useSelector((s) => s.player?.isMuted)
  const context = useSelector((s) => s.player?.currentContext)
  const dj = useSelector((s) => s.djs?.currentDj)
  const allDjs = useSelector((s) => s.djs?.allDjs)

  const { togglePlay, next, previous, seek, selectDj } = useSpotifyPlayer()
  const [showDjPicker, setShowDjPicker] = useState(false)

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => dispatch(setNowPlayingOpen(next))}
    >
      <DrawerContent className="h-[100dvh] max-h-[100dvh] rounded-t-2xl border-border/40 bg-gradient-to-b from-zinc-900 via-background to-background">
        <DrawerHeader className="flex flex-row items-center justify-between px-4 pt-2">
          <button
            type="button"
            aria-label="Close Now Playing"
            onClick={() => dispatch(closeNowPlaying())}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center">
            <DrawerTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Playing from
            </DrawerTitle>
            <DrawerDescription className="text-sm font-medium text-foreground">
              {context?.name || "your library"}
            </DrawerDescription>
          </div>
          <button
            type="button"
            aria-label="DJ"
            onClick={() => setShowDjPicker((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Mic2 className="h-5 w-5" />
          </button>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-10">
          {/* Album art */}
          <div className="mx-auto mt-2 aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-muted shadow-2xl shadow-black/60">
            {track?.image ? (
              <img
                src={track.image}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>

          {/* Track meta */}
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="flex items-center gap-2">
              <h2 className="line-clamp-2 text-2xl font-semibold tracking-tight">
                {track?.name || "Nothing playing"}
              </h2>
            </div>
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {Array.isArray(track?.artists)
                ? track.artists.map((a) => a.name).join(", ")
                : ""}
            </p>
            <DjOnAirIndicator className="mt-2" />
          </div>

          {/* Seek */}
          <div className="flex flex-col gap-1.5">
            <Slider
              min={0}
              max={Math.max(durationMs, 1000)}
              step={1000}
              value={[Math.min(positionMs, durationMs || positionMs)]}
              onValueChange={(v) => seek(v[0])}
              className="cursor-pointer"
            />
            <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTime(positionMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              aria-label="Previous track"
              onClick={() => previous()}
              className="grid h-12 w-12 place-items-center rounded-full text-foreground hover:bg-muted"
            >
              <SkipBack className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={() => togglePlay()}
              className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-900/40 transition-transform active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-8 w-8" />
              ) : (
                <Play className="ml-1 h-8 w-8" />
              )}
            </button>
            <button
              type="button"
              aria-label="Next track"
              onClick={() => next()}
              className="grid h-12 w-12 place-items-center rounded-full text-foreground hover:bg-muted"
            >
              <SkipForward className="h-6 w-6" />
            </button>
          </div>

          {/* Volume + mute */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={isMuted ? "Unmute" : "Mute"}
              onClick={() => dispatch(toggleMuted())}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {isMuted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[isMuted ? 0 : volume]}
              onValueChange={(v) => dispatch(setVolume(v[0]))}
              className="cursor-pointer"
            />
          </div>

          {/* DJ picker (collapsible) */}
          {showDjPicker && (
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Choose your DJ
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(allDjs || []).map((d) => (
                  <Button
                    key={d.id}
                    variant={dj?.id === d.id ? "default" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      selectDj(d)
                      setShowDjPicker(false)
                    }}
                  >
                    {d.djName}
                  </Button>
                ))}
                {(!allDjs || allDjs.length === 0) && (
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Loading DJs…
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
