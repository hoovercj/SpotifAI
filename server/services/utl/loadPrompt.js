/**
 * Nunjucks-backed prompt loader.
 *
 * All LLM prompt templates live in `<repo>/prompts/*.md` as Nunjucks
 * templates. Production code calls `loadPrompt(name, vars)`; the Promptfoo
 * eval harness can read the SAME files directly (Promptfoo also uses
 * Nunjucks). That means a prompt change in `prompts/` shows up in both
 * production and the eval immediately, with no wrapper duplication.
 *
 *   loadPrompt('dj-system', { djName, djStyle, context, signaturePhrases })
 *
 * The second argument shape (`{ baseDir }`) lets the eval harness aim at
 * a different prompts directory (e.g. `prompts/experiments/`) without
 * forking the loader.
 *
 * `loadPromptWithExperiments(name, vars, experimentsDir)` is the helper
 * the eval uses for the "experiment" column: it renders the template
 * from `experimentsDir/<name>.md` if that file exists, else falls back
 * to the canonical `prompts/<name>.md`. Production code should not call
 * it — production reads `prompts/` only.
 */
const fs = require('node:fs');
const path = require('node:path');
const nunjucks = require('nunjucks');

const PROMPTS_DIR = path.resolve(__dirname, '../../..', 'prompts');

// Cache one Nunjucks environment per base directory so that the FileSystem
// loader's own template cache is reused across calls.
const envCache = new Map();

function getEnv(baseDir) {
  let env = envCache.get(baseDir);
  if (!env) {
    // noCache during dev so editing a .md file is picked up on the next
    // call without restarting the server / CLI. Cost is one disk read per
    // render, which is negligible for prompt-sized files.
    const noCache = process.env.NODE_ENV !== 'production';
    env = new nunjucks.Environment(
      new nunjucks.FileSystemLoader(baseDir, { noCache }),
      { autoescape: false, throwOnUndefined: true }
    );
    envCache.set(baseDir, env);
  }
  return env;
}

function loadPrompt(name, vars = {}, { baseDir = PROMPTS_DIR } = {}) {
  const env = getEnv(baseDir);
  // Templates frequently end with a trailing newline from the file; trim so
  // callers get a clean string suitable for passing straight to the LLM.
  return env.render(`${name}.md`, vars).trim();
}

function loadPromptWithExperiments(name, vars, experimentsDir) {
  if (fs.existsSync(path.join(experimentsDir, `${name}.md`))) {
    return loadPrompt(name, vars, { baseDir: experimentsDir });
  }
  return loadPrompt(name, vars);
}

module.exports = { loadPrompt, loadPromptWithExperiments, PROMPTS_DIR };
