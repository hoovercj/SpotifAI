import React, { useEffect, useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Disc3, LayoutGrid, List, Music2, User, Mic2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/Components/ui/skeleton"
import {
  fetchSavedAlbums,
  fetchSavedShows,
  fetchSavedTracks,
  fetchFollowedArtists,
} from "../../store/librarySlice"
import { useSpotifyPlayer } from "../player/useSpotifyPlayer"
import LibraryItemMenu from "./LibraryItemMenu"

const FILTERS = [
  { id: "all", label: "All" },
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
  { id: "tracks", label: "Songs" },
  { id: "podcasts", label: "Podcasts" },
]

function pickImage(item) {
  if (item?.album?.images?.[0]?.url) return item.album.images[0].url
  if (item?.images?.[0]?.url) return item.images[0].url
  return null
}

function normalizeArtists(item) {
  if (Array.isArray(item?.artists)) {
    return item.artists.map((a) => a.name).join(", ")
  }
  return ""
}

function normalize(item, kind) {
  return {
    id: item.id || item.uri,
    uri: item.uri,
    name: item.name,
    image: pickImage(item),
    kind,
    subtitle:
      kind === "track"
        ? `Song · ${normalizeArtists(item)}`
        : kind === "album"
        ? `Album · ${normalizeArtists(item)}`
        : kind === "playlist"
        ? `Playlist · ${item.owner?.display_name || ""}`
        : kind === "artist"
        ? "Artist"
        : kind === "show"
        ? `Podcast · ${item.publisher || ""}`
        : "",
  }
}

export default function LibraryTab() {
  const dispatch = useDispatch()
  const [filter, setFilter] = useState("all")
  const [view, setView] = useState("list")

  const playlists = useSelector((s) => s.stations?.allStations || [])
  const playlistsLoading = useSelector((s) => Boolean(s.stations?.loading))

  const savedAlbums = useSelector((s) => s.library.savedAlbums)
  const savedTracks = useSelector((s) => s.library.savedTracks)
  const savedShows = useSelector((s) => s.library.savedShows)
  const followedArtists = useSelector((s) => s.library.followedArtists)

  const { playContext, playTracks } = useSpotifyPlayer()

  // Fire each fetch lazily based on which filter the user has selected.
  // "all" eagerly kicks off all four so the unified list can render.
  useEffect(() => {
    if (filter === "all" || filter === "albums") dispatch(fetchSavedAlbums())
    if (filter === "all" || filter === "tracks") dispatch(fetchSavedTracks())
    if (filter === "all" || filter === "podcasts") dispatch(fetchSavedShows())
    if (filter === "all" || filter === "artists") dispatch(fetchFollowedArtists())
  }, [filter, dispatch])

  const merged = useMemo(() => {
    const out = []
    if (filter === "all" || filter === "playlists") {
      playlists.forEach((p) => out.push(normalize(p, "playlist")))
    }
    if (filter === "all" || filter === "artists") {
      followedArtists.items.forEach((a) => out.push(normalize(a, "artist")))
    }
    if (filter === "all" || filter === "albums") {
      savedAlbums.items.forEach((a) => out.push(normalize(a, "album")))
    }
    if (filter === "all" || filter === "podcasts") {
      savedShows.items.forEach((s) => out.push(normalize(s, "show")))
    }
    if (filter === "all" || filter === "tracks") {
      savedTracks.items.forEach((t) => out.push(normalize(t, "track")))
    }
    return out
  }, [
    filter,
    playlists,
    followedArtists.items,
    savedAlbums.items,
    savedShows.items,
    savedTracks.items,
  ])

  const isLoading =
    playlistsLoading ||
    (filter === "all" &&
      (savedAlbums.loading ||
        savedTracks.loading ||
        savedShows.loading ||
        followedArtists.loading)) ||
    (filter === "albums" && savedAlbums.loading) ||
    (filter === "tracks" && savedTracks.loading) ||
    (filter === "podcasts" && savedShows.loading) ||
    (filter === "artists" && followedArtists.loading)

  const showEmpty = !isLoading && merged.length === 0

  const handleActivate = (item) => {
    if (!item?.uri) return
    if (item.kind === "track") {
      playTracks([item.uri])
    } else {
      playContext({
        type: item.kind,
        uri: item.uri,
        name: item.name,
        image: item.image,
      })
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your Library</h1>
        <button
          type="button"
          onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={view === "list" ? "Switch to grid view" : "Switch to list view"}
        >
          {view === "list" ? (
            <LayoutGrid className="h-4 w-4" />
          ) : (
            <List className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Filter chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.id
                ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-900/30"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {isLoading && merged.length === 0 && <LoadingState view={view} />}

      {showEmpty && <EmptyState filter={filter} />}

      {merged.length > 0 && view === "list" && (
        <ul className="flex flex-col">
          {merged.map((item) => (
            <ListRow key={`${item.kind}:${item.id}`} item={item} onActivate={handleActivate} />
          ))}
        </ul>
      )}

      {merged.length > 0 && view === "grid" && (
        <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
          {merged.map((item) => (
            <GridTile key={`${item.kind}:${item.id}`} item={item} onActivate={handleActivate} />
          ))}
        </div>
      )}
    </div>
  )
}

function ListRow({ item, onActivate }) {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onActivate(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onActivate(item)
        }
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
    >
      <div
        className={cn(
          "relative h-12 w-12 shrink-0 overflow-hidden bg-muted",
          item.kind === "artist" ? "rounded-full" : "rounded-md"
        )}
      >
        {item.image ? (
          <img src={item.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <KindIcon kind={item.kind} className="h-4 w-4 text-muted-foreground/70 absolute inset-0 m-auto" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
      </div>
      <LibraryItemMenu item={item} kind={item.kind} />
    </li>
  )
}

function GridTile({ item, onActivate }) {
  return (
    <button
      type="button"
      onClick={() => onActivate(item)}
      className="group flex flex-col items-start text-left"
    >
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden bg-muted shadow-md shadow-black/30",
          item.kind === "artist" ? "rounded-full" : "rounded-lg"
        )}
      >
        {item.image ? (
          <img src={item.image} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <KindIcon kind={item.kind} className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground/70" />
        )}
      </div>
      <p className="mt-2 line-clamp-1 w-full text-sm font-medium">{item.name}</p>
      <p className="line-clamp-1 w-full text-xs text-muted-foreground">{item.subtitle}</p>
    </button>
  )
}

function KindIcon({ kind, className }) {
  switch (kind) {
    case "track":
      return <Music2 className={className} />
    case "artist":
      return <User className={className} />
    case "album":
      return <Disc3 className={className} />
    case "show":
      return <Mic2 className={className} />
    default:
      return <Music2 className={className} />
  }
}

function LoadingState({ view }) {
  if (view === "grid") {
    return (
      <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-2 pt-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="h-12 w-12 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ filter }) {
  const label =
    filter === "all"
      ? "Your library is empty."
      : `No ${filter} yet.`
  return (
    <div className="mt-8 flex flex-col items-center gap-2 px-4 text-center">
      <Disc3 className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Save songs, follow artists, and create playlists in Spotify — they'll show up here.
      </p>
    </div>
  )
}
