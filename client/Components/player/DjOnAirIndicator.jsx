import React from "react"
import { useSelector } from "react-redux"
import { cn } from "@/lib/utils"

/**
 * Small pulsing badge shown when the AI DJ is talking over the track.
 * Driven entirely by `state.player.djSpeaking`.
 */
export default function DjOnAirIndicator({ className }) {
  const djSpeaking = useSelector((s) => s.player?.djSpeaking)
  const dj = useSelector((s) => s.djs?.currentDj)
  if (!djSpeaking) return null
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-200",
        className
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-fuchsia-400 opacity-75" />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
      </span>
      {dj?.djName ? `DJ ${dj.djName}` : "DJ"} on air
    </span>
  )
}
