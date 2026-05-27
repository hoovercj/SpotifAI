// Curated list of mood / activity tiles — the *non-style* axis of the
// browse experience. This is intentionally separate from ./genres.js so
// the two grids can coexist on Home and Search without diluting either
// concept. A Workout listener might want Pop *or* Rock *or* Hip-Hop today;
// forcing them to pick a genre first is the wrong question to ask.
//
// Tile shape is identical to GENRES (`{ id, name, from, to }`) so the
// same GenreStationTile component renders both. The tile routes to
// /search?q=<name.toLowerCase()> — Spotify's search will pick up
// "workout" / "focus" / "party" etc. and surface relevant playlists.
//
// AI Stations note: moods are NOT today wired into
// `server/services/aiStations/catalog.js`. The catalog is keyed by
// musical genre; moods are a search-and-discovery affordance only. If we
// later want mood-themed AI stations ("Workout Hits with M-Quake"), we'd
// extend the catalog to accept a mood axis — they don't need to share
// keys with this file.
//
// Lo-fi / ambient is deliberately excluded — those listeners reach for
// uninterrupted background audio and would resent the DJ chatter that
// makes the rest of SpotifAI tick.
const MOODS = [
  // High-energy / activity
  { id: "workout", name: "Workout", from: "#dc2626", to: "#f97316" },
  { id: "party", name: "Party", from: "#f472b6", to: "#9333ea" },
  { id: "drive", name: "Drive", from: "#ea580c", to: "#7c2d12" },

  // Heads-down / atmospheric
  { id: "focus", name: "Focus", from: "#1e40af", to: "#0d9488" },
  { id: "chill", name: "Chill", from: "#67e8f9", to: "#6366f1" },
  { id: "rainy", name: "Rainy Day", from: "#94a3b8", to: "#475569" },
  { id: "sleep", name: "Sleep", from: "#312e81", to: "#0f172a" },

  // Emotional weather
  { id: "feelgood", name: "Feel Good", from: "#fde047", to: "#f97316" },
  { id: "romance", name: "Romance", from: "#f43f5e", to: "#9f1239" },
  { id: "sad", name: "Sad", from: "#475569", to: "#3730a3" },

  // Daypart / era
  { id: "morning", name: "Morning", from: "#fda4af", to: "#fbbf24" },
  { id: "throwback", name: "Throwback", from: "#fbbf24", to: "#92400e" },
]

export default MOODS
