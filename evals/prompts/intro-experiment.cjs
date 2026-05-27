/**
 * Promptfoo prompt loader — EXPERIMENT column.
 *
 * Reads from BOTH `prompts/experiments/` (for the user prompt) and
 * `personas/experiments/` (for persona overrides). When either dir is
 * empty, the loader transparently falls back to the production files
 * in `prompts/` and `personas/`. That means:
 *
 *   - No active experiment? Both eval columns are identical (boring
 *     but harmless — and a clear signal that you have nothing to compare).
 *   - Only a prompt experiment? Drop a .md into `prompts/experiments/`.
 *     Persona overlay stays empty, so personas come from production.
 *   - Only a persona experiment? Drop `personas/experiments/<slug>.md`.
 *     The user prompt comes from production.
 *   - Both? The matrix shows the combined experiment.
 *
 * Production code never reads either `experiments/` directory; only this
 * file (and any future eval-only loaders) does.
 *
 * Iteration loop:
 *   1. Copy the .md you want to tweak from `prompts/` (or `personas/`)
 *      into the matching `experiments/` directory.
 *   2. Edit the copy.
 *   3. `npm run eval` — baseline cache-served, experiment regenerates.
 *   4. `npm run eval:view` — side-by-side in the matrix viewer.
 *   5. If you like the experiment, `npm run eval:promote` copies the
 *      experiment files over the production ones AND deletes them from
 *      `experiments/`. Clean slate for the next iteration.
 */
'use strict'

const path = require('node:path')

const {
  loadPromptWithExperiments,
} = require(path.resolve(__dirname, '../../server/services/utl/loadPrompt'))
const {
  loadPersonasWithExperiments,
} = require(path.resolve(__dirname, '../../server/services/utl/loadPersonas'))
const { buildDJSystemPrompt } = require(
  path.resolve(__dirname, '../../server/services/llm/buildDJSystemPrompt')
)

const PROMPTS_EXPERIMENTS = path.resolve(__dirname, '../../prompts/experiments')
const PERSONAS_EXPERIMENTS = path.resolve(__dirname, '../../personas/experiments')

module.exports = async function ({ vars }) {
  const { djId, genreName, stationName, mode } = vars

  // Persona may carry an experimental override (different djStyle, etc.);
  // buildDJSystemPrompt renders prompts/dj-system.md with whatever
  // persona we hand it, so persona experiments flow into the system
  // prompt automatically.
  const roster = await loadPersonasWithExperiments(PERSONAS_EXPERIMENTS)
  const persona = roster.find((p) => p.id === Number(djId))
  if (!persona) throw new Error(`No DJ with id=${djId}`)

  const userPrompt = loadPromptWithExperiments(
    'station-intro',
    {
      stationTag: `Spotif-AI ${stationName}`,
      stationName,
      genreName,
      mode,
    },
    PROMPTS_EXPERIMENTS
  )

  return [
    { role: 'system', content: buildDJSystemPrompt(persona) },
    { role: 'user', content: userPrompt },
  ]
}
