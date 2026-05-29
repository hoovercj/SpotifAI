import "./styles/globals.css"

import React from "react"
import { createRoot } from "react-dom/client"
import App from "./Components/App"
import { Provider } from "react-redux"
import store from "./store"
import { BrowserRouter } from "react-router-dom"
import { initTelemetry } from "./lib/telemetry"
import { registerServiceWorker } from "./lib/registerSW"

// Bootstrap App Insights as early as possible so initial page view +
// autocollected ajax events all flow up. No-ops when the connection
// string env var is unset (local dev with no Azure).
initTelemetry()

const root = createRoot(document.querySelector("#root"))

root.render(
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>
)

// Register the service worker after first paint so it doesn't compete
// with the React boot for main-thread time. Skipped in dev (vite-pwa
// auto-disables in serve mode unless devOptions.enabled is true).
if (typeof window !== "undefined") {
  if (document.readyState === "complete") {
    registerServiceWorker()
  } else {
    window.addEventListener("load", registerServiceWorker, { once: true })
  }
}
