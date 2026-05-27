import React, { useEffect, useMemo, useState } from "react"
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
  Shuffle,
  X,
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
import {
  fetchExclusiveDj,
  fetchPreferenceForSeed,
  setPreferenceForSeed,
  deletePreferenceForSeed,
  updateExclusiveDj,
  clearExclusiveDj,
} from "../../store/djPreferencesSlice"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import DjOnAirIndicator from "./DjOnAirIndicator"
import DjAvatarTile from "./DjAvatarTile"

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
  // Used to decide whether to render the shuffle button. Only playlist
  // seeds get shuffle — for stations/moods/track/artist sessions the
  // server has already curated a meaningful order (or refill keeps the
  // stream fresh) and shuffling would just be noise.
  const currentSession = useSelector((s) => s.player?.currentSession)
  const canShuffle = currentSession?.seed?.type === "playlist"

  const { togglePlay, next, previous, seek, selectDj, shuffleCurrentSession } =
    useSpotifyPlayer()
  const [showDjPicker, setShowDjPicker] = useState(false)
  const [pendingDj, setPendingDj] = useState(null)

  // Prefs (Phase 7) — exclusiveDjId is the global override; preference
  // for this session's seed lives in preferencesBySeedKey[seedKey].
  const exclusiveDjId = useSelector(
    (s) => s.djPreferences?.exclusiveDjId ?? null
  )
  const preferencesBySeedKey = useSelector(
    (s) => s.djPreferences?.preferencesBySeedKey || {}
  )
  const seedKey = currentSession?.id || null
  const preferredDjId = seedKey ? preferencesBySeedKey[seedKey] || null : null

  // Lazily hydrate prefs the first time the picker is opened. Avoid
  // firing on initial mount so we don't bother anonymous users.
  useEffect(() => {
    if (!showDjPicker) return
    dispatch(fetchExclusiveDj())
    if (seedKey) dispatch(fetchPreferenceForSeed(seedKey))
  }, [showDjPicker, seedKey, dispatch])

  // Genre-aware candidate filter. If we can guess a genre tag from the
  // session seed (station / mood / explicit `genres` field), narrow
  // the avatar grid to DJs whose `details.genres` overlap. Otherwise
  // show the full roster — better to over-show than to hide a fit.
  const seedGenreTags = useMemo(() => {
    const seed = currentSession?.seed || {}
    const tags = new Set()
    if (typeof seed.genreId === "string") tags.add(seed.genreId)
    if (Array.isArray(seed.genres)) seed.genres.forEach((g) => tags.add(g))
    return tags
  }, [currentSession])

  const orderedDjs = useMemo(() => {
    const list = Array.isArray(allDjs) ? [...allDjs] : []
    list.sort((a, b) => (a.id || 0) - (b.id || 0))
    if (seedGenreTags.size === 0) return list
    // Genre-matching first, then the rest, so the player sees plausible
    // hosts up top but still has access to everyone for an off-piste swap.
    const matches = []
    const rest = []
    for (const d of list) {
      const djGenres = d?.details?.genres || []
      const hit = djGenres.some((g) => seedGenreTags.has(g))
      if (hit) matches.push(d)
      else rest.push(d)
    }
    return [...matches, ...rest]
  }, [allDjs, seedGenreTags])

  const closePicker = () => {
    setShowDjPicker(false)
    setPendingDj(null)
  }

  const handlePickSwap = () => {
    if (!pendingDj) return
    selectDj(pendingDj)
    if (seedKey) {
      // Clear any stale per-seed preference — the user wants this swap
      // to be ephemeral. (Exclusive override is untouched.)
      dispatch(deletePreferenceForSeed(seedKey))
    }
    closePicker()
  }

  const handlePickPreferred = () => {
    if (!pendingDj || !seedKey) return
    selectDj(pendingDj)
    dispatch(
      setPreferenceForSeed({ seedKey, djId: pendingDj.id })
    )
    closePicker()
  }

  const handlePickExclusive = () => {
    if (!pendingDj) return
    selectDj(pendingDj)
    dispatch(updateExclusiveDj(pendingDj.id))
    closePicker()
  }

  const handleClearExclusive = () => {
    dispatch(clearExclusiveDj())
  }

  const handleClearPreferred = () => {
    if (!seedKey) return
    dispatch(deletePreferenceForSeed(seedKey))
  }

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
          {/* DJ avatar — tappable shortcut to the picker. Sits above the
              album art so the listener always sees who's hosting. */}
          {dj ? (
            <div className="mx-auto -mb-2 flex flex-col items-center gap-1">
              <DjAvatarTile
                dj={dj}
                size="lg"
                onClick={() => setShowDjPicker(true)}
                ariaLabel={`Hosted by ${dj.djName}. Tap to change.`}
              />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Hosted by {dj.djName}
              </span>
            </div>
          ) : null}

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
            {canShuffle && (
              <button
                type="button"
                aria-label="Shuffle playlist"
                onClick={() => shuffleCurrentSession()}
                className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Re-shuffle this playlist"
              >
                <Shuffle className="h-5 w-5" />
              </button>
            )}
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

          {/* DJ picker (collapsible) — avatar grid with optional
              "set as exclusive" / "lock to this session" upgrades. */}
          {showDjPicker && (
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Choose your DJ
                </p>
                <button
                  type="button"
                  onClick={closePicker}
                  aria-label="Close DJ picker"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {(exclusiveDjId || preferredDjId) && (
                <div className="mb-3 flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  {exclusiveDjId ? (
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Exclusive DJ active —{" "}
                        {allDjs?.find?.((d) => d.id === exclusiveDjId)
                          ?.djName || `#${exclusiveDjId}`}{" "}
                        hosts every session.
                      </span>
                      <button
                        type="button"
                        onClick={handleClearExclusive}
                        className="text-fuchsia-400 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                  {preferredDjId ? (
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        This seed is locked to{" "}
                        {allDjs?.find?.((d) => d.id === preferredDjId)
                          ?.djName || `#${preferredDjId}`}
                        .
                      </span>
                      <button
                        type="button"
                        onClick={handleClearPreferred}
                        className="text-fuchsia-400 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="grid max-h-72 grid-cols-4 gap-3 overflow-y-auto sm:grid-cols-5">
                {orderedDjs.length === 0 && (
                  <p className="col-span-full text-xs text-muted-foreground">
                    Loading DJs…
                  </p>
                )}
                {orderedDjs.map((d) => (
                  <DjAvatarTile
                    key={d.id}
                    dj={d}
                    size="md"
                    showName
                    selected={dj?.id === d.id}
                    onClick={() => setPendingDj(d)}
                  />
                ))}
              </div>

              {pendingDj && (
                <div className="mt-4 flex flex-col gap-3 rounded-md border border-border/60 bg-background/80 p-3">
                  <div className="flex items-center gap-3">
                    <DjAvatarTile dj={pendingDj} size="sm" />
                    <div className="flex flex-col">
                      <p className="text-sm font-medium text-foreground">
                        Switch to {pendingDj.djName}?
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Pick how long this stays in effect.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={handlePickSwap}>
                      Just this session
                    </Button>
                    {seedKey && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handlePickPreferred}
                      >
                        Always for this seed
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePickExclusive}
                    >
                      Make exclusive
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDj(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
