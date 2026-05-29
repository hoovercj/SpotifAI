---
applyTo: "server/**/*.js"
---

# Server conventions

Active when editing under `server/`.

## Express routes
- Pattern + error shape: see [docs/conventions.md](../../docs/conventions.md#express-route-shape). Always JSON `{ error, message }`. 4xx is `warn`, 5xx is `error`.
- Auth gate: `if (!req.session?.accessToken) return res.status(401).json({ error: "spotify_session_required" })`. Use `ensureFreshAccessToken(req)` from `server/routes/utl/` when the route makes Spotify calls.
- Don't add new middleware in route files. Cross-cutting middleware belongs in [server/app.js](../../server/app.js).

## Logging
- **No `console.*`** — use Pino from [server/services/logger.js](../../server/services/logger.js).
- **No raw emails** in log fields. Use `hashUserId(email)` from [server/services/utl/hashUserId.js](../../server/services/utl/hashUserId.js); the key is `userIdHash`.
- Structured fields, lowercase dotted event names: `logger.info({ userIdHash, seedKey, ms }, 'session.start')`.

## Telemetry
- `trackEvent(name, props, measurements)` for "interesting thing happened".
- `withDependency(target, name, props, fn)` for third-party API calls (Gemini, Spotify search). Auto-records duration + success.
- `trackException(err, props)` for caught-but-noteworthy errors.
- See [docs/observability.md](../../docs/observability.md) for the event catalog and naming conventions.

## Sequelize
- Models live in [server/db/](../../server/db/) — one file per model + `index.js` for associations.
- `sync({ alter: true })` runs on boot. Adding a new model = `CREATE TABLE`. Touching a column type can emit noisy ALTER chains; eyeball the SQL in dev.
- Composite primary keys are supported and work — see [server/db/UserIntroPlayed.js](../../server/db/UserIntroPlayed.js).
- Don't migrate to a migration tool yet. If we ever do, that's a coordinated change, not a one-PR refactor.

## Intro audio cache
- The blob path is the cache key:
  `intros/{personaVersion}_{promptVersion}/{seedKey}/{djId}.wav` — see [server/services/intros/introCacheKey.js](../../server/services/intros/introCacheKey.js).
- Use `getOrGenerateIntro({ seedKey, djId, personaSlug, generate })` from [server/services/intros/getOrGenerateIntro.js](../../server/services/intros/getOrGenerateIntro.js) — never call the LLM + TTS directly from a route.
- The generate callback returns `{ wavBuffer, text }`. The wrapper handles cache check + upload + telemetry.
- Don't add a manual cache-bust. Edit the persona or prompt and the version hash will fork the cache naturally.

## Blob storage
- Always go through `server/services/storage/blobStore.js` — it adapts to Azure in prod and local disk in dev.
- The local adapter writes under `runtime/audio/` and returns `/audio/<flattened-path>` URLs.

## Don't
- Don't add a new logger. Pino root + per-request children via pino-http is the whole story.
- Don't pull in `morgan`. Pino-http replaces volleyball and morgan-style needs.
- Don't bypass `services/telemetry.js` and require `applicationinsights` directly. Use the facade.
- Don't add a custom auth middleware. The Express session cookie is the source of truth.
