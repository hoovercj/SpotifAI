#!/usr/bin/env node
/**
 * Promote every active experiment to production:
 *
 *   prompts/experiments/*.md   →  prompts/*.md       (then deleted)
 *   personas/experiments/*.md  →  personas/*.md      (then deleted)
 *
 * Copy + delete = clean slate. Git tracks the previous wording, so if
 * you want to base a new experiment on the just-shipped version, copy
 * the production file back into experiments/ and tweak.
 *
 * Usage: npm run eval:promote
 *
 * The next `npm run eval` will see the (new) baseline as "changed"
 * once — content hash differs from the cache key — and regenerate it.
 * After that, baseline runs hit the cache until you promote again.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

/** Pairs of (experiment-source-dir, production-target-dir). */
const KINDS = [
  {
    name: 'prompt',
    from: path.join(root, 'prompts', 'experiments'),
    to: path.join(root, 'prompts'),
  },
  {
    name: 'persona',
    from: path.join(root, 'personas', 'experiments'),
    to: path.join(root, 'personas'),
  },
]

let promoted = 0

for (const { name, from, to } of KINDS) {
  if (!fs.existsSync(from)) continue
  const files = fs
    .readdirSync(from)
    // Skip the .gitkeep that holds the dir in source control, plus any
    // editor/README files we don't want to treat as overrides.
    .filter(
      (f) =>
        f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md'
    )

  for (const f of files) {
    const src = path.join(from, f)
    const dst = path.join(to, f)
    fs.copyFileSync(src, dst)
    fs.unlinkSync(src)
    promoted += 1
    console.log(
      `  promoted ${name}: ${path.relative(process.cwd(), src)}  →  ${path.relative(process.cwd(), dst)}`
    )
  }
}

if (promoted === 0) {
  console.log('No experiments to promote (both experiments/ dirs are empty).')
  process.exit(0)
}

console.log(
  `\nPromoted ${promoted} file(s). Experiment dirs are now empty — clean slate.`
)
console.log(
  'Next `npm run eval` will regenerate the new baseline once, then cache.'
)
