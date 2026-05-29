import React, { useEffect, useState } from "react"
import { RefreshCw, X } from "lucide-react"

/**
 * Update-available toast.
 *
 * Listens for the `spotifai:sw-update-available` event dispatched by
 * registerSW.js when a new service worker is waiting. The user can
 * tap "Reload" to accept (registerSW listens for
 * `spotifai:sw-accept-update` and triggers `skipWaiting` →
 * controllerchange → page reload) or dismiss to keep using the
 * current version (the new SW will activate automatically the next
 * time every tab is closed and reopened).
 *
 * Mounted once in AppShell. Renders nothing until an event arrives.
 */
export default function ServiceWorkerUpdateToast() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onUpdate = () => setShow(true)
    window.addEventListener("spotifai:sw-update-available", onUpdate)
    return () => window.removeEventListener("spotifai:sw-update-available", onUpdate)
  }, [])

  if (!show) return null

  const accept = () => {
    window.dispatchEvent(new CustomEvent("spotifai:sw-accept-update"))
    // No need to flip `show`; registerSW reloads the page once the new
    // SW takes control, which unmounts everything.
  }
  const dismiss = () => setShow(false)

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-6"
    >
      <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-full border border-border/60 bg-card/95 px-3 py-2 text-sm shadow-lg shadow-black/40 backdrop-blur">
        <RefreshCw className="h-4 w-4 shrink-0 text-fuchsia-400" />
        <span className="flex-1 leading-tight">A new version is available.</span>
        <button
          type="button"
          onClick={accept}
          className="rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-fuchsia-900/40 hover:brightness-110"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss update prompt"
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
