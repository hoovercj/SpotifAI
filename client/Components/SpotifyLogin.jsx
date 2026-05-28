import React, { useMemo } from "react"
import { Sparkles, Music2, Mic2, Radio as RadioIcon, MapPin } from "lucide-react"
import { Button } from "@/Components/ui/button"

// Preserved from the original webpack/DotenvWebpack-era config — these are
// injected at build time by vite.config.mjs's `define` block.
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "user-library-modify",
  "user-top-read",
  "user-read-recently-played",
  "user-follow-read",
  "user-follow-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-currently-playing",
].join(" ")

function buildAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID || "",
    response_type: "code",
    redirect_uri: REDIRECT_URI || "",
    scope: SCOPES,
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

const FEATURES = [
  {
    icon: Music2,
    title: "Your music, your way",
    body: "Stream playlists, albums, and saved tracks straight from your Spotify library.",
  },
  {
    icon: Mic2,
    title: "An AI DJ on the air",
    body: "Pick a host whose voice fits the vibe — they introduce tracks, weather, and headlines.",
  },
  {
    icon: RadioIcon,
    title: "Live-radio feel",
    body: "DJ banter is woven between tracks with smart audio ducking, so the music stays front-and-center.",
  },
  {
    icon: MapPin,
    title: "Hyper-local touches",
    body: "Localized weather, transit, and news segments based on your profile zip.",
  },
]

export default function SpotifyLogin() {
  const authUrl = useMemo(buildAuthUrl, [])
  return (
    <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/70 p-6 shadow-xl shadow-black/40 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-fuchsia-900/40">
          <Sparkles className="h-5 w-5 text-foreground" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Spotif
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              AI
            </span>
          </h1>
          <p className="text-xs text-muted-foreground">AI radio for your Spotify library</p>
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-400" />
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <Button asChild size="lg" className="mt-7 w-full">
        <a href={authUrl}>Continue with Spotify</a>
      </Button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        Spotify Premium required to stream music in the browser. We only see scopes we ask for.
      </p>
    </div>
  )
}
