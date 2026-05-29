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

### Voice + text user input — `idea`
User can type or speak a request:
- "Play [song]" — single-track interrupt.
- "Make me a playlist of [vibe]" — multi-track request.
- Eventually free-form: "less aggressive", "more 80s", "skip ahead".

Open questions:
- Where does the request UI live? Floating control on the player? A
  dedicated tab?
- Single-song requests just queue. For multi-track requests, do we
  (a) replace the current station, (b) spin up a new ad-hoc station and
  switch to it, or (c) splice into the current queue and resume the
  station after? Strawman recommendation: **(b)** — keeps the current
  station resumable and treats the request like a new ad-hoc station.
- Voice input transport — Web Speech API, Gemini Live, push-to-talk?
- Is the ad-hoc station saved to recents? Promotable to a real station?

Depends on: *Queue management* (for the "splice without losing place"
option).

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

### Geolocation for local news / traffic / weather — `idea` (research)
The hard problem behind the settings page. Need to:
- Get user location (browser Geolocation API → reverse-geocode to
  city/region)
- Map region → news sources, traffic data source, weather provider

Open questions:
- Provider choices — weather (OpenWeather? Met?), traffic (Azure Maps?
  Google? Bing?), news (RSS aggregation? a paid news API?)
- Cost model — most of these are per-request paid APIs; how aggressively
  do we cache per-region?
- Privacy — coarse location only, never store raw lat/lon.

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

### `fetchpriority="high"` on the LCP cover image — `groomed`
[client/Components/tabs/AIStationsRow.jsx](client/Components/tabs/AIStationsRow.jsx)
and [client/Components/tabs/GenreStationTile.jsx](client/Components/tabs/GenreStationTile.jsx)
apply `loading="lazy"` to *every* tile, including the first row above the
fold. Guide `optimize-image-priority` says: never lazy-load the LCP
image, and exactly one image should get `fetchpriority="high"`.

Action: first AI-station tile of the top row gets `fetchpriority="high"`
and drops `loading="lazy"`; everything else keeps `loading="lazy"` only
(don't add `fetchpriority="low"`). Newly Available since 2024-10-29 — no
fallback needed.

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
