import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useLocation, useNavigate } from "react-router-dom"
import { Search as SearchIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/Components/ui/input"
import { Skeleton } from "@/Components/ui/skeleton"
import {
  clearResults,
  fetchNextPage,
  pushRecent,
  removeRecent,
  SEARCH_TYPES,
  setActiveType,
  setQuery as setQueryAction,
} from "../../store/searchSlice"
import { useSpotifyPlayer } from "../player/useSpotifyPlayer"
import BrowseAllGrid from "./BrowseAllGrid"
import AIStationsRow from "./AIStationsRow"
import { stationsForQuery } from "./aiStations"

const DEBOUNCE_MS = 300

const TYPE_LABELS = {
  playlist: "Playlists",
  track: "Songs",
  artist: "Artists",
  album: "Albums",
  show: "Podcasts",
  audiobook: "Audiobooks",
}

function pickImage(item) {
  if (item?.album?.images?.[0]?.url) return item.album.images[0].url
  if (item?.images?.[0]?.url) return item.images[0].url
  return null
}

function artistList(item) {
  if (Array.isArray(item?.artists)) return item.artists.map((a) => a.name).join(", ")
  return ""
}

function subtitleFor(item, type) {
  switch (type) {
    case "track":
      return `Song · ${artistList(item)}`
    case "artist":
      return "Artist"
    case "album":
      return `Album · ${artistList(item)}`
    case "playlist":
      return `Playlist · ${item?.owner?.display_name || ""}`
    case "show":
      return `Podcast · ${item?.publisher || ""}`
    case "audiobook":
      return "Audiobook"
    default:
      return ""
  }
}

export default function SearchTab() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const sentinelRef = useRef(null)

  const query = useSelector((s) => s.search?.query ?? "")
  const activeType = useSelector((s) => s.search?.activeType ?? "playlist")
  const typeState = useSelector(
    (s) => s.search?.byType?.[activeType] ?? null
  )
  const recent = useSelector((s) => s.search?.recent ?? [])
  const accessToken = useSelector((s) => s.user?.details?.accessToken)

  const [isFocused, setIsFocused] = useState(false)
  const { playTracks, playContext } = useSpotifyPlayer()

  // Pick up `?q=...` from the URL (set by Home's GenreStationTile or
  // anywhere else that wants to deep-link into search).
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const q = params.get("q")
    if (q && q !== query) {
      dispatch(setQueryAction(q))
    }
    // we intentionally don't include `query` in deps: only react when the
    // URL itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  // Auto-focus on mount.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced first-page fetch for the active type. `fetchNextPage` is
  // idempotent: it bails when the type is already loading or out of pages,
  // so dispatching unconditionally is safe.
  useEffect(() => {
    window.clearTimeout(debounceRef.current)
    if (!accessToken) return
    const trimmed = query.trim()
    if (!trimmed) {
      dispatch(clearResults())
      return
    }
    debounceRef.current = window.setTimeout(() => {
      dispatch(fetchNextPage(activeType))
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(debounceRef.current)
    // We re-arm whenever query OR the active type changes — switching pills
    // should lazy-load the first page for the newly-selected type.
  }, [query, activeType, accessToken, dispatch])

  // When the user picks a new pill that has no results yet, fetch its first
  // page immediately (no debounce — they're explicitly asking for it).
  useEffect(() => {
    if (!accessToken) return
    if (!query.trim()) return
    if (!typeState) return
    if (typeState.items.length > 0) return
    if (typeState.loading) return
    if (typeState.offset !== 0) return
    dispatch(fetchNextPage(activeType))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType])

  // Infinite scroll: when the sentinel scrolls into view, fetch the next
  // page for the currently active type.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    if (!typeState?.hasMore) return
    if (typeState?.loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          dispatch(fetchNextPage(activeType))
        }
      },
      { rootMargin: "200px 0px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [activeType, typeState?.hasMore, typeState?.loading, typeState?.items.length, dispatch])

  const handleQueryChange = (e) => {
    const next = e.target.value
    dispatch(setQueryAction(next))
    // Reflect into URL without history spam so refresh + back work sensibly.
    const params = new URLSearchParams(location.search)
    if (next) params.set("q", next)
    else params.delete("q")
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true }
    )
  }

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault?.()
      const trimmed = query.trim()
      if (!trimmed) return
      dispatch(pushRecent(trimmed))
    },
    [dispatch, query]
  )

  const handleRecentSelect = (q) => {
    dispatch(setQueryAction(q))
    const params = new URLSearchParams(location.search)
    params.set("q", q)
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true }
    )
  }

  const handleClear = () => {
    dispatch(setQueryAction(""))
    dispatch(clearResults())
    const params = new URLSearchParams(location.search)
    params.delete("q")
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true }
    )
    inputRef.current?.focus()
  }

  const handlePillClick = (type) => {
    if (type === activeType) return
    dispatch(setActiveType(type))
  }

  const playTrack = (track) => {
    if (!track?.uri) return
    playTracks([track.uri])
    dispatch(pushRecent(query.trim()))
  }
  const playCtx = (item, type) => {
    if (!item?.uri) return
    playContext({
      type,
      uri: item.uri,
      name: item.name,
      image: pickImage(item),
    })
    dispatch(pushRecent(query.trim()))
  }

  const stationsBundle = useMemo(() => stationsForQuery(query), [query])

  const showEmpty = !query.trim()
  const showRecent = isFocused && showEmpty && recent.length > 0

  return (
    <div className="flex flex-col gap-4 pt-4 pb-2">
      <div className="px-4">
        <form onSubmit={handleSubmit} className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
            placeholder="Artists, songs, albums, podcasts…"
            className="pl-9 pr-9"
            inputMode="search"
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {showRecent && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recent
            </span>
            {recent.map((r) => (
              <RecentChip
                key={r}
                label={r}
                onSelect={() => handleRecentSelect(r)}
                onRemove={() => dispatch(removeRecent(r))}
              />
            ))}
          </div>
        )}

        {/* Pills — mirror Library tab; default selection is Playlists. */}
        {!showEmpty && (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SEARCH_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handlePillClick(t)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeType === t
                    ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-900/30"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                )}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {showEmpty && <BrowseAllGrid />}

      {/* AI Stations row — only when the query matches a known genre or mood */}
      {!showEmpty && stationsBundle && (
        <AIStationsRow
          axis={stationsBundle.axis}
          axisId={stationsBundle.axisId}
          stations={stationsBundle.stations}
        />
      )}

      {/* Results list for the currently selected type */}
      {!showEmpty && (
        <ResultsList
          type={activeType}
          typeState={typeState}
          onPlayTrack={playTrack}
          onPlayContext={playCtx}
          sentinelRef={sentinelRef}
        />
      )}
    </div>
  )
}

function ResultsList({ type, typeState, onPlayTrack, onPlayContext, sentinelRef }) {
  const items = typeState?.items ?? []
  const loading = typeState?.loading
  const hasMore = typeState?.hasMore
  const error = typeState?.error

  const handleClick = (item) => {
    if (type === "track") onPlayTrack(item)
    else onPlayContext(item, type)
  }

  // First-page loading: render skeletons.
  if (loading && items.length === 0) return <LoadingSkeletons />

  // First page returned no results AND no more pages.
  if (!loading && items.length === 0 && !error) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 px-4 text-center">
        <SearchIcon className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No {TYPE_LABELS[type].toLowerCase()} found</p>
        <p className="text-xs text-muted-foreground">
          Try a different spelling or pick another category above.
        </p>
      </div>
    )
  }

  return (
    <section className="flex flex-col">
      <ul className="flex flex-col">
        {items.map((item) => (
          <ResultRow
            key={item.uri}
            image={pickImage(item)}
            title={item.name}
            subtitle={subtitleFor(item, type)}
            rounded={type === "artist"}
            onClick={() => handleClick(item)}
          />
        ))}
      </ul>

      {/* Sentinel + footer states */}
      <div ref={sentinelRef} aria-hidden="true" />

      {loading && items.length > 0 && (
        <div className="grid place-items-center py-4">
          <Skeleton className="h-3 w-24" />
        </div>
      )}

      {!loading && !hasMore && items.length > 0 && (
        <p className="py-4 text-center text-[11px] uppercase tracking-wider text-muted-foreground/70">
          End of results
        </p>
      )}

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </section>
  )
}

function ResultRow({ image, title, subtitle, rounded, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <div
          className={cn(
            "relative h-12 w-12 shrink-0 overflow-hidden bg-muted",
            rounded ? "rounded-full" : "rounded-md"
          )}
        >
          {image && (
            <img src={image} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </button>
    </li>
  )
}

function RecentChip({ label, onSelect, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 pl-3 pr-1 text-xs">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        className="py-1 text-foreground/90 hover:text-foreground"
      >
        {label}
      </button>
      <button
        type="button"
        aria-label={`Remove ${label} from recent searches`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onRemove}
        className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function LoadingSkeletons() {
  return (
    <div className="flex flex-col gap-2 px-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-12 w-12 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
