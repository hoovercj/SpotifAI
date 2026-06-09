import React, { useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Loader2, Mic, Pause, Play, Sparkles, SkipForward } from "lucide-react"
import { motion, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import { openNowPlaying } from "../../store/playerSlice"
import DjAvatarTile from "./DjAvatarTile"
import DjActionBar from "./DjActionBar"

// Drag thresholds for the swipe gestures on the minimized bar. Tuned
// generously so a casual nudge doesn't fire either action, but a
// deliberate swipe always does.
const SWIPE_LEFT_DISTANCE = 110
const SWIPE_LEFT_VELOCITY = -550
// Small upward distance so the drawer kicks in early in the gesture
// — the user's finger is still moving when the drawer's own slide-up
// animation takes over, which is what sells the "pulled up" feel.
const SWIPE_UP_DISTANCE = 24

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
  const { togglePlay, next, endSession } = useSpotifyPlayer()
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

  // DJ mode swaps the bar contents inline; gestures only apply to the
  // standard track row so a swipe across the action buttons doesn't
  // accidentally end the session.
  if (djMode) {
    return (
      <div
        className={cn(
          "pointer-events-auto mx-2 mb-2 flex h-16 items-center",
          "rounded-xl border border-border/60 bg-card/95 px-3 shadow-lg shadow-black/40 backdrop-blur",
          "transition-colors"
        )}
      >
        <DjActionBar onClose={() => setDjMode(false)} />
      </div>
    )
  }

  return (
    <SwipeableBar onSwipeLeft={() => endSession("swipe")} onSwipeUp={() => dispatch(openNowPlaying())}>
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
    </SwipeableBar>
  )
}

/**
 * Draggable shell around the minimized player. Two gestures:
 *   - Swipe left  → `onSwipeLeft` (kill session). Drag is locked to
 *     the horizontal axis so the bar never floats up while a kill is
 *     in progress.
 *   - Swipe up    → `onSwipeUp` (open full-screen Now Playing).
 *     Fires mid-gesture at a small threshold so the drawer's own
 *     slide-up animation begins while the user's finger is still
 *     moving — the bar appears to be pulled up into the drawer even
 *     though we never animate its Y position. A `triggered` ref
 *     prevents the open action from re-firing on subsequent frames.
 *
 * Kill gesture has two visual states so "release will commit" is
 * unambiguous:
 *   - Disarmed (offset > -threshold): subtle red gradient fades in
 *     from the right, "Stop session" label small/muted.
 *   - Armed   (offset ≤ -threshold): full-bleed red background, label
 *     scales up and gets a leading icon. A release here commits.
 *
 * Once armed the bar itself dims so the user understands the bar is
 * about to be replaced rather than just nudged.
 */
function SwipeableBar({ children, onSwipeLeft, onSwipeUp }) {
  const x = useMotionValue(0)
  const [armed, setArmed] = useState(false)
  // One-shot per gesture — without this guard, every onPan frame past
  // the threshold would re-dispatch the open action and the drawer's
  // controlled-open state would thrash.
  const upTriggeredRef = useRef(false)

  // Latched state flip — fires the moment the kill commit line is
  // crossed in either direction. Drives all the "you're about to
  // commit" affordances below so they swap together (no half-arrived
  // tween that could be misread as cancel-territory).
  useMotionValueEvent(x, "change", (v) => {
    setArmed(v <= -SWIPE_LEFT_DISTANCE)
  })

  // Red gradient fades in proportional to drag distance up to the
  // commit line. After commit the `armed` overlay (below) takes over
  // with full saturation — clamp here keeps this layer from also
  // saturating so the transition is a clear hand-off.
  const killOpacity = useTransform(
    x,
    [-SWIPE_LEFT_DISTANCE, -SWIPE_LEFT_DISTANCE / 2, 0],
    [0.6, 0.3, 0]
  )
  // Dim the bar's own contents past the commit line so users see the
  // bar receding rather than the kill hint piling on top of it.
  const contentOpacity = useTransform(
    x,
    [-SWIPE_LEFT_DISTANCE, -SWIPE_LEFT_DISTANCE * 0.7, 0],
    [0.45, 0.85, 1]
  )

  const handleDragEnd = (_event, info) => {
    const { offset, velocity } = info
    const dx = offset.x
    const vx = velocity.x
    if (dx <= -SWIPE_LEFT_DISTANCE || vx <= SWIPE_LEFT_VELOCITY) {
      onSwipeLeft?.()
    }
  }

  const handlePanStart = () => {
    upTriggeredRef.current = false
  }

  // Fire the drawer-open action mid-gesture (not on release) so the
  // drawer's own slide-up animation visually "catches" the user's
  // finger — they perceive the bar being pulled up into the drawer
  // even though we never animate Y on the bar itself. Ignore frames
  // where the gesture is dominantly horizontal so a kill drag with
  // a slight diagonal doesn't double-fire.
  const handlePan = (_event, info) => {
    if (upTriggeredRef.current) return
    const dy = info.offset.y
    const dx = info.offset.x
    if (Math.abs(dx) > Math.abs(dy)) return
    if (dy <= -SWIPE_UP_DISTANCE) {
      upTriggeredRef.current = true
      onSwipeUp?.()
    }
  }

  return (
    <div className="relative">
      {/* Pre-commit red gradient — fades in with drag distance. */}
      <motion.div
        aria-hidden="true"
        style={{ opacity: killOpacity }}
        className="pointer-events-none absolute inset-0 mx-2 mb-2 flex items-center justify-end rounded-xl bg-gradient-to-l from-rose-600/90 to-rose-600/0 px-4 text-xs font-semibold uppercase tracking-wide text-white"
      >
        Stop session
      </motion.div>

      {/* Post-commit overlay — flips on/off as a unit when the user
          crosses the kill threshold. Solid background, larger label,
          and a leading X mark so the "release will stop" state can't
          be confused with the gradient ramp. */}
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={{ opacity: armed ? 1 : 0, scale: armed ? 1 : 0.98 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0 mx-2 mb-2 flex items-center justify-end gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold uppercase tracking-wide text-white ring-2 ring-rose-300/70 shadow-lg shadow-rose-900/50"
      >
        <span aria-hidden="true" className="text-base leading-none">×</span>
        Release to stop
      </motion.div>

      <motion.div
        drag="x"
        style={{ x, opacity: contentOpacity }}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.6, right: 0 }}
        dragSnapToOrigin
        onDragEnd={handleDragEnd}
        onPanStart={handlePanStart}
        onPan={handlePan}
        className={cn(
          "pointer-events-auto mx-2 mb-2 flex h-16 items-center touch-pan-y",
          "rounded-xl border border-border/60 bg-card/95 px-3 shadow-lg shadow-black/40 backdrop-blur",
          "transition-colors"
        )}
      >
        {children}
      </motion.div>
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
