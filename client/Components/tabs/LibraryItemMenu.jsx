import React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/Components/ui/dropdown-menu"
import { MoreVertical, Play, Plus } from "lucide-react"
import { useSpotifyPlayer } from "../player/useSpotifyPlayer"

/**
 * Ellipsis menu for any library item. The item shape varies (track, album,
 * playlist, artist, show) but we only need its `uri` + a flag indicating
 * whether it's a single track (queueable) or a context (playable).
 */
export default function LibraryItemMenu({ item, kind }) {
  const { playTracks, playContext, addToQueue } = useSpotifyPlayer()

  const isTrack = kind === "track"
  const handlePlay = (e) => {
    e.stopPropagation()
    if (!item?.uri) return
    if (isTrack) {
      playTracks([item.uri])
    } else {
      playContext({
        type: kind,
        uri: item.uri,
        name: item.name,
        image: pickImage(item),
      })
    }
  }
  const handleQueue = (e) => {
    e.stopPropagation()
    if (item?.uri && isTrack) addToQueue(item.uri)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          onClick={(e) => e.stopPropagation()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handlePlay}>
          <Play className="mr-2 h-4 w-4" />
          {isTrack ? "Play" : `Play ${kind}`}
        </DropdownMenuItem>
        {isTrack && (
          <DropdownMenuItem onSelect={handleQueue}>
            <Plus className="mr-2 h-4 w-4" />
            Add to queue
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function pickImage(item) {
  if (item?.album?.images?.[0]?.url) return item.album.images[0].url
  if (item?.images?.[0]?.url) return item.images[0].url
  return null
}
