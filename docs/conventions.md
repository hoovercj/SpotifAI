# Conventions

Code patterns we follow. These are decisions, not suggestions — match them when adding new code so the codebase stays consistent.

## Comments

- **Default to no comments.** The code already says what it does.
- Add a comment only when the *why* is non-obvious — a hidden constraint, a workaround, a subtle invariant, or behavior that would surprise a future reader.
- One short line is the target. Never multi-paragraph docstrings on something simple.
- Never reference the current task or fix in a comment ("added for X", "handles case Y"). That belongs in the PR description.
- Existing comments in the codebase are heavier than this — let them ride; don't rewrite. New code should follow the lighter convention.

## No over-engineering

- Don't add features, refactors, or "improvements" beyond what's asked.
- Don't create helpers or abstractions for a one-time operation.
- Don't add error handling, fallbacks, or validation for things that can't happen — trust internal code and framework guarantees. Validate at boundaries (user input, external APIs).
- Don't add feature flags or back-compat shims when you can just change the code.
- Don't add type annotations or JSDoc to code you didn't change.

## Express route shape

Every route returns JSON, including errors. Pattern:

```js
router.post("/something", async (req, res) => {
  if (!req.session?.accessToken) {
    return res.status(401).json({ error: "spotify_session_required" })
  }
  try {
    const result = await doTheThing(...)
    return res.json(result)
  } catch (err) {
    const status = err?.status || 500
    if (status >= 500) {
      logger.error({ err: err?.message, stack: err?.stack }, "route.failed")
    }
    return res.status(status).json({
      error: "short_code",
      message: err?.message || "Internal Server Error",
    })
  }
})
```

- Error response shape is always `{ error: "snake_case_code", message: "human readable" }`.
- 4xx errors are not logged at `error` level (only 5xx). 4xx is a client problem; flooding the server log doesn't help.
- Throwables from services should set `err.status` to bubble the right HTTP code.

## Logging

- **No `console.*` in `server/`** — use the Pino logger at `server/services/logger.js`. Test code and one-off scripts may use console freely.
- Structured fields, not interpolation. `logger.info({ djId, seedType }, 'session.start')`, not `logger.info('session.start: dj=...')`.
- Event names use dotted-namespace lowercase: `session.start`, `intro.cache.miss`, `spotify.login.success`. Match the App Insights custom event name when both exist.
- **Never log a raw email.** Pass it through `hashUserId()` from `server/services/utl/hashUserId.js` and log `userIdHash` instead. The DB rows still store email — that's the join key.
- Personal data that shouldn't go to logs at all: zip, lat, long, profile name, Spotify tokens, refresh tokens. Cookies are already redacted by the pino-http config.

## Telemetry events

Three styles:

```js
// Custom event — for "something interesting happened"
const { trackEvent } = require('./services/telemetry')
trackEvent('session.start', { seedType, djId }, { ms: Date.now() - t0 })

// Dependency wrapper — for "we called a third-party API"
const { withDependency } = require('./services/telemetry')
const res = await withDependency('gemini', 'tts.synthesize', { voiceId, textChars }, () => callGemini())

// Exception — for "an error worth recording even if we handled it"
const { trackException } = require('./services/telemetry')
trackException(err, { route: '/api/sessions/start' })
```

When you add a custom event, also log it at `info` (or `warn` if it's an unusual but-not-error condition) so the same data shows up in both Pino logs and App Insights.

## Redux slices

- Use `@reduxjs/toolkit` `createSlice` only — no hand-rolled action types.
- Selectors live alongside the slice or inline in components. Don't introduce a `selectors.js` per slice unless something is reused 3+ times.
- Persistence is opt-in via `client/store/persistPlayer.js` — only the player slice persists, and only a small subset of fields. Don't add new persistence without considering the boot rehydration path.
- Async thunks return `void` and dispatch their own actions. Don't return values for the component to consume; subscribe to the resulting state.

## Cache key versioning

We use **path-versioning** for the intro audio cache. The path itself encodes content versions:

```
intros/{personaVersion}_{promptVersion}/{seedKey}/{djId}.wav
```

When you edit `personas/coda.md`, `personaVersion('coda')` changes, every future write goes to a new path, and old blobs are naturally orphaned. Same with `prompts/*.md` (any change forks `promptVersion()`). **Never** add a manual invalidation step; rely on the versioning.

If you find yourself wanting to invalidate by hand, you've probably added something to the cache key that shouldn't be there.

## Image components

DJ portraits and station covers come from the server as `{ src, thumb?: {webp, jpg}, full?: {webp, jpg} }`. Render with `<picture>`:

```jsx
import { getImageSources } from "@/lib/image"
const s = getImageSources(dj?.details?.image, "thumb") // or "full"
return (
  <picture>
    {s.webp && <source srcSet={s.webp} type="image/webp" />}
    <img src={s.jpg || s.webp} alt="" loading="lazy" decoding="async" />
  </picture>
)
```

Default to `"thumb"` for tiles. Use `"full"` only for the Now Playing artwork.

## When changing these files, also update…

Quick file-to-doc map for the docs that should track code shape:

| Code | Doc to update |
|---|---|
| `server/db/**` (model added or shape changed) | [docs/architecture.md](architecture.md) Repository layout |
| `server/routes/**` (new route or response shape changes) | [docs/architecture.md](architecture.md) flow descriptions |
| `server/services/intros/**` or `services/storage/**` | [docs/architecture.md](architecture.md) + [docs/observability.md](observability.md) cache section |
| `server/services/telemetry.js` or a new `trackEvent` call | [docs/observability.md](observability.md) event reference |
| `.vscode/tasks.json` | [docs/local-development.md](local-development.md) tasks table |
| `infra/**` | [docs/architecture.md](architecture.md) System map + `azure.yaml` |
| `client/lib/telemetry.js` or `PrivacyPage` | [docs/observability.md](observability.md) opt-out section |
| Persona file shape or `loadPersonas` | [personas/README.md](../personas/README.md) |
| Prompt template structure or `loadPrompt` | [prompts/README.md](../prompts/README.md) |

If you're touching one of those files and *not* the matching doc, that should be a conscious choice (e.g. the doc still describes reality). Don't update docs reflexively when nothing material changed.
