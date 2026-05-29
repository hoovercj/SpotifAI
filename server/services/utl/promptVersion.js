/**
 * Short content hash for an intro prompt template (and the rest of
 * the prompt-generation pipeline whose output we cache as audio).
 *
 * Combined with personaVersion to form the cache key for intro audio:
 * if either changes, the cache forks naturally. Prevents a dev who's
 * iterating on prompt text from poisoning the shared cache with their
 * experimental output.
 *
 * Hashes both prompt template files (`station-intro.njk` and
 * `session-intro.njk`) plus the persona-system prompt builder source,
 * since edits to any of them invalidate the audio output.
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const PROMPTS_DIR = path.resolve(__dirname, '..', '..', '..', 'prompts')
const BUILD_DJ_SYSTEM_PROMPT = path.resolve(
  __dirname,
  '..',
  'llm',
  'buildDJSystemPrompt.js'
)

let cached

function read(p) {
  try {
    return fs.readFileSync(p)
  } catch {
    return Buffer.alloc(0)
  }
}

function promptVersion() {
  if (cached) return cached
  const h = crypto.createHash('sha256')
  // Order matters for determinism; the hash result is the only thing
  // anyone reads, so consistent input order keeps it stable across
  // restarts as long as the files are identical.
  h.update(read(path.join(PROMPTS_DIR, 'station-intro.md')))
  h.update(read(path.join(PROMPTS_DIR, 'session-intro.md')))
  h.update(read(path.join(PROMPTS_DIR, 'dj-system.md')))
  h.update(read(BUILD_DJ_SYSTEM_PROMPT))
  cached = h.digest('hex').slice(0, 8)
  return cached
}

module.exports = { promptVersion }
