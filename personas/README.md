# `personas/`

DJ persona definitions, one markdown file per DJ. Read by [server/services/utl/loadPersonas.js](../server/services/utl/loadPersonas.js) and exposed via the legacy `djCharacters(djId)` API.

## File format

```markdown
---
id: 1
slug: rusty
djName: Rusty
voiceID: Algenib
image: rusty.png
genres: rock, metal, punk, country, folk
---

## djStyle

Single-paragraph description of the on-air persona. Substituted directly
into the LLM system prompt (see `prompts/dj-system.md`).

## context

Single-paragraph back-story. Also substituted into the system prompt.

## appearance

Single-paragraph physical description for avatar image generation:
ethnicity, age, build, hair, clothing, accessories, expression. Used as
the "who" half of the prompt sent to gemini-3.1-flash-image-preview by
`scripts/seed-dj-avatars.js`. Also surfaced as flavor text in the
client-side DJ swap drawer, so write it like a vivid one-paragraph
character sketch, not a comma-separated tag string.

## scene

Single-paragraph description of the broadcast environment: studio,
background props, lighting. The "where" half of the avatar prompt. Keep
it consistent with the DJ's genre so the visual identity reads
immediately (turntables for a hip-hop DJ, a grand piano for a classical
don, a vintage Marshall for a rock host).

## ttsDirection

Single-paragraph Director's Notes for the TTS model: style, pacing, accent.
Wrapped as a preamble around the generated transcript before it is sent to
Gemini TTS, per the [Gemini speech-generation prompting guide](https://ai.google.dev/gemini-api/docs/speech-generation#prompting-guide).
It does NOT go to the script-generating LLM — only to TTS.

## signaturePhrases

- One bullet per phrase.
- Phrases are passed to the prompt as a list (first 8 are used).
- Avoid trailing punctuation differences across DJs — small consistency
  helps the LLM match cadence.
```

## Front-matter keys

| Key | Required | Notes |
| --- | --- | --- |
| `id` | yes | Numeric. The `djCharacters(djId)` API keys off this. Persisted in `RecentSession.djId` and `UserDjPreference.djId`. **Never re-number an existing DJ.** |
| `slug` | yes | Kebab-case identifier (e.g. `rusty`, `m-quake`, `lady-lyric`). Stable, human-readable, used in URLs, image filenames, and the LLM DJ-picker. Different from `id` so we can rename DJs without breaking DB rows. |
| `djName` | yes | The on-air name (display only). |
| `voiceID` | yes | Gemini TTS preset (e.g. `Algenib`, `Autonoe`, `Sadaltager`, `Sulafat`). The full 30-voice catalog is in the [Google Gemini TTS docs](https://ai.google.dev/gemini-api/docs/speech-generation#voices). |
| `image` | yes | Filename of the PNG in `public/images/djs/` (e.g. `rusty.png`). Resolved to a data URI on each load and also served as a static asset. |
| `genres` | yes | Comma-separated list of genre ids this DJ can host (e.g. `rock, metal, country`). Valid values are the keys in `server/services/aiStations/catalog.js` plus the mood-derived pseudo-genres. The LLM DJ-picker scores candidates against this list when no station is pre-pinned. |

## Sections

The loader recognises six `## name` headers: `djStyle`, `context`, `appearance`, `scene`, `ttsDirection`, `signaturePhrases`. Other headers are ignored. Each section is parsed as follows:

- **`djStyle` / `context` / `appearance` / `scene` / `ttsDirection`** — soft-wrapped lines inside a paragraph are joined with single spaces (so the .md file can wrap nicely without changing the prompt). Blank lines separate paragraphs.
- **`signaturePhrases`** — every line starting with `- ` becomes one entry in the string array. Order is preserved.

### Writing a good `ttsDirection`

This section goes straight to the TTS model as Director's Notes. Cover three things, in this order:

1. **Style** — the emotional vibe and timbre. Vivid is better than abstract: *"grizzled biker-uncle warmth, irreverent and mischievous"* beats *"casual"*.
2. **Pacing** — cadence and energy. *"unhurried and conversational, with the casual swing of someone who's done this for decades"* beats *"medium speed"*.
3. **Accent** — be specific. *"refined British English (RP), as heard at the Royal Academy of Music in London"* beats *"British accent"*.

Don't over-specify. The TTS model is creative; too many rules limit it. One paragraph is enough.

### Writing good `appearance` and `scene`

These two sections are concatenated into the image-gen prompt and have the biggest visible impact on whether a DJ's avatar reads as "the host of a [genre] show". Aim for:

- **Specific over generic.** *"Black woman in her early thirties from the Bronx, medium-brown skin, full lips set in a confident half-smile"* beats *"a hip-hop DJ"*.
- **Genre cues in the scene.** Turntables, vinyl crates, neon signage for hip-hop; oak panels and a grand piano for classical; faded band posters and a Stratocaster for rock. The viewer should be able to guess the show without reading the name.
- **Consistent framing.** Every DJ should sit roughly chest-up in their broadcast environment. The bake script renders 1024×1024 square avatars, so anything below the shoulders gets cropped tightly.

## Conventions

- **File naming.** Filename matches the `slug` (e.g. `rusty.md` for slug `rusty`, `lady-lyric.md` for slug `lady-lyric`). The loader sorts personas by front-matter `id`, not by filename.
- **Special characters.** UTF-8 throughout. Curly quotes (`’`), en-dashes (`–`), and other punctuation in the source live on as-is into the prompt.
- **Skipped files.** Files starting with `_` and `README.md` are ignored by the loader, so they're safe places to stash drafts or notes.

## Adding a new DJ

1. Allocate the next available numeric `id` (don't reuse old ones).
2. Pick a kebab-case `slug` and create `personas/<slug>.md` with every front-matter field plus all six sections filled in.
3. Run `npm run seed:dj-avatars` to bake a PNG into `public/images/djs/<slug>.png` via Gemini image gen. (Use `--force` to re-bake an existing one.)
4. Restart the dev server (the loader caches metadata at module load).
5. The new DJ shows up in the `/api/content/dj-characters` listing and is available to the LLM DJ-picker for any station whose genre matches `genres`.
6. (Optional) Pin them to a specific station via `server/services/aiStations/catalog.js` or to a specific mood via `server/services/sessions/moodCatalog.js`.


## `experiments/`

Overlay directory for persona iteration, mirroring `prompts/experiments/`. Top-level `personas/*.md` is the **stable baseline** that production reads — never edit it mid-experiment. To try a variant:

```pwsh
Copy-Item personas/rusty.md personas/experiments/rusty.md
# edit personas/experiments/rusty.md (tweak djStyle, signaturePhrases, etc.)
npm run eval        # the experiment column uses the overlay
```

The eval loader (`evals/prompts/intro-experiment.cjs`) loads the production roster and replaces any persona whose slug appears in `experiments/` with the experimental version. Slug matching is by filename. Personas without an overlay come from production unchanged.

Promote with `npm run eval:promote` — copies experiment files over production AND deletes them from `experiments/`, leaving a clean slate. Git tracks the previous version.

Production code never reads `personas/experiments/`. Only the eval does.
