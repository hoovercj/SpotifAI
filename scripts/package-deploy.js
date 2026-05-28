#!/usr/bin/env node
/* eslint-disable no-console */
// Assemble .deploy/ — the artifact uploaded to App Service.
// Run after `npm ci && npm run build`. Produces .deploy/ containing only
// what App Service needs at runtime: server/, dist/, public/, package*.json,
// plus a freshly-installed prod-only node_modules/.
//
// We do a fresh `npm ci --omit=dev` inside .deploy/ instead of copy-then-prune.
// That's smaller (no devDep orphans) and faster on Linux CI runners.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const out = path.join(root, ".deploy");

// Copied verbatim from the repo into .deploy/. node_modules is intentionally
// NOT here — we install fresh prod-only below.
const INCLUDE = [
  "server",
  "dist",
  "public",
  "package.json",
  "package-lock.json",
];

function rimraf(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function copy(src, dst) {
  // Node 16.7+: fs.cpSync with recursive copies files and directories.
  fs.cpSync(src, dst, { recursive: true, errorOnExist: false, force: true });
}

function dirSizeMb(p) {
  if (!fs.existsSync(p)) return 0;
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) total += fs.statSync(full).size;
    }
  }
  return Math.round((total / (1024 * 1024)) * 10) / 10;
}

console.log(`[package] staging deploy artifact in ${path.relative(root, out)}`);
rimraf(out);
fs.mkdirSync(out, { recursive: true });

const distDir = path.join(root, "dist");
if (!fs.existsSync(distDir)) {
  console.error(
    "[package] ERROR: dist/ not found. Run `npm run build` before `npm run package`."
  );
  process.exit(1);
}

for (const name of INCLUDE) {
  const src = path.join(root, name);
  const dst = path.join(out, name);
  if (!fs.existsSync(src)) {
    console.warn(`[package] skipping missing ${name}`);
    continue;
  }
  console.log(`[package] copying ${name} ...`);
  copy(src, dst);
}

console.log("[package] installing production deps in .deploy/ ...");
// --ignore-scripts: no native builds / lifecycle scripts needed in the artifact.
execSync("npm ci --omit=dev --ignore-scripts", { cwd: out, stdio: "inherit" });

console.log(`[package] artifact size: ${dirSizeMb(out)} MB`);
console.log("[package] done.");
