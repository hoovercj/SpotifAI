import React, { useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import axios from "axios"
import { motion } from "framer-motion"
import {
  CloudSun,
  Loader2,
  Music2,
  Newspaper,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import DjAvatarTile from "./DjAvatarTile"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import { requestDjPicker } from "../../store/playerSlice"

/**
 * Bar contents shown while the mini-player is in "DJ mode". Replaces the
 * normal artwork + transport row with:
 *
 *   [ DJ avatar (left) | news | weather | music-info | close (right) ]
 *
 * The avatar is wrapped in a framer-motion shared-layout element with
 * `layoutId="player.dj-avatar"`, so it visually slides from its
 * right-edge resting position (NowPlayingBar) over to the left when DJ
 * mode opens, and back when it closes.
 *
 * The three info actions POST `/api/content/info-request` with the
 * currently-playing track, then hand the returned data URI to
 * `playDjAudio()` on the player context — which interrupts any pending
 * scheduled segment, ducks Spotify, and plays the new clip through the
 * same overlay audio element so all the duck/restore plumbing already
 * works.
 *
 * 204 responses (news / music-info with nothing fresh to say) surface
 * as an inline toast under the bar rather than a silent failure.
 */

const ACTIONS = [
  { kind: "news", label: "News brief", Icon: Newspaper },
  { kind: "weather", label: "Weather", Icon: CloudSun },
  { kind: "music-info", label: "About this song", Icon: Music2 },
]

export default function DjActionBar({ onClose }) {
  const dispatch = useDispatch()
  const { playDjAudio } = useSpotifyPlayer()
  const dj = useSelector((s) => s.djs?.currentDj)
  const djSpeaking = useSelector((s) => s.player?.djSpeaking)
  const userSessionId = useSelector((s) => s.userSession?.id)
  const currentTrack = useSelector((s) => s.player?.currentTrack)

  const [requestingKind, setRequestingKind] = useState(null)
  const [notice, setNotice] = useState(null)

  const trackForRequest = currentTrack
    ? {
        name: currentTrack.name,
        artist: Array.isArray(currentTrack.artists)
          ? currentTrack.artists[0]?.name
          : "",
      }
    : null
  const canRequest =
    !!dj?.id && !!userSessionId && !!trackForRequest?.name && !!trackForRequest?.artist

  async function handleAction(kind) {
    if (!canRequest || requestingKind) return
    setNotice(null)
    setRequestingKind(kind)
    try {
      const resp = await axios.post("/api/content/info-request", {
        kind,
        userSessionId,
        djId: dj.id,
        currentTrack: trackForRequest,
      })
      if (resp.status === 204) {
        setNotice(noticeForEmpty(kind))
        return
      }
      const audioURI = resp.data?.audioURI
      if (!audioURI) {
        setNotice("Couldn't get an audio response — try again in a moment.")
        return
      }
      await playDjAudio(audioURI)
      // Drop back to normal bar so the user sees what's playing.
      onClose?.()
    } catch (err) {
      const code = err?.response?.data?.error
      setNotice(noticeForError(code) || "Something went wrong. Try again.")
    } finally {
      setRequestingKind(null)
    }
  }

  return (
    <div className="flex h-full w-full items-center gap-3">
      <motion.div
        layoutId="player.dj-avatar"
        className="relative shrink-0"
        transition={SHARED_LAYOUT_SPRING}
      >
        <DjAvatarTile
          dj={dj}
          size="sm"
          onClick={(e) => {
            e?.stopPropagation?.()
            dispatch(requestDjPicker())
          }}
          ariaLabel={
            dj?.djName ? `Change DJ (currently ${dj.djName})` : "Change DJ"
          }
          className="!rounded-md"
        />
        {djSpeaking && (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-fuchsia-400 opacity-75" />
            <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-fuchsia-400 ring-2 ring-card" />
          </span>
        )}
      </motion.div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
        {ACTIONS.map(({ kind, label, Icon }) => {
          const busy = requestingKind === kind
          return (
            <button
              key={kind}
              type="button"
              disabled={!canRequest || !!requestingKind}
              onClick={(e) => {
                e.stopPropagation()
                handleAction(kind)
              }}
              aria-label={label}
              title={label}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              )}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
            </button>
          )
        })}
      </div>

      {notice && (
        <span
          role="status"
          className="hidden truncate text-[11px] text-muted-foreground sm:inline-block sm:max-w-[10rem]"
          title={notice}
        >
          {notice}
        </span>
      )}

      <button
        type="button"
        aria-label="Close DJ actions"
        onClick={(e) => {
          e.stopPropagation()
          onClose?.()
        }}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

// Tuned to feel like a deliberate UI mode-shift rather than a snappy
// micro-interaction. Matches what NowPlayingBar uses for the row swap.
const SHARED_LAYOUT_SPRING = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.7,
}

function noticeForEmpty(kind) {
  if (kind === "news") return "No fresh news right now."
  if (kind === "music-info") return "Nothing to say about this track yet."
  return "Nothing to share right now."
}

function noticeForError(code) {
  switch (code) {
    case "profile_location_required":
      return "Add your zip in profile to get a weather report."
    case "current_track_required":
      return "Start playing a track first."
    case "dj_id_required":
    case "invalid_dj_id":
      return "Pick a DJ first."
    case "session_required":
      return "Sign in to use DJ actions."
    default:
      return null
  }
}
