/**
 * Lightweight localStorage-backed persistence for the player slice.
 *
 * Why this exists: the Spotify Web Playback SDK rehydrates the
 * currently-playing track on reconnect (so NowPlayingBar still shows
 * the song after a refresh), but our app-side state — the station/
 * playlist context, the active session tracks, and the chosen DJ —
 * lives only in Redux. Without persistence, a refresh leaves the bar
 * showing a track but "Playing from your library" and no DJ avatar.
 *
 * We persist a *minimal* snapshot:
 *   - currentSession      (seed, name, image, gradient, djId, tracks…)
 *   - currentContext      ("Playing from {name}")
 *   - currentDjId         (just the ID; the full persona is recovered
 *                          by looking it up in djs.allDjs once that
 *                          slice is loaded — persona objects carry
 *                          ~500KB base64 image data we should not be
 *                          stuffing into localStorage)
 *   - userSessionId       (so the server-side per-DJ chat history
 *                          stays continuous across page reloads — same
 *                          id, same chat-key, same conversation)
 *
 * We deliberately do NOT persist `currentTrack`, `positionMs`, or
 * `isPlaying`: those reflect the SDK's live state and would be stale
 * the moment the SDK reconnects.
 */

const STORAGE_KEY = 'spotifai:player:v1'
const SAVE_DEBOUNCE_MS = 500

function isBrowser() {
  return typeof window !== 'undefined' && !!window.localStorage
}

export function loadPersistedPlayer() {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (err) {
    console.warn('Failed to load persisted player state:', err)
    return null
  }
}

export function clearPersistedPlayer() {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('Failed to clear persisted player state:', err)
  }
}

/**
 * Subscribe to the store and persist (debounced) whenever the
 * snapshot fields change. Returns the unsubscribe handle in case the
 * caller wants to detach (e.g. tests).
 */
export function subscribePlayerPersistence(store) {
  if (!isBrowser()) return () => {}

  let lastJson = ''
  let timer = null

  const flush = (snapshot) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch (err) {
      // Quota errors, etc. — log and move on. Persistence is best-effort.
      console.warn('Failed to persist player state:', err)
    }
  }

  return store.subscribe(() => {
    const state = store.getState()
    // Until fetchDjs lands and PlayerProvider promotes the parked id
    // back into djs.currentDj, fall back to player.pendingRehydrateDjId
    // — otherwise the FIRST post-hydration dispatch would persist a
    // snapshot with currentDjId=null and we'd lose the host across the
    // refresh→fetchDjs window.
    const currentDjId =
      state.djs?.currentDj?.id ??
      state.player?.pendingRehydrateDjId ??
      null
    const snapshot = {
      currentSession: state.player?.currentSession ?? null,
      currentContext: state.player?.currentContext ?? null,
      currentDjId,
      userSessionId: state.userSession?.id ?? null,
    }
    const json = JSON.stringify(snapshot)
    if (json === lastJson) return
    lastJson = json
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => flush(snapshot), SAVE_DEBOUNCE_MS)
  })
}
