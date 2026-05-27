/**
 * Promptfoo prompt loader — current production prompts.
 *
 * Reads the SAME `.md` templates that production uses (via
 * `server/services/utl/loadPrompt`). Editing `prompts/dj-system.md` or
 * `prompts/station-intro.md` immediately changes what this loader emits,
 * so the next `npm run eval` scores the new wording.
 *
 * Comparison partner: `intro-baseline.cjs`, which renders the frozen
 * snapshot in `prompts/_baselines/`. The two columns side-by-side in
 * the Promptfoo viewer show production-vs-baseline.
 *
 * Iteration loop:
 *   1. Edit a `.md` template in `prompts/`.
 *   2. `npm run eval`        — production column regenerates; baseline
 *                              is cache-served (zero token spend).
 *   3. `npm run eval:view`   — open the side-by-side viewer.
 *   4. If you like the change, `npm run eval:promote` copies the
 *      production template over the baseline. Run `npm run eval` once
 *      more to re-cache the new baseline.
 */
'use strict'

const path = require('node:path')

const { djCharacters } = require(
  path.resolve(__dirname, '../../server/services/djCharacters')
)
const { buildDJSystemPrompt } = require(
  path.resolve(__dirname, '../../server/services/llm/buildDJSystemPrompt')
)
const { buildIntroPrompt } = require(
  path.resolve(
    __dirname,
    '../../server/services/aiStations/createStationIntro'
  )
)

module.exports = async function ({ vars }) {
  const { djId, genreName, stationName, mode } = vars
  const persona = await djCharacters(djId)
  if (!persona) throw new Error(`No DJ with id=${djId}`)

  return [
    { role: 'system', content: buildDJSystemPrompt(persona) },
    {
      role: 'user',
      content: buildIntroPrompt({ genreName, stationName, mode }),
    },
  ]
}
