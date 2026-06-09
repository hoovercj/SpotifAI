# Roadmap

Living backlog of ideas worth turning into plans. Each item is a starting
point — when we decide to work on one it gets its own design doc / PRD
before any code lands. The roadmap is intentionally not exhaustive and
not prioritized.

**Status legend**
- `idea` — brain dump, open questions unanswered
- `groomed` — open questions resolved, ready to plan
- `planned` — design doc exists

---

## DJ Voice & Content Quality

### Audit per-song chatter accuracy — `idea`
Today the DJ delivers a single session-level intro (see
[prompts/session-intro.md](prompts/session-intro.md),
[prompts/station-intro.md](prompts/station-intro.md)) — there is no
fresh per-track chatter line. Decide whether the intro should reference
the actual upcoming tracks (title, artist, why-this-song), and/or
whether we add a separate per-song chatter segue.

Open questions:
- Do we want per-song chatter at all? If yes, how often (every song,
  every Nth, weighted random)?
- Does the chatter prompt currently get the upcoming track list as
  context? If not, surface it.

Related: *Interruption-frequency setting*, *New segue types*.

### Audit audio-tag usage in TTS prompts — `idea`
[prompts/dj-system.md](prompts/dj-system.md) already documents Gemini
audio tags (`[laughs]`, `[chuckles]`, `[short pause]`, etc.) and caps
them at 0–2 per segment. Use the existing `evals/` harness to measure
how often tags actually appear in real output and whether they sound
natural. Reference:
https://ai.google.dev/gemini-api/docs/speech-generation#audio-tags.

Open questions:
- Do we need tags we don't currently mention (one-shot directorial cues,
  `[singing]`, regional accent cues)?
- Are some personas under-using or over-using tags? Track per-DJ.

### DJs speaking too slowly — `idea` (investigation)
Some DJs sound sluggish. Likely causes:
- TTS voice choice per persona doesn't match the energy we asked for
- Prompt never asks for pace ("deliver with energy", "uptempo")
- Per-call TTS config (rate, temperature)

Action: pick 3 offending DJs, sample ~5 intros each, identify whether
voice or prompt is the dominant factor, fix accordingly.

### "Talk-bridge" pause when DJ chatter runs long — shipped (June 2026)
The long-chatter handoff in
[PlayerProvider.jsx](client/Components/player/PlayerProvider.jsx)
now has an explicit three-phase shape:

1. DJ starts at `T - TALK_BRIDGE_OUTRO_MS` of the outgoing song and
   music fades 1.0 → 0 over the next 6s, so song A trails off under
   the DJ's opening line.
2. Song A ends naturally → Spotify auto-skips and the existing
   `delayNextTrackRef` flow pauses song B. DJ talks over pure silence.
3. With `TALK_BRIDGE_INTRO_MS` (6s) of DJ left, song B resumes and
   music fades 0 → 1.0 back to full volume.

Short clips (≤ 12s combined) keep the simple duck-and-overlap
behavior — the new fade only kicks in when the DJ break exceeds
`TALK_BRIDGE_THRESHOLD_MS`. Fades are linear via `setInterval` at
~60ms steps (well under Spotify Web Playback's setVolume rate ceiling).
A `fadeIntervalRef` + `talkBridgeRef` pair gets cleared anywhere
DJ scheduling is torn down (session change, hard stop, on-demand DJ
audio, audio mount cleanup) so a leftover fade can never desync from
a fresh session.

The old `MAX_VOICEOVER_DURATION` constant is gone — replaced by the
three explicit constants (`TALK_BRIDGE_OUTRO_MS`,
`TALK_BRIDGE_INTRO_MS`, `TALK_BRIDGE_FADE_STEP_MS`).

### DJ vs music mix — DJ hard to hear over music — `idea` (investigation, from feedback)
User reported the DJ chatter was hard to understand even with the
music volume dropped and the DJ slider at max. Possible causes:
- TTS WAV output isn't loudness-normalized (some personas come out
  quiet, some loud).
- `SPOTIFY_VOL_ATTENUATION = 0.5` may not be aggressive enough on
  some devices / track masters.
- HTMLAudioElement is capped at 1.0 — no headroom to boost a quiet
  TTS clip without a Web Audio gainNode.

Action: collect 5 sample WAVs across DJs, measure LUFS, decide whether
to normalize on the server (ffmpeg-normalize step in the TTS pipeline)
or push the DJ overlay through a Web Audio node with a gain > 1.0.

### DJ persona voice instability mid-session — `idea` (investigation, from feedback)
User reported the DJ on a `mood:workout/lift` session was Magnus
(djId=9) for the first ~2 songs, then a "Rusty-sounding" voice on the
third break — even though the persona portrait stayed as Magnus.
**Telemetry now confirms the voice never actually switched**: every
`tts.synthesize` event from that listenSessionId used `voiceId =
Charon` (Magnus's voice — Rusty's is `Algieba`). So this is a
*perceptual* drift inside a single voice, not a wrong-voice bug.

Hypotheses worth chasing:
- Gemini TTS produces noticeably different cadence / character within
  one voice when the script length or audio-tag density spikes — the
  longer "third break" segment may have pushed the voice into a
  different timbral register.
- LLM-emitted text included another DJ's name as an artist reference,
  triggering a perceptual association ("that sounded like Rusty
  because it said 'Rusty' in the audio").
- Audio-tag bracket pronunciation: an unintended `[]` token leaking
  into the audio can shift perceived persona.

Action: sample 5 long-vs-short outputs for the same voice and listen
side-by-side. The new persona telemetry (below) means we can
correlate any future report with the exact voiceId, slug, and cache
state.

**Telemetry shipped alongside this roadmap entry** (June 2026):
- `tts.synthesize` now carries `personaSlug` (in addition to existing
  `voiceId` and `model`).
- New `content.next-content` custom event from
  [server/routes/content.js](server/routes/content.js) carries `djId`,
  `personaSlug`, `voiceId`, `userSessionId`, `seedKey`, `seedType`,
  `curTrackUri`, `ms` so we can join any reported segment back to the
  exact persona + voice used.
- `intro.cache.hit` / `intro.cache.miss` / `intro.generated` already
  carry `personaSlug` + `seedKey` + `blobPath` so cache reuse is
  visible.

---

## DJ Format & Segue Types

### Multi-DJ pairs (morning-show style) — `idea`
Some stations should have 2 DJs on the air. Sometimes A talks, sometimes
B, sometimes they banter. Think "Morning Talk Show".

Open questions:
- How is the pair declared? A `coHostDjId` on station metadata, or a new
  "show" abstraction wrapping a station + 2+ DJs?
- Prompt shape — one prompt that emits a 2-speaker script with speaker
  labels, or two sequential LLM calls?
- TTS — Gemini supports multi-speaker; do we use that or splice two
  single-speaker clips?

Unlocks: morning-show skits, ad reads with banter, caller-with-host
segments.

### New segue types — `idea` (brainstorm)
The DJ rotation should include more than "intro the next song". Seed
list to expand:
- **DJ ad reads** — fake in-character ads. Fixed roster of fake sponsors
  per DJ, or generated fresh?
- **Caller requests** — synthetic listener call-in; optionally with a
  second voice playing the caller.
- **Fun fact / on-this-day** — music-history beat relevant to the
  station's genre or era.
- **Contests** — flavor-only "9th caller wins…" framing, no real
  interaction.
- **Weather / news / traffic** — real content; see *Personalization*
  below.
- **Genre / artist trivia** — "this is the song that defined X".
- **Persona moments** — small in-character skits (Rusty's truck broke
  down again, etc.).

Open questions:
- How does the segue scheduler decide which type to fire? Random
  weighted? Avoid repeats? User-controlled mix?

Depends on: *Multi-DJ pairs* (for caller / banter formats), *Per-song
chatter audit* (for the scheduler shape).

---

## User Input & Control

### Personal DJ + conversational input — `groomed` (high priority)

A persistent chat surface where the user can request music in natural
language. Modeled after Spotify's "DJ" tile + chat panel, adapted for
our persona roster. **The DJ rotates per chat session** — every chat
request picks a fresh genre-matched host so the user is exposed to
the roster naturally, without having to browse the DJ picker.

#### V1 scope (locked)

**Surfaces** (all three ship in V1):

- **Home tile.** Full-width tile pinned at the top of
  [HomeTab.jsx](client/Components/tabs/HomeTab.jsx), above "Jump back
  in". Avatar of the most-recent chat-session DJ (or a neutral DJ tile
  when none) + CTA "Talk to your DJ". Tap opens the chat panel.
- **In-session "Talk to your DJ" button** reachable from
  [NowPlayingScreen.jsx](client/Components/player/NowPlayingScreen.jsx)
  and [NowPlayingBar.jsx](client/Components/player/NowPlayingBar.jsx).
- **Chat panel** itself — bottom-sheet drawer:
  - Header: current chat DJ avatar + "Change DJ" affordance (re-rolls
    the pick).
  - Suggested prompts row (pre-rendered, context-aware — see below).
  - Transcript area (user + DJ turns + `[played: ...]` track markers).
  - Footer: text input + push-to-talk mic button (Web Speech API).
    Typed input is always available; mic is additive and hidden on
    browsers that don't expose `SpeechRecognition`.

**Voice transport.** Web Speech API only (push-to-talk: hold mic →
release sends one utterance). No streaming, no Gemini Live in V1.
Failed/unsupported voice falls back to the visible typed input.
Mic permission is requested only on first push-to-talk tap — never
at app load.

**Personal DJ assignment.** No persistent personal DJ. Every chat
request picks a fresh DJ from the user's genre-matched subset using
the existing
[resolveSessionDj.js](server/services/sessions/resolveSessionDj.js)
logic seeded by the user's top genres. Side-benefit: no new DB column,
no Settings UI dependency, no migration.

**Conversation = full user session as a transcript.** The LLM chat
behind the DJ already accumulates per
`(userSessionId, djId)` in
[server/routes/content.js](server/routes/content.js)'s `getOrCreateChat`.
The chat panel extends the same transcript with:

```
[user]   hey, play some 90s hip-hop
[dj]     (chatter intro for the new session)
[played: A Tribe Called Quest — Can I Kick It]
[dj]     (per-track chatter)
[played: Wu-Tang — C.R.E.A.M.]
[user]   more east coast
[dj]     (chatter acknowledging the steer)
[played: Nas — N.Y. State of Mind]
```

So the DJ naturally references prior turns ("earlier you asked for
X…"). `userSessionId` is persisted to localStorage by
[persistPlayer.js](client/store/persistPlayer.js) so **client reloads
preserve the conversation**. Server restarts wipe the in-memory
`chatSessions` map and reset the LLM context — accepted for V1.
A V2 follow-up persists the chat history server-side.

**Intent classification.** Single Gemini JSON-mode call per utterance
emits both intent + slot:

```json
{
  "intent": "play_now" | "play_next" | "play_multi" | "modify_session" | "unknown",
  "tracks":           [{ "title": "...", "artist": "..." }],
  "seedDescription":  "string",
  "modifier":         "string"
}
```

All four intents ship in V1:

| Intent | Behavior | Spotify API |
|---|---|---|
| `play_now` | Splice + resume: save current playback session + track URI + positionMs, play the requested URI, on its `onEnded` restore the saved session and seek back to the saved position. Refill resumes naturally. | `play({ uris:[reqUri] })` then later `play({ uris:[oldUri] })` + `seek` |
| `play_next` | Inject as next item in Spotify's queue, keep current playback session intact. | `addToQueue(reqUri)` |
| `play_multi` | Spin up an ad-hoc playback session via the standard session-start flow, seed `{ type: "chat", prompt, generatedBy: djId }`. Previous session goes to recents. | Standard session start |
| `modify_session` | Refill with the modifier applied. Skip-then-refill: server returns fresh tracks, client mutes Spotify, calls `next` past stale URIs, queues new ones, unmutes. User feels immediate effect, no audible glitch. | `setVolume(0)` + `nextTrack` loop + `addToQueue` + `setVolume(master)` |
| `unknown` | DJ replies in chatter ("I'm not sure what to do with that"), no playback change. | — |

**"Keep playing while we're thinking" is mandatory** across all
routes. The currently-playing track keeps going untouched while we:

- run the LLM intent classifier (~300–800ms),
- resolve URIs via Spotify search (one round-trip per track),
- ask Gemini for tracklist (for `play_multi`),
- ask the server for a refill batch (for `modify_session`),
- mint the DJ "what's happening next" chatter audio.

UI shows a "thinking…" spinner under the user's message bubble. Music
swap happens only at the last possible moment (URI resolved → splice
in / new session ready → swap; refill batch ready → skip-then-refill
loop runs). The user never hears silence outside the normal DJ break.

**Suggested prompts.** Pre-rendered per-context template table for V1
(no LLM call on chat open). Context-aware on:
- current playback seed (none / genre / mood / artist / track / playlist)
- user's Spotify top-genres + top-artists
- time of day

LLM-enriched slots (e.g. "Deeper {topArtist} cuts I haven't heard")
move to V2.

**Telemetry.** Each event auto-carries `listenSessionId` +
`userSessionId` via the existing client telemetry plumbing.

- `dj.chat.opened` — `{ surface: 'tile' | 'now-playing-bar' | 'now-playing-screen', djId }`
- `dj.chat.suggested.click` — `{ prompt, context }`
- `dj.chat.input.submitted` — `{ source: 'voice' | 'typed', utteranceLen }`
- `dj.chat.intent.classified` — `{ intent, latencyMs, modelLatencyMs }`
- `dj.request.session.started` — `{ intent, djId, seedType }` for `play_multi`
- `dj.request.splice.started` — Option-B `play_now` interrupt fired
- `dj.request.splice.resumed` — Option-B restore completed (or failed)
- `dj.modifier.applied` — `modify_session` skip-then-refill started
- `dj.modifier.heard` — first track played from the modifier batch

#### Slicing

V1 ships in three PRs to keep them reviewable:

1. **Chat panel shell + typed input + `play_multi` intent.** Easiest
   end-to-end path. Spawn an ad-hoc session from a typed utterance.
   Validates the full pipeline (LLM classify → server session-start →
   playback) before we layer on splice/queue/modifier.
2. **Surfaces + Web Speech API + suggested prompts.** Home tile,
   in-session button, mic, context-template suggestions.
3. **Remaining intents.** `play_now` (Option B splice), `play_next`
   (addToQueue), `modify_session` (skip-then-refill with mute).
   Telemetry for splice + modifier.

#### V2 follow-ups (out of scope for V1)

- Server-side conversation persistence (survive server restart).
- LLM-enriched suggested prompts with daily slot refresh.
- "Recently asked" pinned chip rail at the top of the chat panel.
- Gemini Live for streaming voice both directions.
- Promoting an ad-hoc chat session into a saved station.

Depends on: nothing blocking. The previous "Queue management" +
"Settings page replaces Profile" dependencies have been engineered
out by the per-session DJ rotation + the splice/skip-with-mute
intent flows.

### Settings page replaces "Profile" — `idea`
The current profile page lets the user type a name we already get from
Spotify and never speak on-air. Replace it with a settings page:
- **Traffic alerts**: roads, public transit (checkboxes)
- **Weather**: on/off
- **News**: local (auto, based on coarse reverse-geocoded location) plus
  user-added sources via a search UI (NPR, BBC, local outlets, …)
- **Interruption frequency**: slider — *every song / default / rarely /
  never*

Open questions:
- Delete name / display-name editing entirely, or keep as an override?
- Where do the prefs live? New `UserPreferences` table or a JSON blob on
  the existing user row?
- Which prefs flow into the prompt (frequency slider, weather/news
  toggles) vs which gate a feature on/off (no news source = no news
  segues)?

Depends on: *Geolocation services*.

### Geolocation for local news / traffic / weather — partial (June 2026)
**Done:** IP-based reverse geocoding shipped in
[server/services/ipGeo.js](server/services/ipGeo.js) — uses ip-api.com
(free, no key, 45/min per source IP, well under our usage with the
6h per-IP LRU cache). Wired into
[server/routes/content.js](server/routes/content.js) so every
`/api/content/next-content` request gets a `{ lat, long, city,
region, country, timezone }` location derived from `req.ip` and forwarded
to `showRunner` via `user.location`. All traces of the old zip-based
flow are gone — the `UserProfile` dialog no longer asks for a zip,
the Profile model's `zip`/`lat`/`long` columns are removed, the old
`services/locationIQ.js` helper is deleted, and the
`LOCATION_IQ_API_KEY` env var has been pulled out of infra + CI +
docs (LocationIQ never had an IP-geo endpoint usable to us).

**Still open:**
- Map region → news sources (DR regional feeds, RTVE autonomous
  communities, Iowa local source filter, etc.). Today the weather
  segment uses the new lat/long; news is still global.
- Traffic data provider (Azure Maps? Bing?).
- Per-user manual override in settings for VPN users / expats whose
  IP geo would be wrong.
- Cost model — current per-IP cache means free tier covers us for
  now, but log `content.next-content` `hasLocation=false` to spot
  where we're missing coverage.

### Mood / activity station artwork + DJ awareness — `idea`
Genre stations have cover art (see `debug/station-cover-candidates/`);
moods and activities do not. Generate cover art for each via the same
pipeline. Separately, surface the mood/activity metadata to the prompt
context so DJ intros are actually aware they're hosting a "Focus" or
"Workout" station, parallel to how genre context is surfaced today.

Open questions:
- What's the canonical mood / activity list, and where is it defined?

---

## Playback Mechanics

### Queue management — match Spotify's behavior — `idea` (research)
We may be dumping a large batch of tracks into the user's Spotify queue
at session start, which then lingers after the user leaves SpotifAI.
Target behavior: drip-feed — queue N tracks ahead, refill as the user
advances, stop refilling when the user changes station or closes the
app.

Open questions:
- How does Spotify itself manage queue size when you start one of their
  playlists or radios? Mirror it.
- Do we need to actively *remove* tracks from the Spotify queue on
  station change, or is it enough to stop refilling and let it run out?
- What's "N ahead" — 2 tracks? 5? Tuned how?

Unlocks: cleaner "interrupt with a request" UX, less leftover state when
sessions end.

### Cap maximum track length — shipped (June 2026)
A user's mood:workout/lift session picked **Dopesmoker** (a single
1h+ track). The catalog filter now rejects anything longer than 15
minutes at the candidate-track stage in
[server/services/sessions/geminiToSpotifyTracks.js](server/services/sessions/geminiToSpotifyTracks.js)
(mood / track / artist seeds) and on the playlist-fetch path in
[server/services/sessions/generators/fromPlaylist.js](server/services/sessions/generators/fromPlaylist.js).
Dropped counts are logged via Pino (`session.tracks.dropped_long`,
`playlist.tracks.dropped_long`) so we can spot heavy-cap seeds in
App Insights and tune later if needed.

Still open (deferred until we see real data):
- Per-seed-type caps (classical/jazz/ambient legitimately want
  longer tracks). Current global 15-min cap is a placeholder that
  matches the original feedback ceiling — generous enough that
  most classical movements still fit.
- User override in settings.

### "End / stop session" control — shipped (June 2026)
Two entry points landed for terminating the current session:

- **Swipe-left on the minimized [NowPlayingBar](client/Components/player/NowPlayingBar.jsx)** —
  framer-motion `drag` + `dragSnapToOrigin` reveals a red "Stop
  session" hint that ramps in proportional to drag distance, then
  commits on release past the threshold (or with enough velocity).
  A swipe-up on the same bar opens the full-screen view.
- **"Stop session" link** under the transport controls in
  [NowPlayingScreen.jsx](client/Components/player/NowPlayingScreen.jsx).

Both call the new `endSession()` helper in
[PlayerProvider.jsx](client/Components/player/PlayerProvider.jsx),
which pauses Spotify + the DJ overlay, dispatches
`clearPlaybackSession` / `clearCurrentTrack` / `setCurrentContext(null)`,
and closes the drawer. The matching `recent_session` row stays on the
server so the user can re-tap the seed from the Home rail.

Shipped alongside: **Repeat button** on playlist sessions in the
full-screen view (cycles off → context → track, pushed to Spotify via
`setRepeat`). Sits opposite the existing Shuffle button, mirroring
Spotify's mobile transport layout.

### "Tap a new seed mid-session does nothing" — fixed (from feedback)
**Root cause** found via stdout logs once we knew to look there: the
client was sending `{ type: "track", trackId }` and `{ type: "artist",
artistId }` from `HomeTab`'s `startTrackSession` / `startArtistSession`
handlers, but the server's seedKey contract requires `spotifyUri`. The
server threw `seedKey: track seed requires spotifyUri` and returned 500
six times in a row — invisible in App Insights `exceptions` because the
route caught the error and returned 500 via `res.status`. Fixed by
sending `{ type: "track", spotifyUri: track.uri }` /
`{ type: "artist", spotifyUri: artist.uri }` from
[client/Components/tabs/HomeTab.jsx](client/Components/tabs/HomeTab.jsx),
and added `trackException` to the catch in
[client/Components/player/useStartSession.js](client/Components/player/useStartSession.js)
so the next silent server-side failure surfaces as a client exception
with the seedType attached.

Follow-up worth doing: pipe server-side `logger.error(...,
'sessions.start.failed')` to `trackException` too — Pino's stdout
isn't picked up by App Insights' exception channel, so 500s with a
caught error inside the route handler don't show up in
`exceptions | where …`. Either bridge Pino-error → trackException, or
add an explicit `trackException(err, { route, ...})` next to every
`logger.error` in sessions/content routes.

**Update (June 2026):** the follow-up is done.
[server/services/logger.js](server/services/logger.js) now has a Pino
hook that auto-forwards every `error`/`fatal` log line to
`trackException`, mapping all caller-supplied object fields onto
`customDimensions`. Every route catch that previously did
`console.error(...)` has also been migrated to `logger.error(...)`
(content, spotify, sessions, stations, profile, ensureFreshAccessToken
plus the service-layer calls in createContent, currentWeather,
generateStationTracks, geminiToSpotifyTracks, pickDjWithLlm, news,
transit, musicFacts, rundown, convertMP3FileToDataURI, db/seed). Net
result: any uncaught-and-caught exception in production now shows up
in `exceptions | where customDimensions.source == "pino"` with the
log name as `customDimensions.logName`.

---

## Suggested additions (not in the original brain dump)

Items I noticed while reading the codebase. Drop any that don't belong.

### Eval harness coverage — `idea`
`evals/promptfooconfig.yaml` exists but coverage of the actual prompts
in `prompts/` is spotty. Decide which prompts must have eval rows (likely
all five chatter prompts) and what the assertions look like (audio-tag
density, length bounds, no-fourth-wall, etc.).

### Per-DJ engagement analytics — `idea`
We log `intro.played` and `session.start` to App Insights but don't have
a rollup of "which DJs do users skip away from fastest" or "which
stations have the longest median listen time". A small Workbook in
[docs/observability.md](docs/observability.md) would surface it.

---

## Modern web platform adoption

Surfaced by the [modern-web-guidance](.agents/skills/modern-web-guidance/SKILL.md)
skill (Chrome team agent skills, installed under `.agents/`). When picking
one of these up, re-run `npx -y modern-web-guidance@latest retrieve "<id>"`
to get the current guide — the IDs below are the ones to retrieve.

### `fetchpriority="high"` on the LCP cover image — shipped (June 2026)
Shipped across all three above-the-fold tile components. Each now
takes an optional `priority` prop that drops `loading="lazy"` and
emits `fetchpriority="high"` on its `<img>`:

- [HomeTab.jsx](client/Components/tabs/HomeTab.jsx)’s `PosterTile`
  is `priority` on the first "Jump back into" tile.
- [GenreStationTile.jsx](client/Components/tabs/GenreStationTile.jsx)
  is `priority` on the first genre tile of the Stations row — but only
  when there are no recent sessions above it, so the priority budget
  always goes to whichever row actually owns the LCP slot.
- [AIStationsRow.jsx](client/Components/tabs/AIStationsRow.jsx)’s first
  card gets `priority` for the SearchTab genre/mood detail screens.

Everything else keeps the existing `loading="lazy"` so we don't blow
the priority budget on offscreen tiles. Newly Available since
2024-10-29 so no fallback is needed.

### Service worker update toast → Popover API — `idea`
[client/Components/shell/ServiceWorkerUpdateToast.jsx](client/Components/shell/ServiceWorkerUpdateToast.jsx)
is a `fixed`-positioned div with z-index. Guide
`persistent-toast-notifications` recommends `popover="manual"` (Newly
Available since Jan 2025, all major browsers): puts the toast in the Top
Layer so it can't z-index-fight with the player overlay or DJ overlay.

### `content-visibility: auto` on the Browse All grid — `idea`
[client/Components/tabs/BrowseAllGrid.jsx](client/Components/tabs/BrowseAllGrid.jsx)
renders ~145 station tiles in one long grid. Guide
`defer-rendering-heavy-content` says: per-row `content-visibility: auto`
+ `contain-intrinsic-size: auto 200px` defers layout/paint for offscreen
rows.

Open questions:
- Keyboard reachability needs verification — the guide flags that some
  AT configurations exclude `content-visibility: auto` subtrees from
  sequential nav until focus enters.

### `content-visibility: hidden` on inactive tabs — `idea`
Home / Library / Search tab panels likely re-mount on switch (Radix Tabs
default). Guide `faster-spa-view-transitions` recommends
`content-visibility: hidden` on inactive panels to cache rendering state
for near-instant switching. Three tabs only, so the RAM trade-off the
guide warns about is small here.

### Native `<dialog closedby="any">` — `groomed` (blocked on Safari)
[client/Components/ui/dialog.jsx](client/Components/ui/dialog.jsx) wraps
Radix's portal-based modal. Native `<dialog>` + `closedby="any"` gives
focus trap, ESC handling, top layer, and light-dismiss for free. Hold
until Safari ships support — currently no Safari at all.
