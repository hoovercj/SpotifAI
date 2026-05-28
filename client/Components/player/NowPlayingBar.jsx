import React, { useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Loader2, Mic, Pause, Play, Sparkles, SkipForward } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import { openNowPlaying } from "../../store/playerSlice"
import DjAvatarTile from "./DjAvatarTile"
import DjActionBar from "./DjActionBar"

// Tuned to feel like a deliberate mode-shift, not a snappy popup.
// Shared with DjActionBar so the avatar travels at the same rate in
// both directions.
const SHARED_LAYOUT_SPRING = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.7,
}

/**
 * Sticky mini-player rendered above the BottomTabBar inside AppShell.
 * Hidden entirely when there is no current track AND no station tuning
 * in progress.
 *
 * Tap anywhere on the bar (other than transport buttons or the DJ
 * avatar) to open the NowPlayingScreen drawer. Tap the DJ avatar to
 * swap the bar contents into "DJ mode" (DjActionBar), where the avatar
 * animates from the right edge over to the left and three info-action
 * buttons (news / weather / about-this-song) take the center slot.
 */
export default function NowPlayingBar() {
  const dispatch = useDispatch()
  const { togglePlay, next } = useSpotifyPlayer()
  const currentTrack = useSelector((s) => s.player?.currentTrack)
  const isPlaying = useSelector((s) => s.player?.isPlaying)
  const dj = useSelector((s) => s.djs?.currentDj)
  const djSpeaking = useSelector((s) => s.player?.djSpeaking)
  // While a session is spinning up, this slice carries the tile name,
  // image (or gradient for station seeds), and current phase ('intro' |
  // 'loading'). When set, we render the tuning row in place of the
  // regular track row — the user tapped a new tile, so the previous
  // track (if any) is irrelevant.
  const sessionLoading = useSelector((s) => s.player?.sessionLoading)

  // Local "DJ mode" toggle — when true, replaces the artwork/title/
  // transport row with the DjActionBar. Closed automatically after the
  // user fires an info action so they immediately see the song that's
  // now being talked over.
  const [djMode, setDjMode] = useState(false)

  const visible = !!(sessionLoading || currentTrack)

  // Drive the CSS variable that AppShell's <main> uses to add bottom
  // padding so the mini-bar never covers content.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--player-offset", visible ? "64px" : "0px")
  }, [visible])

  // Bail out of DJ mode if the bar itself goes away.
  useEffect(() => {
    if (!visible && djMode) setDjMode(false)
  }, [visible, djMode])

  if (!visible) return null

  // Tuning state takes precedence — from the moment the user taps a
  // tile until the session's tracks land, this is what they should see.
  if (sessionLoading) {
    return <TuningBar tuning={sessionLoading} />
  }

  const artists = Array.isArray(currentTrack.artists)
    ? currentTrack.artists.map((a) => a.name).join(", ")
    : ""

  const showDjSlot = !!dj

  return (
    <div
      className={cn(
        "pointer-events-auto mx-2 mb-2 flex h-16 items-center",
        "rounded-xl border border-border/60 bg-card/95 px-3 shadow-lg shadow-black/40 backdrop-blur",
        "transition-colors"
      )}
    >
      {djMode ? (
        <DjActionBar onClose={() => setDjMode(false)} />
      ) : (
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
          className="flex h-full w-full cursor-pointer items-center gap-3 hover:bg-card/0"
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
            <p className="truncate text-sm font-medium">{currentTrack.name}</p>
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
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SkipForward className="h-5 w-5" />
          </button>

          {showDjSlot && (
            <motion.div
              layoutId="player.dj-avatar"
              className="relative ml-1 shrink-0"
              transition={SHARED_LAYOUT_SPRING}
            >
              <DjAvatarTile
                dj={dj}
                size="sm"
                onClick={(e) => {
                  e?.stopPropagation?.()
                  setDjMode(true)
                }}
                ariaLabel={`Open DJ actions${dj?.djName ? ` for ${dj.djName}` : ""}`}
                className="!rounded-md"
              />
              {djSpeaking && (
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-fuchsia-400 opacity-75" />
                  <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-fuchsia-400 ring-2 ring-card" />
                </span>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Mini-bar variant shown while ANY session is spinning up. Two phases:
 *   - 'intro'   : the DJ is mid-introduction. We show "On air: {djName}"
 *                 below the session name and pulse a mic icon.
 *   - 'loading' : no intro, or intro finished before tracks arrived. We
 *                 show "Tuning…" and a spinner.
 *
 * For station seeds we paint a gradient swatch (carrying the visual
 * thread from the card the user tapped). For other seed types we paint
 * the artwork (album / artist / playlist image) instead. Both fall back
 * to a neutral gradient if nothing's available.
 */
function TuningBar({ tuning }) {
  const { name, image, gradient, phase, djName } = tuning || {}
  const [from, to] = Array.isArray(gradient) && gradient.length >= 2
    ? gradient
    : ["#a855f7", "#ec4899"]

  const isIntro = phase === "intro"
  const subtitle = isIntro
    ? djName
      ? `On air: ${djName}`
      : "On air…"
    : "Tuning…"

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto mx-2 mb-2 flex h-16 items-center gap-3",
        "rounded-xl border border-border/60 bg-card/95 px-3 shadow-lg shadow-black/40 backdrop-blur"
      )}
    >
      <div
        className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md text-white"
        style={
          image
            ? undefined
            : { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }
        }
      >
        {image && (
          <img
            src={image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <Sparkles
          className={cn(
            "relative h-5 w-5 drop-shadow",
            isIntro ? "animate-pulse" : ""
          )}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-medium">
          {name || "Session"}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {isIntro ? (
            <Mic className="h-3 w-3 animate-pulse text-primary" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          <span className="truncate">{subtitle}</span>
        </p>
      </div>
    </div>
  )
}
