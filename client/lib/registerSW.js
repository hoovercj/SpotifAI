/**
 * Service worker registration with a "prompt to refresh" UX.
 *
 * vite-plugin-pwa generates `/sw.js` at build time. We register it
 * here and, when a new version is available, dispatch a
 * `spotifai:sw-update-available` CustomEvent on `window`. The app
 * shell can listen for it and surface a toast asking the user to
 * reload — much safer than `skipWaiting` for an audio player where
 * a forced reload would interrupt playback mid-song.
 *
 * To accept the update from a UI handler:
 *   window.dispatchEvent(new CustomEvent('spotifai:sw-accept-update'))
 *
 * If the service worker file is missing (dev mode, build mis-config)
 * registration silently no-ops.
 */

export function registerServiceWorker() {
  if (typeof window === "undefined") return
  if (!("serviceWorker" in navigator)) return
  if (window.location.hostname === "localhost" && !navigator.serviceWorker.controller) {
    // Dev convenience: don't aggressively register on localhost unless
    // an SW is already active. Avoids picking up a stale production SW
    // when running `npm run dev` immediately after a `vite preview`.
    if (!import.meta?.env?.PROD) return
  }
  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      // Watch for new SW versions waiting to activate.
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            // A new version is ready but we're keeping the old one
            // active so playback doesn't break. Let the app prompt.
            window.dispatchEvent(
              new CustomEvent("spotifai:sw-update-available", {
                detail: { registration },
              })
            )
            window.addEventListener(
              "spotifai:sw-accept-update",
              () => {
                if (registration.waiting) {
                  registration.waiting.postMessage({ type: "SKIP_WAITING" })
                }
              },
              { once: true }
            )
          }
        })
      })

      // Auto-reload when the new SW takes control (after user accepts).
      let refreshing = false
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
    })
    .catch(() => {
      // Silent — SW absence shouldn't break the app.
    })
}
