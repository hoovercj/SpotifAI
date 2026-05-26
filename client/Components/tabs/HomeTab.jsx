import React, { useEffect, useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/Components/ui/skeleton"
import ScrollableRow from "../shell/ScrollableRow"
import GenreStationTile from "./GenreStationTile"
import GENRES from "./genres"
import { useSpotifyPlayer } from "../player/useSpotifyPlayer"
import {
  fetchRecentlyPlayed,
  fetchTopArtists,
  fetchTopTracks,
} from "../../store/librarySlice"

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

export default function HomeTab() {
  const dispatch = useDispatch()
  const { playTracks, playContext } = useSpotifyPlayer()

  const profileName = useSelector((s) => s.user?.profile?.name)
  const playlists = useSelector((s) => s.stations?.allStations || [])
  const recentlyPlayed = useSelector((s) => s.library.recentlyPlayed)
  const topArtistsShort = useSelector((s) => s.library.topArtists.short_term)
  const topTracksLong = useSelector((s) => s.library.topTracks.long_term)

  useEffect(() => {
    dispatch(fetchRecentlyPlayed())
    dispatch(fetchTopArtists("short_term"))
    dispatch(fetchTopTracks("long_term"))
  }, [dispatch])

  const recentTracks = useMemo(
    () => uniqByUri(recentlyPlayed.items).slice(0, 18),
    [recentlyPlayed.items]
  )
  const quickTiles = recentTracks.slice(0, 6)

  const playTrack = (track) => {
    if (track?.uri) playTracks([track.uri])
  }
  const playArtist = (artist) => {
    if (artist?.uri)
      playContext({
        type: "artist",
        uri: artist.uri,
        name: artist.name,
        image: pickImage(artist),
      })
  }
  const playPlaylist = (pl) => {
    if (pl?.uri)
      playContext({
        type: "playlist",
        uri: pl.uri,
        name: pl.name,
        image: pickImage(pl),
      })
  }

  return (
    <div className="flex flex-col gap-6 pt-4 pb-2">
      <header className="px-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {profileName ? `, ${profileName}` : ""}
        </h1>
      </header>

      {/* Quick grid */}
      {(quickTiles.length > 0 || recentlyPlayed.loading) && (
        <section className="grid grid-cols-2 gap-2 px-4">
          {quickTiles.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))
            : quickTiles.map((track) => (
                <button
                  key={track.uri}
                  type="button"
                  onClick={() => playTrack(track)}
                  className="group flex h-14 items-center gap-2 overflow-hidden rounded-lg bg-muted/40 pr-2 text-left transition-colors hover:bg-muted"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden bg-muted">
                    {pickImage(track) && (
                      <img
                        src={pickImage(track)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <span className="line-clamp-2 flex-1 text-xs font-medium">
                    {track.name}
                  </span>
                </button>
              ))}
        </section>
      )}

      {/* Jump back in */}
      {recentTracks.length > 0 && (
        <ScrollableRow title="Jump back in">
          {recentTracks.slice(6).map((track) => (
            <PosterTile
              key={track.uri}
              image={pickImage(track)}
              title={track.name}
              subtitle={
                Array.isArray(track.artists)
                  ? track.artists.map((a) => a.name).join(", ")
                  : ""
              }
              onClick={() => playTrack(track)}
            />
          ))}
        </ScrollableRow>
      )}

      {/* Top artists this month */}
      {topArtistsShort.items.length > 0 && (
        <ScrollableRow
          title="Your top artists this month"
          subtitle="Based on your Spotify listening"
        >
          {topArtistsShort.items.map((artist) => (
            <PosterTile
              key={artist.uri}
              image={pickImage(artist)}
              title={artist.name}
              subtitle="Artist"
              rounded
              onClick={() => playArtist(artist)}
            />
          ))}
        </ScrollableRow>
      )}

      {/* Top tracks all time */}
      {topTracksLong.items.length > 0 && (
        <ScrollableRow
          title="Your top tracks of all time"
          subtitle="Long-term Spotify favorites"
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
              onClick={() => playTrack(track)}
            />
          ))}
        </ScrollableRow>
      )}

      {/* Stations (genres) */}
      <ScrollableRow title="Stations" subtitle="Browse by genre">
        {GENRES.map((g) => (
          <GenreStationTile key={g.id} genre={g} />
        ))}
      </ScrollableRow>

      {/* Your playlists */}
      {playlists.length > 0 && (
        <ScrollableRow title="Your playlists">
          {playlists.map((pl) => (
            <PosterTile
              key={pl.uri || pl.id}
              image={pickImage(pl)}
              title={pl.name}
              subtitle={pl.owner?.display_name || "Playlist"}
              onClick={() => playPlaylist(pl)}
            />
          ))}
        </ScrollableRow>
      )}

      {/* Loading placeholder for first paint */}
      {recentTracks.length === 0 &&
        topArtistsShort.items.length === 0 &&
        topTracksLong.items.length === 0 &&
        playlists.length === 0 && (
          <ScrollableRow title="Loading your library">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex w-36 flex-col gap-2">
                <Skeleton className="aspect-square w-36 rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </ScrollableRow>
        )}
    </div>
  )
}

function PosterTile({ image, title, subtitle, onClick, rounded }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-36 flex-col items-start text-left"
    >
      <div
        className={cn(
          "relative aspect-square w-36 overflow-hidden bg-muted shadow-md shadow-black/40",
          rounded ? "rounded-full" : "rounded-lg"
        )}
      >
        {image && (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
      </div>
      <p className="mt-2 line-clamp-1 w-full text-sm font-medium">{title}</p>
      {subtitle && (
        <p className="line-clamp-1 w-full text-xs text-muted-foreground">
          {subtitle}
        </p>
      )}
    </button>
  )
}
