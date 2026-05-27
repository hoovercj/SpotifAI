# `prompts/`

Single source of truth for every LLM prompt template in SpotifAI. Each `.md` file is a [Nunjucks](https://mozilla.github.io/nunjucks/) template; production code renders them through `server/services/utl/loadPrompt.js`, and the Promptfoo eval harness in `evals/` reads them directly (Promptfoo also uses Nunjucks).

That means editing a `.md` file changes both production prompts and what the eval scores against. No copy-paste, no wrappers to keep in sync.

## Files

| File | Used by | Variables |
| --- | --- | --- |
| `dj-system.md` | `server/services/llm/buildDJSystemPrompt.js` | `djName`, `djStyle`, `context`, `signaturePhrases` (array) |
| `station-intro.md` | `server/services/aiStations/createStationIntro.js` | `stationTag`, `stationName`, `genreName`, `mode` (`"cold"` \| `"warm"`) |
| `station-tracks.md` | `server/services/aiStations/generateStationTracks.js` | `genreName`, `stationName`, `stationBrief`, `candidateCount` |

## What goes to which model

There are two distinct AI surfaces in this codebase. The files in this folder all target the **script-generating LLM** (Gemini text). The **TTS model** never sees these prompts directly — it receives the LLM's output wrapped with a Director's-Notes preamble built in [server/services/createContent.js](../server/services/createContent.js).

The TTS wrapping is:

```
Read the following on-air radio segment as <djName>.

<persona.ttsDirection>

TRANSCRIPT:
<LLM output, including any audio tags>
```

This structure follows the [Gemini speech-generation prompting guide](https://ai.google.dev/gemini-api/docs/speech-generation#prompting-guide). The explicit `TRANSCRIPT:` label keeps the model from reading the style notes aloud, and the per-persona `ttsDirection` aligns the prompt's tone with the selected voice's profile (mitigating the "voice inconsistency" limitation).

## Audio tags in generated scripts

`dj-system.md` instructs the LLM to use inline audio tags like `[laughs]`, `[sighs]`, `[whispers]`, `[excited]`, `[short pause]` etc. — 0 to 2 per segment. Gemini TTS natively interprets these. The full list lives in the [prompting guide's audio tags section](https://ai.google.dev/gemini-api/docs/speech-generation#prompting-guide). Tags only apply to the DJ's voice; we don't use sound-effect tags (no `[applause]`, `[music plays]`).

## Conventions

- **Nunjucks whitespace control.** Use `{%- ... -%}` to strip surrounding whitespace when a tag is the only thing on its line (e.g. around `{% for %}` blocks). Without this you get unwanted blank lines in the rendered prompt.
- **No HTML escaping.** The loader disables `autoescape`. Prompts are plain text bound for the LLM, so `&amp;` would be wrong.
- **Strict variables.** The loader sets `throwOnUndefined: true`. A typo in a variable name fails loud at render time rather than silently inserting an empty string.
- **Trim on render.** `loadPrompt` `.trim()`s the result, so trailing newlines in the file don't bloat the prompt.

## `experiments/`

Overlay directory for prompt iteration. The top-level `prompts/*.md` files are the **stable baseline** that production reads — they never change mid-experiment. To iterate, copy the file you want to tweak into `experiments/` and edit the copy:

```pwsh
Copy-Item prompts/station-intro.md prompts/experiments/station-intro.md
# edit prompts/experiments/station-intro.md
npm run eval        # baseline cache-served; experiment regenerates
npm run eval:view   # side-by-side matrix
```

When the experiment wins, promote it:

```pwsh
npm run eval:promote
```

That copies `prompts/experiments/*.md` over the top-level production files and **deletes the experiment files** — clean slate for the next iteration. Git tracks the previous wording, so if you want to base a new experiment on the just-shipped version, copy the production file back into `experiments/` and tweak.

Production code never reads `experiments/`. Only `evals/prompts/intro-experiment.cjs` (and any future eval-only loaders) does.

## Hot reload

In development (`NODE_ENV !== 'production'`) the loader sets `noCache: true` on the Nunjucks file loader, so editing a template is picked up on the next render without restarting the server or the prompt-lab CLI.
