# Local development

## Prereqs

- Node 22 (use `.nvmrc`).
- Docker (for the Postgres container) — the VS Code task spins it up automatically.
- A `.env` file at the repo root with at minimum:
  ```
  GOOGLE_API_KEY=...
  SPOTIFY_CLIENT_ID=...
  SPOTIFY_CLIENT_SECRET=...
  SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/spotifai
  SESSION_SECRET=any-long-random-string
  ```
  Optional: `APPLICATIONINSIGHTS_CONNECTION_STRING` for telemetry, `AZURE_STORAGE_ACCOUNT` for shared blob cache (otherwise `LocalDiskBlobAdapter` writes audio to `runtime/audio/`).
- Once after `npm install`: `npm run build:pwa-icons` (generates the manifest icon set into `public/icons/`) and `npm run optimize:images` (pre-sizes the DJ portraits + station covers).

## VS Code tasks (the right way to start)

| Task name | What it does |
|---|---|
| **Start Dev** *(default build)* | Brings Postgres up, runs `webpack --watch` + `nodemon`, launches a debug Chrome on `:9222`. Single hotkey: `Ctrl+Shift+B`. |
| **Dev: Server (npm)** | Just the dev server side, no Chrome. |
| **Postgres: Up (Docker)** | Creates the `spotifai-pg` container if missing; idempotent. Polls `pg_isready`. |
| **Postgres: Stop (Docker)** | Stops the container, keeps the volume. |
| **Postgres: Reset (Docker, destroys data)** | Drops the container AND the data volume. Destructive. |
| **Docker: Force Restart** | Kills all Docker processes + shuts down WSL + relaunches Docker Desktop. Use when the tray icon is hung. |
| **Build Production Bundle** | One-shot Vite production build. |
| **Chrome: Open Debug** | Launches Chrome with a dedicated profile + remote-debugging on `:9222`. |

The `Start Dev` task is the entry point 95% of the time. Use it, don't manually `npm run dev`.

## URLs

- Dev server: <http://127.0.0.1:3000> — **127.0.0.1, not localhost**. The Spotify OAuth redirect URI is `http://127.0.0.1:3000` and Spotify treats `localhost` as a different origin (auth will silently fail with a stuck OAuth callback).
- API: same origin, prefixed `/api/*` — Vite proxies to Express on `:3001`.
- Health: <http://127.0.0.1:3001/healthz> (no auth) and `/readyz` (auth-free DB ping).

## Common gotchas

1. **Spotify redirects to `localhost`, then nothing works.** Use `127.0.0.1` in the URL bar. The OAuth callback only succeeds at the origin registered in the Spotify dashboard.
2. **OAuth callback gets stuck at a spinner.** Was a bug in `App.jsx`; the render guard now prefers `accessToken` over the `sessionLoading` flag. If it reappears, check that we still flip `sessionLoading` after `restoreSession`.
3. **A new SW deploy hangs the app at a blank page.** The `prompt to refresh` toast is mounted in `AppShell`; if it doesn't appear, the registration in `client/lib/registerSW.js` short-circuited. Hard-refresh + check the registration in Application → Service Workers.
4. **Generated audio writes to `runtime/audio/` locally.** That's the `LocalDiskBlobAdapter` doing the right thing. Set `AZURE_STORAGE_ACCOUNT=<account>` + `az login` to share the prod cache from dev.
5. **DB schema drifted.** `npm start` (or any boot) runs `sequelize.sync({ alter: true })`. Adding a new model creates the table; touching a column type can produce noisy `ALTER` SQL — eyeball it once in `psql`. For destructive changes use the Postgres reset task and re-seed.
6. **Persona edit isn't picked up.** The `personaVersion` hash is cached per-process. Restart the dev server (nodemon does this on save of any `server/**` file, but `personas/**` is not watched).

## Quick commands

```pwsh
# Hard restart Postgres
Stop-Process -Name node -Force; docker restart spotifai-pg

# Show recent dev-server stdout
Get-Content runtime\*.log -Tail 50

# Run the smoke check (validates personas, covers, intros on disk)
npm run smoke

# Force re-bake one DJ avatar
npm run seed:dj-avatars -- --dj rusty --force

# Manually validate a prompt against the eval suite
npm run eval

# Verify Sequelize sees the new model
docker exec -it spotifai-pg psql -U postgres -d spotifai -c "\dt"
```

## Don't do these in dev

- Don't run `azd up`, `azd deploy`, or anything that touches Azure without explicit user OK.
- Don't run `git push --force` against shared branches.
- Don't run the **Postgres: Reset** task without checking if there's work-in-progress data.
- Don't bypass safety checks (`--no-verify`, `--force`) as a shortcut around a failing pre-commit.
