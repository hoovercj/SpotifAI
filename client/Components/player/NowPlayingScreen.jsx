import React, { useEffect, useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { AnimatePresence, motion } from "framer-motion"
import {
  ChevronDown,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
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
  setDjVolume,
  toggleMuted,
  clearDjPickerRequest,
} from "../../store/playerSlice"
import {
  fetchExclusiveDj,
  fetchPreferenceForSeed,
  deletePreferenceForSeed,
  updateExclusiveDj,
  clearExclusiveDj,
} from "../../store/djPreferencesSlice"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import DjAvatarTile from "./DjAvatarTile"
import { getImageSources } from "@/lib/image"

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
  const djVolume = useSelector((s) => s.player?.djVolume ?? 1.0)
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
  // Repeat surfaces alongside shuffle on playlist sessions — for the
  // open-ended seed types our queue refill already gives infinite play
  // so a repeat toggle would be redundant.
  const canRepeat = currentSession?.seed?.type === "playlist"
  const repeatMode = useSelector((s) => s.player?.repeatMode ?? "off")

  const {
    togglePlay,
    next,
    previous,
    seek,
    selectDj,
    shuffleCurrentSession,
    playDjAudio,
    setRepeatModeOnSpotify,
    endSession,
  } = useSpotifyPlayer()
  const [showDjPicker, setShowDjPicker] = useState(false)
  // Tracks where the picker was opened FROM so Cancel/Close can take
  // the user back to that surface instead of always dumping them on
  // the full-screen media view:
  //   - 'media'   → they were already inside NowPlayingScreen and
  //                  toggled the picker on top. Cancel just hides the
  //                  picker, returning to media.
  //   - 'request' → the DJ Action Bar fired requestDjPicker() (i.e.
  //                  the user was on the collapsed bar). Cancel closes
  //                  the whole drawer so they end up back on whatever
  //                  tab they were browsing.
  const [pickerOrigin, setPickerOrigin] = useState("media")
  // The DJ whose details are currently being inspected in the picker.
  // Tap an avatar to populate; Hire/Cancel below clears it.
  const [selectedDjForDetails, setSelectedDjForDetails] = useState(null)
  // Per-session checkbox toggle. When true, Hire promotes the picked
  // DJ to the global exclusive override; otherwise the swap is
  // ephemeral (just this session, with no preference saved).
  const [hireForAllStations, setHireForAllStations] = useState(false)

  // Honors `requestDjPicker()` (DJ Action Bar avatar tap) — when the
  // bar fires it, NowPlaying mounts/opens with this flag true, and we
  // immediately expand the picker. Consume the flag so a later manual
  // open/close doesn't ping-pong back into the picker.
  const pickerRequested = useSelector(
    (s) => Boolean(s.player?.nowPlayingPickerRequest)
  )
  useEffect(() => {
    if (!pickerRequested) return
    setShowDjPicker(true)
    setPickerOrigin("request")
    dispatch(clearDjPickerRequest())
  }, [pickerRequested, dispatch])

  // When the picker opens, pre-select the currently-hosting DJ so the
  // biography panel is visible immediately. Without this the user has
  // to tap their own DJ to learn anything — confusing for a "who's on
  // air?" interaction. We only seed when nothing is selected so we
  // don't clobber an in-progress browse if the picker re-renders.
  useEffect(() => {
    if (!showDjPicker) return
    if (selectedDjForDetails) return
    if (dj) setSelectedDjForDetails(dj)
  }, [showDjPicker, dj, selectedDjForDetails])

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

  // Open the picker from inside the full-screen media view. Recorded
  // as origin='media' so a subsequent Cancel returns the user to the
  // media view rather than closing the entire drawer.
  const openPickerFromMedia = () => {
    setPickerOrigin("media")
    setShowDjPicker(true)
  }

  // Close the picker AND honor where the user came from. If the picker
  // was the user's entry point (Action Bar request), Cancel/X dismisses
  // the whole drawer; if they were already in fullscreen media, we just
  // hide the picker. Always tears down per-session toggles either way.
  const closePicker = () => {
    const wasRequest = pickerOrigin === "request"
    setShowDjPicker(false)
    setSelectedDjForDetails(null)
    setHireForAllStations(false)
    if (wasRequest) {
      dispatch(closeNowPlaying())
    }
  }

  // Whenever the drawer itself closes (chevron, drag-down, ESC) make
  // sure the picker doesn't stay armed for the next open — without
  // this, dismissing while the picker is up means the next time the
  // user opens NowPlaying they're staring at the picker again with
  // stale selection state.
  useEffect(() => {
    if (!open) {
      setShowDjPicker(false)
      setSelectedDjForDetails(null)
      setHireForAllStations(false)
      setPickerOrigin("media")
    }
  }, [open])

  // Single "Hire" action.
  // - hireForAllStations checked → promote to exclusive (used everywhere)
  // - unchecked → swap for this session only and drop any stale per-seed
  //   preference so the next seed boot can pick its own DJ again.
  const handleHire = () => {
    if (!selectedDjForDetails) return
    selectDj(selectedDjForDetails)
    if (hireForAllStations) {
      dispatch(updateExclusiveDj(selectedDjForDetails.id))
    } else if (seedKey) {
      dispatch(deletePreferenceForSeed(seedKey))
    }
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
        <DrawerHeader className="flex flex-row items-center justify-between gap-3 px-4 pt-2">
          <button
            type="button"
            aria-label="Close Now Playing"
            onClick={() => dispatch(closeNowPlaying())}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          {/* Compact 2-line header. Replaces the prior centered
              "Playing from / <station>" block AND the duplicated "DJ
              avatar + Hosted by …" pill that used to sit above the
              album art. The avatar is now the right-hand affordance
              (and the picker entry point), so the mic icon is gone. */}
          <div className="flex min-w-0 flex-1 flex-col items-center text-center">
            <DrawerTitle className="line-clamp-1 text-sm font-medium text-foreground">
              Now playing:{" "}
              <span className="text-foreground">
                {context?.name || "your library"}
              </span>
            </DrawerTitle>
            <DrawerDescription className="line-clamp-1 text-xs text-muted-foreground">
              {dj ? `Hosted by ${dj.djName}` : "No host selected"}
            </DrawerDescription>
          </div>
          {dj ? (
            <DjAvatarTile
              dj={dj}
              size="sm"
              onClick={openPickerFromMedia}
              ariaLabel={`Hosted by ${dj.djName}. Tap to change.`}
              className="shrink-0"
            />
          ) : (
            // Spacer so the centered text block doesn't shift when no
            // DJ is loaded (e.g. cold boot before djs.allDjs resolves).
            <div className="h-9 w-9 shrink-0" aria-hidden="true" />
          )}
        </DrawerHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {showDjPicker ? (
              <motion.div
                key="picker"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-6 pt-4"
              >
                <div className="flex items-center justify-between">
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
                  <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
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

                {/* Two-row horizontal-scroll roster. Fixed-height
                    so it never reflows when the bio swaps below, and
                    the bleed-out (-mx-6 + px-6) lets the scroll
                    affordance reach the screen edges. The grid uses
                    grid-flow-col + grid-rows-2 + auto-cols-max so DJs
                    fill column-first (top, bottom, next column,
                    top, bottom, …) and each column hugs its tile. */}
                <div className="-mx-6 overflow-x-auto px-6 pb-1">
                  <div className="grid auto-cols-max grid-flow-col grid-rows-2 gap-3">
                    {orderedDjs.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Loading DJs…
                      </p>
                    )}
                    {orderedDjs.map((d) => (
                      <DjAvatarTile
                        key={d.id}
                        dj={d}
                        size="md"
                        showName
                        selected={selectedDjForDetails?.id === d.id}
                        current={
                          dj?.id === d.id && selectedDjForDetails?.id !== d.id
                        }
                        onClick={() => setSelectedDjForDetails(d)}
                      />
                    ))}
                  </div>
                </div>

                {/* Bio panel — takes the rest of the column with
                    `flex-1 min-h-0`. Internally it has a fixed header
                    (avatar + name + genres), a scrollable text middle
                    (djStyle + signature phrase), and a fixed footer
                    (preview / toggle / actions). Swapping selection
                    only re-renders content inside this stable shell,
                    so the click-flash from the old AnimatePresence
                    detail panel is gone. */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/70">
                  {selectedDjForDetails ? (
                    // Keyed motion.div = quick fade-in whenever the
                    // user taps a different tile. React unmounts the
                    // previous bio and mounts a fresh one starting at
                    // opacity 0, so there's a 120ms cross-fade-ish
                    // feel without any layout shift (parent dims are
                    // fixed via flex-1/min-h-0/overflow-hidden).
                    <motion.div
                      key={selectedDjForDetails.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      className="flex min-h-0 flex-1 flex-col"
                    >
                      <div className="flex items-start gap-3 border-b border-border/40 p-4">
                        <DjAvatarTile dj={selectedDjForDetails} size="lg" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="text-base font-semibold text-foreground">
                            {selectedDjForDetails.djName}
                          </p>
                          {Array.isArray(
                            selectedDjForDetails.details?.genres
                          ) &&
                          selectedDjForDetails.details.genres.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {selectedDjForDetails.details.genres
                                .slice(0, 4)
                                .map((g) => (
                                  <span
                                    key={g}
                                    className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                                  >
                                    {g}
                                  </span>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                        {selectedDjForDetails.details?.djStyle ? (
                          <p className="text-sm leading-relaxed text-foreground/85">
                            {selectedDjForDetails.details.djStyle}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-3 border-t border-border/40 p-4">
                        {/* Voice preview row — the Audition button (when
                            an intro WAV has been baked) and the exact
                            spoken transcript sit side-by-side so users
                            see what they're about to hear before they
                            tap. The transcript comes from
                            details.introText, which loadPersonas
                            populates via the same buildIntroText() that
                            seed-dj-intros uses, so the displayed text
                            is guaranteed in sync with the audio. When
                            no intro is baked we fall back to the first
                            signature phrase so the panel still has the
                            persona's on-air flavor in it. */}
                        {selectedDjForDetails.details?.introUrl ||
                        selectedDjForDetails.details?.introText ||
                        (Array.isArray(
                          selectedDjForDetails.details?.signaturePhrases
                        ) &&
                          selectedDjForDetails.details.signaturePhrases.length >
                            0) ? (
                          <div className="flex items-stretch gap-3">
                            {selectedDjForDetails.details?.introUrl ? (
                              <button
                                type="button"
                                aria-label={`Play intro from ${selectedDjForDetails.djName}`}
                                title={`Play intro from ${selectedDjForDetails.djName}`}
                                onClick={() =>
                                  playDjAudio(
                                    selectedDjForDetails.details.introUrl
                                  )
                                }
                                // Primary-style gradient pill that
                                // stretches to match the transcript
                                // block height (items-stretch on the
                                // row + h-auto here). `min-h-[3rem]`
                                // keeps it from collapsing when the
                                // transcript is unusually short, and
                                // `self-stretch` makes the height
                                // mirror the sibling <p>. Mirrors the
                                // big circular gradient station-play
                                // control further down the screen so
                                // both primary actions read the same.
                                className="inline-flex h-auto min-h-[3rem] shrink-0 items-center justify-center self-stretch rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-4 text-white shadow-md shadow-fuchsia-900/40 transition hover:from-violet-400 hover:to-fuchsia-400 active:scale-95"
                              >
                                <Play className="h-5 w-5" />
                              </button>
                            ) : null}
                            {selectedDjForDetails.details?.introText ||
                            selectedDjForDetails.details?.signaturePhrases?.[0] ? (
                              <p className="min-w-0 flex-1 border-l-2 border-fuchsia-500/60 pl-3 text-sm italic text-muted-foreground">
                                “
                                {selectedDjForDetails.details?.introText ||
                                  selectedDjForDetails.details
                                    .signaturePhrases[0]}
                                ”
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Hire-for-all-stations toggle. */}
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              Hire for all stations
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Make {selectedDjForDetails.djName} your exclusive host everywhere.
                            </span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={hireForAllStations}
                            aria-label="Hire for all stations"
                            onClick={() =>
                              setHireForAllStations((v) => !v)
                            }
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                              hireForAllStations
                                ? "bg-fuchsia-500"
                                : "bg-zinc-600/70"
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                hireForAllStations
                                  ? "translate-x-5"
                                  : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={closePicker}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleHire}>
                            Hire
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                      Tap a DJ above to see their bio.
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="media"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-10"
              >
                {/* Album art — the prior "DJ avatar + Hosted by"
                    pill that sat here was moved into DrawerHeader to
                    keep this view focused on the music. */}
                <div className="mx-auto mt-6 aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-muted shadow-2xl shadow-black/60">
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
                  {canRepeat && (() => {
                    // Cycle off → context → track → off, mirroring
                    // Spotify's mobile transport. The icon swaps to
                    // Repeat1 in 'track' mode and the button tints
                    // fuchsia whenever the mode is non-off so users
                    // can tell at a glance that repeat is engaged.
                    const nextMode =
                      repeatMode === "off"
                        ? "context"
                        : repeatMode === "context"
                        ? "track"
                        : "off"
                    const Icon = repeatMode === "track" ? Repeat1 : Repeat
                    const label =
                      repeatMode === "off"
                        ? "Repeat off"
                        : repeatMode === "context"
                        ? "Repeat playlist"
                        : "Repeat track"
                    return (
                      <button
                        type="button"
                        aria-label={label}
                        title={label}
                        onClick={() => setRepeatModeOnSpotify(nextMode)}
                        className={`grid h-10 w-10 place-items-center rounded-full hover:bg-muted ${
                          repeatMode === "off"
                            ? "text-muted-foreground hover:text-foreground"
                            : "text-fuchsia-400"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    )
                  })()}
                </div>

                {/* End-session escape hatch — clears the in-memory
                    session + closes Now Playing so the user lands back
                    on Home with an empty player. The matching
                    `recent_session` row stays on the server so they
                    can re-tap it from the Home rail. */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => endSession("button")}
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Stop session
                  </button>
                </div>

                {/* Volume + mute (master) */}
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
                    aria-label="Song volume"
                  />
                </div>

                {/* DJ volume — sets the DJ overlay's level relative
                    to the master volume above. Default 100% (parity
                    with the old behavior where they shared a single
                    slider); drop it to hear the music louder during
                    DJ breaks. The avatar in front of the slider acts
                    as a passive label so users grok which slider is
                    which without an extra row of text. */}
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground"
                    aria-hidden="true"
                  >
                    {(() => {
                      const s = getImageSources(dj?.details?.image, "thumb")
                      if (!s.jpg && !s.webp) {
                        return (
                          <span className="text-[10px] font-semibold uppercase tracking-wide">
                            DJ
                          </span>
                        )
                      }
                      return (
                        <picture>
                          {s.webp && <source srcSet={s.webp} type="image/webp" />}
                          <img
                            src={s.jpg || s.webp}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </picture>
                      )
                    })()}
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[djVolume]}
                    onValueChange={(v) => dispatch(setDjVolume(v[0]))}
                    className="cursor-pointer"
                    aria-label="DJ voice volume"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
