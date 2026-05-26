// Curated list of genres used by the Home "Stations" row and the Search
// "Browse all" grid. Each tile has its own gradient to make the grid feel
// visual rather than text-heavy.
//
// The `query` is appended to the Spotify search endpoint as
// `genre:"<name>" type=playlist` to surface relevant playlists.
const GENRES = [
  { id: "pop", name: "Pop", from: "#ec4899", to: "#a855f7" },
  { id: "rock", name: "Rock", from: "#ef4444", to: "#7c3aed" },
  { id: "hiphop", name: "Hip-Hop", from: "#f59e0b", to: "#dc2626" },
  { id: "rnb", name: "R&B", from: "#a855f7", to: "#2563eb" },
  { id: "indie", name: "Indie", from: "#14b8a6", to: "#3b82f6" },
  { id: "electronic", name: "Electronic", from: "#06b6d4", to: "#6366f1" },
  { id: "jazz", name: "Jazz", from: "#eab308", to: "#dc2626" },
  { id: "classical", name: "Classical", from: "#a3a3a3", to: "#0ea5e9" },
  { id: "country", name: "Country", from: "#d97706", to: "#16a34a" },
  { id: "latin", name: "Latin", from: "#dc2626", to: "#facc15" },
  { id: "kpop", name: "K-Pop", from: "#ec4899", to: "#22d3ee" },
  { id: "metal", name: "Metal", from: "#1f2937", to: "#7c3aed" },
]

export default GENRES
