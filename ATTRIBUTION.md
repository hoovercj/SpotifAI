# Attribution

SpotifAI is derived from [WYOU Radio](https://github.com/chrisallenarmbruster/wyou-radio) by Chris Armbruster and the Rev4Labs team (MIT licensed, © 2023).

## What we kept

- The overall product concept — an AI-DJ-narrated personal radio station built on the Spotify Web Playback SDK
- The React + Redux Toolkit client architecture and UI components
- The Express server, OAuth flow, and Sequelize/PostgreSQL data model
- The four DJ personas (Rusty Maddox, M-Quake, Nigel Windsor, Lady Lyric) — their voices, prompts, and stylistic guidance
- The rundown/show-runner pattern that interleaves songs with talk segments

## What we changed

- **LLM stack:** Dropped LangChain, OpenAI, and the `ConversationChain`/`BufferMemory` machinery in favor of a thin direct integration with Google Gemini (`@google/genai`).
- **TTS stack:** Dropped ElevenLabs in favor of Gemini's preview TTS model (`gemini-2.5-flash-preview-tts`); voice IDs remapped from ElevenLabs hashes to Gemini preset voices.
- **Provider abstraction:** Added `server/services/llm/` and `server/services/tts/` dispatcher modules so the LLM and TTS providers are swappable via env vars.
- **Per-session chat isolation:** Replaced a global single-chain pattern (which silently shared one session across all listeners) with a `Map<userSessionId+djId, chat>` so each DJ in each user session keeps its own persistent context.
- **New segments:** Added news briefs (Denmark via DR Nyheder, Spain via El País, Iowa via Iowa Public Radio) and Copenhagen-area transit alerts (Rejseplanen + DSB Trafikinfo).
- **Stack modernization:** Node 22, React 18.3, Redux Toolkit 2; removed deprecated `forever`, the dead `child_process` npm package shadow, and a leaked third-party API key from the source.
- **Deployment target:** Repackaged the Dockerfile for Azure Container Apps (scale-to-zero) + Azure Database for PostgreSQL Flexible Server.

## Original license

The original [LICENSE](LICENSE) header is preserved; modifications are dual-licensed under the same MIT terms.
