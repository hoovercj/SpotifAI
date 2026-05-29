# Observability

How we see what's happening in production, and what to do when something looks wrong.

## What gets collected

| Layer | Stack | Sink |
|---|---|---|
| Server logs | Pino → stdout (JSON in prod, pretty in dev), pino-http for per-request | App Service container logs → Log Analytics |
| Server traces + dependencies | `applicationinsights` Node SDK auto-collects Express, outbound HTTP, Postgres | App Insights |
| Server custom events | `trackEvent` from `server/services/telemetry.js` | App Insights |
| Client traces + page views | `@microsoft/applicationinsights-web` with auto route tracking + ajax | App Insights |
| Client errors | Unhandled exceptions + manual `trackException` | App Insights |

All four feed the same App Insights resource, which is itself workspace-based on the existing Log Analytics workspace (so a single Kusto query can join across server + client).

## Configuration

Single env var lights everything up: `APPLICATIONINSIGHTS_CONNECTION_STRING`.

- **Server**: read by `server/services/telemetry.js`. Required to be loaded **first** in `server/index.js` so the SDK can hook all subsequent requires.
- **Client**: forwarded from server env to the Vite build as `VITE_APPINSIGHTS_CONNECTION_STRING` and string-replaced at compile time. Run-time override possible via `window.__APPINSIGHTS_CONNECTION_STRING__` if we ever want per-env injection without rebuild.

Local dev: leave it unset. Both SDKs no-op silently.

## What we collect — privacy stance

See [docs/conventions.md](conventions.md#logging) for the per-developer rules. Short version:

- **Never the raw email.** Always `hashUserId(email)` → 16 hex chars (HMAC-SHA256 with `SESSION_SECRET`). Used as the App Insights `authUserId` so cross-device telemetry collapses onto one user without anyone outside our DB ever seeing the address.
- **Never Spotify access/refresh tokens.** Session cookies only.
- **No profile data** (zip, lat, long, name) in logs or events.
- **URL query strings stripped** before send by a client-side telemetry initializer (`client/lib/telemetry.js`). Path segments like `/jobs/{id}` are collapsed to placeholders so dashboards group cleanly.
- **User-controllable opt-out**: `localStorage.spotifai_telemetry = "off"`, surfaced as a toggle in the in-app `/privacy` page. When opted-out, `initTelemetry()` returns null and no client events are sent.

## Custom events we emit

| Event | Source | Dimensions | Measurements |
|---|---|---|---|
| `spotify.login.success` | `server/routes/spotify.js` | `product`, `userIdHash` | — |
| `session.start` | `server/routes/sessions.js` | `seedType`, `djId`, `ready`, `introCached`, `introOmitted` | `ms` |
| `session.refill.start` | `server/services/sessions/index.js` | `seedType`, `excludeCount` | — |
| `session.refill.end` | same | `seedType`, `success`, `error?` | `ms`, `tracks` |
| `intro.cache.hit` | `server/services/intros/getOrGenerateIntro.js` | `seedKey`, `djId`, `personaSlug` | — |
| `intro.cache.miss` | same | same | — |
| `intro.generated` | same | same | `ms`, `bytes` |
| `intro.played` | `server/routes/sessions.js` `/intro-played` | `seedKey`, `djId` | — |
| `llm.invoke` | `server/services/llm/gemini.js` | `model`, `sessionId` | `inputChars`, `outputChars` |
| `tts.synthesize` | `server/services/tts/gemini.js` | `model`, `voiceId` | `textChars`, `wavBytes` |
| `station.tracks.generated` | `server/services/aiStations/generateStationTracks.js` | `genreId`, `stationId` | `ms`, `candidates`, `resolved` |

Plus dependency events (auto-pulled from `withDependency`):

| Dependency | Target | Source |
|---|---|---|
| `llm.invoke` | `gemini` | LLM provider |
| `tts.synthesize` | `gemini` | TTS provider |
| `spotify.search.batch` | `spotify` | station track generation |

## Run-book Kusto queries

Paste these into App Insights → Logs.

### Recent 5xx by route

```kql
requests
| where timestamp > ago(1h) and resultCode startswith "5"
| project timestamp, name, resultCode, duration, customDimensions.requestId, customDimensions.userIdHash
| order by timestamp desc
```

### Slowest LLM calls in the last 24h

```kql
dependencies
| where timestamp > ago(24h) and target == "gemini" and name == "llm.invoke"
| summarize p50=percentile(duration, 50), p95=percentile(duration, 95), p99=percentile(duration, 99), n=count() by tostring(customDimensions.model)
```

### Slowest TTS synth + cost-by-character-count

```kql
customEvents
| where name == "tts.synthesize" and timestamp > ago(7d)
| extend chars = todouble(customMeasurements.textChars)
| summarize totalChars=sum(chars), calls=count(), p95ms=percentile(todouble(customMeasurements.ms), 95) by bin(timestamp, 1d)
| order by timestamp asc
```

### Cache hit-rate over the last hour

```kql
customEvents
| where timestamp > ago(1h) and name startswith "intro.cache."
| summarize n=count() by name
| extend total = toscalar(customEvents | where timestamp > ago(1h) and name startswith "intro.cache." | count)
| extend pct = todouble(n) / todouble(total) * 100
```

### Sessions started per hour, by seed type

```kql
customEvents
| where timestamp > ago(24h) and name == "session.start"
| summarize count() by bin(timestamp, 1h), tostring(customDimensions.seedType)
| render timechart
```

### Find a user's recent activity (you have their email)

```kql
// Compute the hash matching server/services/utl/hashUserId.js externally
// (HMAC-SHA256 of lowercased trimmed email with SESSION_SECRET, first 16 hex chars)
let target = "abcdef0123456789";
union customEvents, requests, exceptions, dependencies
| where timestamp > ago(24h)
| where customDimensions.userIdHash == target
| project timestamp, itemType, name, resultCode = coalesce(resultCode, ""), duration = coalesce(duration, 0.0)
| order by timestamp desc
| take 200
```

### Refresh-token loops (auth flapping)

```kql
customEvents
| where timestamp > ago(1h) and name == "spotify.login.success"
| summarize logins=count() by tostring(customDimensions.userIdHash)
| where logins >= 5
| order by logins desc
```

## Local debugging

- `LOG_LEVEL=debug npm run dev:api` shows all structured logs including health-check pings and pre-debug-level events.
- The pino-pretty transport is active automatically in dev (colorized, time-prefixed).
- App Insights output won't appear locally unless you set `APPLICATIONINSIGHTS_CONNECTION_STRING`. If you want to test the client SDK locally, set `VITE_APPINSIGHTS_CONNECTION_STRING` too and rebuild.

## When something breaks in prod

Default starting point: <https://portal.azure.com> → the App Insights resource → **Live Metrics**. You'll see real-time RPS, failure rate, response time, dependency calls.

If a user reports a problem with an email in hand:

1. Compute the hash (HMAC-SHA256 of `email.toLowerCase().trim()` with `SESSION_SECRET`, first 16 hex chars).
2. Run the "Find a user's recent activity" Kusto query above.
3. Cross-reference `requestId` from any failed request to find the full trace.

If a query takes forever, the issue is usually one of:

- Spotify search rate limit → look for `spotify.search.batch` with `customDimensions.rateLimited429s > 0`.
- Gemini quota → look for `dependencies | where target == "gemini" and success == false`.
- Postgres slow query → auto-collected by App Insights; filter on `dependencies | where type == "postgresql"`.

## Future work intentionally not done yet

- **A starter workbook (dashboard) committed as Bicep.** Easier to build it in the portal after a week of dogfooding, then export. See [infra/modules/appInsights.bicep](../infra/modules/appInsights.bicep) — currently just provisions the resource.
- **Client-side `trackException` for axios failures.** Currently relies on the SDK's auto-collected ajax errors. If we ever care about the surrounding component state, add a response interceptor in `client/lib/telemetry.js`.
- **Sampling.** We're below the free tier daily cap so we ingest everything. Revisit if monthly cost goes over $20.
