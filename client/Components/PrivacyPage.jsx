import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/Components/ui/button"
import {
  isTelemetryOptedOut,
  setTelemetryOptOut,
} from "@/lib/telemetry"

/**
 * Privacy page.
 *
 * - Plain-language summary of what we collect, why, and where it goes.
 * - Toggle that flips the localStorage opt-out flag consumed by
 *   client/lib/telemetry.js. Reload required to take effect because
 *   App Insights is bootstrapped at app start; we tell the user that
 *   explicitly and offer a reload button.
 *
 * Linked from the account menu so it's reachable from inside the app
 * without forcing a separate marketing site.
 */
export default function PrivacyPage() {
  const [optedOut, setOptedOut] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)

  useEffect(() => {
    setOptedOut(isTelemetryOptedOut())
  }, [])

  const handleToggle = () => {
    const next = !optedOut
    setTelemetryOptOut(next)
    setOptedOut(next)
    setNeedsReload(true)
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8 text-foreground">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/home"
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back to home"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      </div>

      <section className="space-y-4 text-sm text-muted-foreground">
        <p>
          We use Spotify's API to play your music and Google's Gemini API to
          generate DJ scripts and voice intros. We record a small amount of
          telemetry so we can debug crashes and understand which features get
          used.
        </p>

        <h2 className="mt-6 text-base font-semibold text-foreground">
          What we collect
        </h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Spotify account email</strong>
            — stored server-side so you can log in. We never send the plain
            email to our analytics pipeline; we hash it first so logs cannot
            be reversed back to you.
          </li>
          <li>
            <strong className="text-foreground">Coarse location from your IP</strong>
            — used at request time to fetch local weather and headlines for
            the DJ. We never store the raw IP or precise coordinates; only
            the derived city/region/country is forwarded to the geocoder and
            the per-request location is cached in memory by IP for a few hours.
          </li>
          <li>
            <strong className="text-foreground">Listening behavior</strong>
            — which station, mood, or seed you started, which DJ you picked,
            and whether the intro was a cache hit. Used to improve
            recommendations and make the cache smarter.
          </li>
          <li>
            <strong className="text-foreground">Crashes &amp; errors</strong>
            — JavaScript exceptions and slow API calls. Used to fix bugs.
          </li>
          <li>
            <strong className="text-foreground">Anonymous usage analytics</strong>
            — page views and feature usage. URLs in our analytics have query
            strings (like search terms) stripped client-side before they're
            sent.
          </li>
        </ul>

        <h2 className="mt-6 text-base font-semibold text-foreground">
          What we do <em>not</em> collect
        </h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your Spotify access or refresh tokens never leave the server session cookie.</li>
          <li>We never store the audio you generate. Cached intros are keyed by station + DJ, not by you.</li>
          <li>We don't share data with third parties for marketing.</li>
        </ul>

        <h2 className="mt-6 text-base font-semibold text-foreground">
          Where it goes
        </h2>
        <p>
          Everything runs in Azure (App Service for the app, PostgreSQL for
          user data, Blob Storage for generated audio, Application Insights
          for telemetry). Music streams directly from Spotify.
        </p>

        <h2 className="mt-6 text-base font-semibold text-foreground">
          Opting out of analytics
        </h2>
        <p>
          You can turn off the client-side analytics. The app will still work
          — error reports and listening behavior just won't be sent. Your
          choice is stored locally per device.
        </p>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-card/60 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Send anonymous analytics
            </p>
            <p className="text-xs">
              Helps us debug crashes and improve the app.
            </p>
          </div>
          <Button
            type="button"
            variant={optedOut ? "outline" : "default"}
            onClick={handleToggle}
          >
            {optedOut ? "Currently off — turn on" : "On — turn off"}
          </Button>
        </div>
        {needsReload && (
          <p className="text-xs text-fuchsia-300">
            Your choice will take effect after the next page reload.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="underline underline-offset-2"
            >
              Reload now
            </button>
            .
          </p>
        )}

        <p className="mt-8 text-xs">
          Questions? Open an issue at{" "}
          <a
            href="https://github.com/hoovercj/SpotifAI/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            github.com/hoovercj/SpotifAI
          </a>
          .
        </p>
      </section>
    </div>
  )
}
