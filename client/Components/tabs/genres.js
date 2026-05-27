// Curated list of musical-style genres used by the Home "Stations" row and
// the Search "Browse all" grid. Each tile has its own gradient to make the
// grid feel visual rather than text-heavy.
//
// This list is the *musical style* axis. The non-style axis (Workout, Focus,
// Party, Sleep, ...) lives in ./moods.js and is rendered as a parallel row
// so users aren't forced to pick "Pop" when what they actually want is
// "music to study to".
//
// Tapping a tile routes to /search?q=<name.toLowerCase()> (see
// GenreStationTile.jsx), so adding a row here is enough — no other wiring
// is required for the search surface.
//
// Note for AI Stations: only the subset that also appears in
// `server/services/aiStations/catalog.js` (today: pop, rock) has DJ-led
// stations. Adding a genre here does NOT automatically create AI stations
// for it; the catalog has to opt each genre in explicitly.
//
// Ordering: clustered loosely by sonic neighborhood so adjacent tiles
// share a vibe.
const GENRES = [
  // Modern pop cluster
  { id: "pop", name: "Pop", from: "#ec4899", to: "#a855f7" },
  { id: "rock", name: "Rock", from: "#ef4444", to: "#7c3aed" },
  { id: "hiphop", name: "Hip-Hop", from: "#f59e0b", to: "#dc2626" },
  { id: "rnb", name: "R&B", from: "#a855f7", to: "#2563eb" },
  { id: "afrobeats", name: "Afrobeats", from: "#f97316", to: "#c026d3" },

  // Alternative / left-of-center cluster
  { id: "indie", name: "Indie", from: "#14b8a6", to: "#3b82f6" },
  { id: "electronic", name: "Electronic", from: "#06b6d4", to: "#6366f1" },
  { id: "folk", name: "Folk", from: "#d4a574", to: "#15803d" },

  // Heritage / theatrical cluster
  { id: "jazz", name: "Jazz", from: "#eab308", to: "#dc2626" },
  { id: "classical", name: "Classical", from: "#a3a3a3", to: "#0ea5e9" },
  { id: "stagescreen", name: "Stage & Screen", from: "#581c87", to: "#fbbf24" },

  // Americana cluster
  { id: "country", name: "Country", from: "#d97706", to: "#16a34a" },
  { id: "gospel", name: "Gospel", from: "#1e3a8a", to: "#fbbf24" },

  // Global rhythm cluster
  { id: "latin", name: "Latin", from: "#dc2626", to: "#facc15" },
  { id: "reggae", name: "Reggae", from: "#16a34a", to: "#dc2626" },

  // East Asian pop-culture cluster
  { id: "kpop", name: "K-Pop", from: "#ec4899", to: "#22d3ee" },
  { id: "anime", name: "Anime", from: "#f472b6", to: "#3b82f6" },

  // Heavy
  { id: "metal", name: "Metal", from: "#1f2937", to: "#7c3aed" },

  // Seasonal — appended last so it only crowds the grid when in season
  { id: "holiday", name: "Holiday", from: "#0891b2", to: "#b91c1c" },
]

export default GENRES
