# SpotifAI

An AI-powered personal radio station that turns your Spotify queue into a hosted broadcast. Four AI DJs introduce your tracks with local news, traffic, and weather, music history, and more.

Forked from [chrisallenarmbruster/wyou-radio](https://github.com/chrisallenarmbruster/wyou-radio); see [ATTRIBUTION.md](ATTRIBUTION.md).

> **Status:** active development — APIs and segment formats may shift.

---

## What it does

- Streams from your Spotify Premium account via the Web Playback SDK.
- Wraps each track transition in a generated DJ break: song intros, weather, on-this-day music history, local news briefs, and traffic alerts.
- Uses **Google Gemini** end-to-end

  | DJ            | Style                            | Gemini voice |
  | ------------- | -------------------------------- | ------------ |
  | Rusty Maddox  | Gruff classic-rock biker uncle   | `Fenrir`     |
  | M-Quake       | Sassy female pop / contemporary  | `Aoede`      |
  | Nigel Windsor | Refined British classical        | `Charon`     |
  | Lady Lyric    | Confident hip-hop / R&B female   | `Kore`       |

---

## Requirements

- **Node.js ≥ 22** (see `.nvmrc`)
- **PostgreSQL 14+** (any flavor — local Docker, Azure Flexible Server, etc.)
- **Spotify Premium** account + a Spotify Developer app (client ID/secret, redirect URI registered)
- **Google AI Studio API key** (`GOOGLE_API_KEY`) — free tier is sufficient to start
- *(optional)* **Rejseplanen access ID** — free registration; needed only if you want Copenhagen transit alerts to use the live Rejseplanen feed (otherwise falls back to DSB RSS)
- *(optional)* **OpenWeather** + **LocationIQ** API keys for the weather segment

---

## Quick start (local)

```powershell
# 1. Clone and install
git clone https://github.com/hoovercj/SpotifAI.git
cd SpotifAI
npm install

# 2. Copy .envSample → .env and fill in at minimum:
#    GOOGLE_API_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET,
#    SPOTIFY_REDIRECT_URI_DEV, DATABASE_URL, SESSION_SECRET
Copy-Item .envSample .env

# 3. Make sure PostgreSQL is running and the database in DATABASE_URL exists.
#    Tables are auto-created/migrated by Sequelize on startup.

# 4. Build the frontend bundle (or use `npm run build` for watch mode)
npm run build:prod

# 5. Start the server
npm start
```

Open <http://localhost:3000>, sign in with Spotify, pick a DJ, and hit play.

---

## Architecture at a glance

```
client/        React 18 + Redux Toolkit + Spotify Web Playback SDK
server/
  app.js       Express app
  routes/
    spotify.js   OAuth + playback control
    content.js   /next-content endpoint — per-(session,DJ) chat
  services/
    llm/       Provider-pluggable chat (default: Gemini)
    tts/       Provider-pluggable speech synth (default: Gemini → WAV)
    news/      RSS dispatchers: dk (DR), es (El País), iowa (IPR) + dedupe
    transit/   Copenhagen — Rejseplanen primary, DSB RSS fallback, 5-min cache
    rundown/   Show runner; weaves songs, weather, history, news, transit
  db/          Sequelize models (PostgreSQL)
```

### Provider abstraction

The LLM and TTS layers are abstracted behind small dispatch modules so you can
swap providers without touching the rest of the app:

```js
// server/services/llm/index.js
const PROVIDERS = { gemini: require('./gemini') };
// dispatch via process.env.LLM_PROVIDER (default: "gemini")

// server/services/tts/index.js
const PROVIDERS = { gemini: require('./gemini') };
// dispatch via process.env.TTS_PROVIDER (default: "gemini")
```

To add an OpenAI/ElevenLabs/Azure provider later, drop in `./openai.js` etc.
and register it in the `PROVIDERS` map.

---

## Configuration reference

See [.envSample](.envSample) for the full list. The required variables are:

| Variable                   | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `GOOGLE_API_KEY`           | Gemini text + TTS                             |
| `SPOTIFY_CLIENT_ID/SECRET` | Spotify OAuth                                 |
| `SPOTIFY_REDIRECT_URI_DEV` | OAuth redirect (must match Spotify dashboard) |
| `DATABASE_URL`             | PostgreSQL connection string                  |
| `SESSION_SECRET`           | Express session signing                       |

Optional knobs:

| Variable                  | Default                        | What it controls                                |
| ------------------------- | ------------------------------ | ----------------------------------------------- |
| `LLM_PROVIDER`            | `gemini`                       | Chat provider key                               |
| `GEMINI_TEXT_MODEL`       | `gemini-2.5-flash`             | Gemini chat model                               |
| `GEMINI_TEXT_TEMPERATURE` | `1.0`                          | Chat temperature                                |
| `TTS_PROVIDER`            | `gemini`                       | Speech provider key                             |
| `GEMINI_TTS_MODEL`        | `gemini-2.5-flash-preview-tts` | Gemini TTS model                                |
| `TTS_OUTPUT`              | `wav`                          | Output format (mp3 needs ffmpeg — not bundled)  |
| `NEWS_TOPIC_ROTATION`     | `dk,es,iowa`                   | Comma-separated locale rotation for news brief  |
| `TRANSIT_ENABLED`         | `true`                         | Toggle the Copenhagen transit segment           |
| `REJSEPLANEN_ACCESS_ID`   | *(unset → DSB RSS only)*       | Live disruption feed                            |

---

## Deployment (Azure Container Apps)

The repo ships a single-stage `Dockerfile` (multi-stage build, `node:22-alpine`, scale-to-zero friendly) and a full [Azure Developer CLI](https://aka.ms/azd) template under `infra/` that provisions:

- **Azure Container Apps Environment** (Consumption plan) hosting the web app at `min-replicas=0, max-replicas=1`
- **Azure Container Registry** (Basic SKU) for the built image
- **Azure Database for PostgreSQL Flexible Server** (Burstable `Standard_B1ms`, v16, 32 GB) — eligible for the 12-month free offer on new subscriptions
- **Log Analytics workspace** for Container App logs
- A **user-assigned managed identity** with `AcrPull` on the registry — no admin credentials stored
- All app secrets bound as **Container App secrets** (sourced into the runtime container as env vars)

### Deploy in one shot

```powershell
# 1. Install azd if you don't have it: https://aka.ms/azd-install

# 2. From the repo root:
azd auth login
azd env new spotifai-prod
azd env set GOOGLE_API_KEY        <your-gemini-key>
azd env set SPOTIFY_CLIENT_ID     <your-spotify-client-id>
azd env set SPOTIFY_CLIENT_SECRET <your-spotify-client-secret>
# Optional:
azd env set OPEN_WEATHER_API_KEY    <key>
azd env set LOCATION_IQ_API_KEY     <key>
azd env set REJSEPLANEN_ACCESS_ID   <key>

# 3. Provision + build + deploy in one go
azd up
```

The Postgres admin password and the Express `SESSION_SECRET` are auto-generated and stored in your azd environment.

After `azd up` finishes it prints the Container App URL. **Add that URL to your Spotify Developer dashboard** as an additional redirect URI before signing in.

### Iterating

- `azd deploy` — rebuilds the image, pushes to ACR, and rolls the Container App
- `azd provision` — re-applies Bicep changes only
- `azd down` — tears everything down (use when you're done experimenting)

---

## License

MIT — see [LICENSE](LICENSE).
