import React from "react"
import { useSelector } from "react-redux"
import { cn } from "@/lib/utils"
import { getImageSources } from "@/lib/image"

/**
 * Persistent DJ chip shown next to the track title in the mini-player
 * and inside the full-screen NowPlayingScreen header.
 *
 * Always visible whenever there is a `currentDj` — the DJ is the host
 * of the session, not just the entity talking right now, so the chip
 * stays put between segments. While the DJ audio element is actively
 * playing (`state.player.djSpeaking === true`), a small pulsing dot
 * overlays the avatar to convey "on air this very second".
 *
 * Renders nothing if no DJ has been resolved yet (e.g. tracks-only
 * playback from the Library tab, or a session that's still tuning).
 */
export default function DjOnAirIndicator({ className }) {
  const djSpeaking = useSelector((s) => s.player?.djSpeaking)
  const dj = useSelector((s) => s.djs?.currentDj)

  if (!dj) return null

  const name = dj.djName || ""
  const firstName = name.split(/\s+/)[0] || name
  const sources = getImageSources(dj.details?.image, "thumb")
  const initials = initialsFor(name)
  const gradient = gradientFor(dj.id)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/60 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-foreground",
        djSpeaking && "border-fuchsia-500/60 text-fuchsia-100",
        className
      )}
      title={djSpeaking ? `DJ ${name} on air` : `DJ ${name}`}
    >
      <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
        {sources.jpg || sources.webp ? (
          <picture>
            {sources.webp && <source srcSet={sources.webp} type="image/webp" />}
            <img
              src={sources.jpg || sources.webp}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </picture>
        ) : (
          <span
            className={cn(
              "grid h-full w-full place-items-center bg-gradient-to-br text-[9px] font-semibold text-white",
              gradient
            )}
          >
            {initials}
          </span>
        )}
        {djSpeaking && (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-fuchsia-400 opacity-75" />
            <span className="relative inline-block h-2 w-2 rounded-full bg-fuchsia-400 ring-1 ring-card" />
          </span>
        )}
      </span>
      <span className="max-w-[6rem] truncate">{firstName}</span>
    </span>
  )
}

// ---- avatar fallback helpers (mirror DjAvatarTile, sized for a chip)

function initialsFor(name) {
  if (!name) return "?"
  const parts = String(name)
    .replace(/["'`’]/g, "")
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-rose-500 to-orange-500",
  "from-amber-500 to-pink-500",
  "from-emerald-500 to-cyan-500",
  "from-sky-500 to-indigo-500",
  "from-teal-400 to-emerald-600",
  "from-lime-500 to-emerald-500",
  "from-fuchsia-500 to-pink-500",
]

function gradientFor(id) {
  if (!Number.isFinite(id)) return GRADIENTS[0]
  return GRADIENTS[Math.abs(id) % GRADIENTS.length]
}
