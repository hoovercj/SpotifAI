import React, { useEffect, useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/Components/ui/skeleton"
import ScrollableRow from "../shell/ScrollableRow"
import GenreStationTile from "./GenreStationTile"
import GENRES from "./genres"
import MOODS from "./moods"
import { useStartSession } from "../player/useStartSession"
import {
  fetchRecentlyPlayed,
  fetchTopArtists,
  fetchTopTracks,
} from "../../store/librarySlice"
import { fetchRecentSessions } from "../../store/recentSessionsSlice"

function pickImage(item) {
  if (item?.album?.images?.[0]?.url) return item.album.images[0].url
  if (item?.images?.[0]?.url) return item.images[0].url
  return null
}

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return "Good night"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

// Deduplicate an array of items by URI, preserving first-seen order.
function uniqByUri(items) {
  const seen = new Set()
  const out = []
  for (const it of items) {
    if (!it?.uri || seen.has(it.uri)) continue
    seen.add(it.uri)
    out.push(it)
  }
  return out
}

/**
 * Home screen.
 *
 * Layout (top → bottom):
 *   1. Recent sessions row — cross-device "jump back in" tiles from
 *      the server-backed `recent_session` table. Only renders if the
 *      user has at least one prior session.
 *   2. Discover — recent Spotify plays, top artists, top tracks. Each
 *      tap starts a brand-new SpotifAI session seeded from the item.
 *   3. Radio — gradient tiles. Stations (genres) route to the genre
 *      detail page so the user can pick a specific AI station. Mood
 *      tiles start a mood session directly (there's no per-mood detail
 *      page — the mood itself is the seed).
 *   4. Playlists — the user's Spotify playlists, each starts a
 *      playlist-seeded session.
 *
 * Every interactive tile routes through `useStartSession` so the
 * loading / intro / tracks pipeline is consistent regardless of seed
 * type. The only exception is genre tiles, which navigate to /search
 * (a browse affordance, not a play action).
 */
export default function HomeTab() {
  const dispatch = useDispatch()
  const { start } = useStartSession()

  const profileName = useSelector((s) => s.user?.profile?.name)
  const playlists = useSelector((s) => s.spotifyPlaylists?.allPlaylists || [])
  const recentlyPlayed = useSelector((s) => s.library.recentlyPlayed)
  const topArtistsShort = useSelector((s) => s.library.topArtists.short_term)
  const topTracksLong = useSelector((s) => s.library.topTracks.long_term)
  const recentSessions = useSelector((s) => s.recentSessions.items)

  useEffect(() => {
    dispatch(fetchRecentlyPlayed())
    dispatch(fetchTopArtists("short_term"))
    dispatch(fetchTopTracks("long_term"))
    dispatch(fetchRecentSessions())
  }, [dispatch])

  const recentTracks = useMemo(
    () => uniqByUri(recentlyPlayed.items).slice(0, 18),
    [recentlyPlayed.items]
  )

  // --- session-start handlers ----------------------------------------
  // Each tap derives a seed shape the server orchestrator understands.
  // tuningOverride passes through name + image so NowPlayingBar can
  // paint the tuning state with the same artwork the tile showed.
  const startTrackSession = (track) => {
    if (!track?.id) return
    start(
      { type: "track", trackId: track.id },
      {
        tuningOverride: {
          name: track.name,
          image: pickImage(track),
        },
      }
    )
  }

  const startArtistSession = (artist) => {
    if (!artist?.id) return
    start(
      { type: "artist", artistId: artist.id },
      {
        tuningOverride: {
          name: `${artist.name} Radio`,
          image: pickImage(artist),
        },
      }
    )
  }

  const startMoodSession = (mood) => {
    start(
      { type: "mood", moodId: mood.id },
      {
        tuningOverride: {
          name: mood.name,
          gradient: [mood.from, mood.to],
        },
      }
    )
  }

  const startPlaylistSession = (pl) => {
    // Server accepts either spotifyUri or playlistId — sending the URI
    // matches what the Spotify API itself returns and is what the
    // existing recent_session rows store.
    if (!pl?.uri) return
    start(
      { type: "playlist", spotifyUri: pl.uri },
      {
        tuningOverride: {
          name: pl.name,
          image: pickImage(pl),
        },
      }
    )
  }

  const startRecentSession = (item) => {
    if (!item?.seed) return
    start(item.seed, {
      tuningOverride: {
        name: item.name,
        image: item.imageUrl,
      },
    })
  }

  const isFirstPaintEmpty =
    recentTracks.length === 0 &&
    topArtistsShort.items.length === 0 &&
    topTracksLong.items.length === 0 &&
    playlists.length === 0 &&
    recentSessions.length === 0

  return (
    <div className="flex flex-col gap-6 pt-4 pb-2">
      <header className="px-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {profileName ? `, ${profileName}` : ""}
        </h1>
      </header>

      {/* ===== Recent sessions (server-backed, cross-device) ===== */}
      {recentSessions.length > 0 && (
        <ScrollableRow
          title="Jump back into a SpotifAI session"
          subtitle="Picks up where you left off, on any device"
        >
          {recentSessions.map((item) => (
            <PosterTile
              key={item.seedKey}
              image={item.imageUrl}
              fallbackGradient={fallbackGradientFor(item.seed)}
              title={item.name}
              subtitle={seedSubtitle(item.seed)}
              onClick={() => startRecentSession(item)}
            />
          ))}
        </ScrollableRow>
      )}

      {/* ===== Discover (your own Spotify history) ===== */}
      {recentTracks.length > 0 && (
        <ScrollableRow title="Jump back in" subtitle="From your Spotify history">
          {recentTracks.map((track) => (
            <PosterTile
              key={track.uri}
              image={pickImage(track)}
              title={track.name}
              subtitle={
                Array.isArray(track.artists)
                  ? track.artists.map((a) => a.name).join(", ")
                  : ""
              }
              onClick={() => startTrackSession(track)}
            />
          ))}
        </ScrollableRow>
      )}

      {topArtistsShort.items.length > 0 && (
        <ScrollableRow
          title="Your top artists this month"
          subtitle="Tap to start an artist radio"
        >
          {topArtistsShort.items.map((artist) => (
            <PosterTile
              key={artist.uri}
              image={pickImage(artist)}
              title={artist.name}
              subtitle="Artist"
              rounded
              onClick={() => startArtistSession(artist)}
            />
          ))}
        </ScrollableRow>
      )}

      {topTracksLong.items.length > 0 && (
        <ScrollableRow
          title="Your top tracks of all time"
          subtitle="Tap to spin a session around this song"
        >
          {topTracksLong.items.map((track) => (
            <PosterTile
              key={track.uri}
              image={pickImage(track)}
              title={track.name}
              subtitle={
                Array.isArray(track.artists)
                  ? track.artists.map((a) => a.name).join(", ")
                  : ""
              }
              onClick={() => startTrackSession(track)}
            />
          ))}
        </ScrollableRow>
      )}

      {/* ===== Radio (gradient browse tiles) ===== */}
      <ScrollableRow title="Stations" subtitle="Browse by genre">
        {GENRES.map((g) => (
          // No onClick override — genre tiles route to /search where
          // the user can pick a specific AI station from the list.
          <GenreStationTile key={g.id} genre={g} />
        ))}
      </ScrollableRow>

      <ScrollableRow title="Moods & activities" subtitle="Browse by vibe">
        {MOODS.map((m) => (
          // Mood tiles start a session directly — there's no per-mood
          // detail screen to drill into, the mood *is* the seed.
          <GenreStationTile
            key={m.id}
            genre={m}
            onClick={() => startMoodSession(m)}
          />
        ))}
      </ScrollableRow>

      {/* ===== Your playlists ===== */}
      {playlists.length > 0 && (
        <ScrollableRow title="Your playlists">
          {playlists.map((pl) => (
            <PosterTile
              key={pl.uri || pl.id}
              image={pickImage(pl)}
              title={pl.name}
              subtitle={pl.owner?.display_name || "Playlist"}
              onClick={() => startPlaylistSession(pl)}
            />
          ))}
        </ScrollableRow>
      )}

      {/* Loading placeholder for first paint */}
      {isFirstPaintEmpty && (
        <ScrollableRow title="Loading your library">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex w-28 flex-col gap-2">
              <Skeleton className="aspect-square w-28 rounded-lg" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </ScrollableRow>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Tile components
// ---------------------------------------------------------------------

function PosterTile({
  image,
  title,
  subtitle,
  onClick,
  rounded,
  fallbackGradient,
}) {
  const showGradient = !image && fallbackGradient
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-28 flex-col items-start text-left"
    >
      <div
        className={cn(
          "relative aspect-square w-28 overflow-hidden bg-muted shadow-md shadow-black/40",
          rounded ? "rounded-full" : "rounded-lg"
        )}
        style={
          showGradient
            ? {
                backgroundImage: `linear-gradient(135deg, ${fallbackGradient[0]}, ${fallbackGradient[1]})`,
              }
            : undefined
        }
      >
        {image && (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
      </div>
      <p className="mt-1.5 line-clamp-1 w-full text-xs font-medium">{title}</p>
      {subtitle && (
        <p className="line-clamp-1 w-full text-[10px] text-muted-foreground">
          {subtitle}
        </p>
      )}
    </button>
  )
}

// Subtitle helper for recent session tiles — gives them a sense of "what
// kind of session this is" without needing to render a separate badge.
function seedSubtitle(seed) {
  if (!seed) return ""
  switch (seed.type) {
    case "station":
      return "AI Station"
    case "mood":
      return "Mood"
    case "track":
      return "Song radio"
    case "artist":
      return "Artist radio"
    case "playlist":
      return "Playlist"
    default:
      return "Session"
  }
}

// When a recent session has no cover art (mood/track/station seeds may
// arrive without one), fall back to a per-type gradient swatch so the
// row doesn't render gray squares.
function fallbackGradientFor(seed) {
  if (!seed) return ["#475569", "#1e293b"]
  switch (seed.type) {
    case "station":
      return ["#a855f7", "#ec4899"]
    case "mood":
      return ["#0ea5e9", "#6366f1"]
    case "track":
      return ["#f59e0b", "#dc2626"]
    case "artist":
      return ["#10b981", "#0d9488"]
    case "playlist":
      return ["#8b5cf6", "#1e40af"]
    default:
      return ["#475569", "#1e293b"]
  }
}
