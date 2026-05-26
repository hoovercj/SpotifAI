// Thin re-export so callers can `import { useSpotifyPlayer } from
// '@/Components/player/useSpotifyPlayer'`. The actual context lives in
// PlayerProvider.jsx so that the SDK instance and the imperative API share
// the same module-private refs.
export { usePlayer as useSpotifyPlayer } from "./PlayerProvider"
