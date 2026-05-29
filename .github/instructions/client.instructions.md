---
applyTo: "client/**/*.{js,jsx,ts,tsx}"
---

# Client conventions

Active when editing under `client/`.

## State management
- **Redux Toolkit only** — `createSlice`, no hand-rolled action types. See [client/store/](../../client/store/).
- Async work goes in thunks. Thunks return `void` and dispatch their own actions; don't return data for components to consume.
- **Persistence is opt-in** via [client/store/persistPlayer.js](../../client/store/persistPlayer.js) and limited to a small subset of the player slice. Don't add new persisted fields without considering boot rehydration.

## Player + audio
- **`PlayerProvider` is the single owner** of the Spotify SDK, DJ overlay `<audio>`, volume ducking, Media Session, and WakeLock. See [client/Components/player/PlayerProvider.jsx](../../client/Components/player/PlayerProvider.jsx).
- Don't instantiate a second Spotify player anywhere else.
- New transport actions go through `usePlayer()` (re-exported as `useSpotifyPlayer`), not direct refs.
- `stopCurrentPlayback()` is what `useStartSession` calls to cleanly cut the old session before a new intro starts. Don't add separate stop logic.

## Images
- Always render via `<picture>` with the webp source + jpg fallback. See the helper in [client/lib/image.js](../../client/lib/image.js) and example usage in [client/Components/player/DjAvatarTile.jsx](../../client/Components/player/DjAvatarTile.jsx).
- Default size is `"thumb"`. Use `"full"` only for the Now Playing artwork.
- Bind to `dj?.details?.image` (object now, not a string).

## Telemetry
- Use the helpers in [client/lib/telemetry.js](../../client/lib/telemetry.js) (`track`, `trackException`). They no-op when telemetry is opted out or the connection string is unset.
- Don't bypass and call the App Insights SDK directly — the helpers handle opt-out + auth-user wiring.
- Don't add `track()` calls inside hot render paths. Tap action sites only.

## Accessibility
- All interactive elements have `aria-label` when the visible label is just an icon.
- Use semantic `<button>` for tap targets, `<NavLink>` for navigation. Don't `onClick` a `<div>`.
- Match the existing focus-ring conventions (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).

## Don't
- Don't add a new router. We use a single `BrowserRouter` in `client/index.jsx`.
- Don't introduce a CSS-in-JS library. Tailwind + the shadcn primitives in `client/Components/ui/` cover everything.
- Don't bring in a state-management alternative (zustand, jotai, etc.).
