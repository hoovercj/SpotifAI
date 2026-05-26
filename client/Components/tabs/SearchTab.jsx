import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useLocation, useNavigate } from "react-router-dom"
import { Search as SearchIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/Components/ui/input"
import { Skeleton } from "@/Components/ui/skeleton"
import {
  clearResults,
  pushRecent,
  removeRecent,
  searchAll,
  setQuery as setQueryAction,
} from "../../store/searchSlice"
import { useSpotifyPlayer } from "../player/useSpotifyPlayer"
import BrowseAllGrid from "./BrowseAllGrid"

const DEBOUNCE_MS = 300

function pickImage(item) {
  if (item?.album?.images?.[0]?.url) return item.album.images[0].url
  if (item?.images?.[0]?.url) return item.images[0].url
  return null
}

function artistList(item) {
  if (Array.isArray(item?.artists)) return item.artists.map((a) => a.name).join(", ")
  return ""
}

export default function SearchTab() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  const query = useSelector((s) => s.search?.query ?? "")
  const loading = useSelector((s) => s.search?.loading)
  const error = useSelector((s) => s.search?.error)
  const results = useSelector((s) => s.search?.results)
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

  // Debounced search.
  useEffect(() => {
    window.clearTimeout(debounceRef.current)
    if (!accessToken) return
    const trimmed = query.trim()
    if (!trimmed) {
      dispatch(clearResults())
      return
    }
    debounceRef.current = window.setTimeout(() => {
      dispatch(searchAll(trimmed))
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(debounceRef.current)
  }, [query, accessToken, dispatch])

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

  const showEmpty = !query.trim()
  const showRecent = isFocused && showEmpty && recent.length > 0
  const hasAnyResults = useMemo(
    () =>
      Boolean(
        results?.tracks?.length ||
          results?.artists?.length ||
          results?.albums?.length ||
          results?.playlists?.length ||
          results?.shows?.length ||
          results?.audiobooks?.length
      ),
    [results]
  )

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
      </div>

      {/* Empty state */}
      {showEmpty && !loading && <BrowseAllGrid />}

      {/* Loading state */}
      {!showEmpty && loading && <LoadingSkeletons />}

      {/* Error */}
      {!showEmpty && error && !loading && (
        <div className="mx-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {!showEmpty && !loading && hasAnyResults && (
        <div className="flex flex-col gap-6">
          {results.tracks?.length > 0 && (
            <Section title="Songs">
              {results.tracks.map((t) => (
                <ResultRow
                  key={t.uri}
                  image={pickImage(t)}
                  title={t.name}
                  subtitle={`Song · ${artistList(t)}`}
                  onClick={() => playTrack(t)}
                />
              ))}
            </Section>
          )}
          {results.artists?.length > 0 && (
            <Section title="Artists">
              {results.artists.map((a) => (
                <ResultRow
                  key={a.uri}
                  image={pickImage(a)}
                  title={a.name}
                  subtitle="Artist"
                  rounded
                  onClick={() => playCtx(a, "artist")}
                />
              ))}
            </Section>
          )}
          {results.albums?.length > 0 && (
            <Section title="Albums">
              {results.albums.map((a) => (
                <ResultRow
                  key={a.uri}
                  image={pickImage(a)}
                  title={a.name}
                  subtitle={`Album · ${artistList(a)}`}
                  onClick={() => playCtx(a, "album")}
                />
              ))}
            </Section>
          )}
          {results.playlists?.length > 0 && (
            <Section title="Playlists">
              {results.playlists.map((p) => (
                <ResultRow
                  key={p.uri}
                  image={pickImage(p)}
                  title={p.name}
                  subtitle={`Playlist · ${p.owner?.display_name || ""}`}
                  onClick={() => playCtx(p, "playlist")}
                />
              ))}
            </Section>
          )}
          {results.shows?.length > 0 && (
            <Section title="Podcasts">
              {results.shows.map((s) => (
                <ResultRow
                  key={s.uri}
                  image={pickImage(s)}
                  title={s.name}
                  subtitle={`Podcast · ${s.publisher || ""}`}
                  onClick={() => playCtx(s, "show")}
                />
              ))}
            </Section>
          )}
          {results.audiobooks?.length > 0 && (
            <Section title="Audiobooks">
              {results.audiobooks.map((b) => (
                <ResultRow
                  key={b.uri}
                  image={pickImage(b)}
                  title={b.name}
                  subtitle="Audiobook"
                  onClick={() => playCtx(b, "audiobook")}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {/* No results */}
      {!showEmpty && !loading && !error && !hasAnyResults && (
        <div className="mt-4 flex flex-col items-center gap-2 px-4 text-center">
          <SearchIcon className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-muted-foreground">
            Try a different spelling or a more general term.
          </p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col">
      <h2 className="px-4 pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col">{children}</ul>
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
    <div className="flex flex-col gap-4 px-4">
      {[0, 1].map((s) => (
        <section key={s} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-12 w-12 rounded-md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
