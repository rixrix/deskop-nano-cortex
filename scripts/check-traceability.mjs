#!/usr/bin/env node
// AFX traceability gate: every `@see docs/specs/<zone>/<doc>.md [ID]` in source must
// resolve to an existing document AND an existing node ID (DES anchors bracketed,
// FR/NFR ids as bare table tokens). Broken links fail CI; sources missing any `@see`
// are reported as warnings.
//
// @see docs/specs/001-overview/spec.md [FR-1] [FR-7]
// @see docs/specs/400-dx-tooling/spec.md [FR-1]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const SRC_DIRS = ["backend/src", "frontend/src"];
const EXTRA_FILES = [
  "backend/rustfmt.toml",
  ".editorconfig",
  // DX tooling configs (zone 400) — NFR-6 enforcement extends to these:
  "knip.jsonc",
  ".markdownlint-cli2.jsonc",
  "lint-staged.config.mjs",
  "commitlint.config.cjs",
  ".npmrc",
  ".prettierignore",
  ".gitattributes",
  ".gitleaks.toml",
  ".gitmessage",
  ".husky/pre-commit",
  ".husky/commit-msg",
  ".husky/pre-push",
  ".vscode/settings.json",
  ".vscode/extensions.json",
  "justfile",
  // CI/release + supply chain (zone 500):
  "backend/deny.toml",
  "scripts/sync-version.mjs",
  "scripts/check-licenses.mjs",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/workflows/security.yml",
  ".github/dependabot.yml",
  ".github/FUNDING.yml",
];
const SRC_EXT = /\.(rs|ts|tsx|js)$/;
const SKIP = /(\bnode_modules\b|\btarget\b|[\\/]gen[\\/])/;

const SEE = /@see\s+(docs\/specs\/[^\s]+\.md)\s+([^\n*]*)/g;
const ID = /\[([A-Z]+-[A-Z0-9-]+)\]/g;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (SRC_EXT.test(name)) out.push(p);
  }
  return out;
}

const docCache = new Map();
function doc(rel) {
  if (!docCache.has(rel)) {
    const p = join(root, rel);
    docCache.set(rel, existsSync(p) ? readFileSync(p, "utf8") : null);
  }
  return docCache.get(rel);
}

function idPresent(text, id) {
  if (id.startsWith("DES-")) return text.includes(`[${id}]`);
  // FR-/NFR- live in markdown table cells as bare tokens.
  return new RegExp(`(^|[|\\s\\[])${id.replace(/[-]/g, "\\-")}([|\\s\\].]|$)`, "m").test(text);
}

const files = [
  ...SRC_DIRS.flatMap((d) => walk(join(root, d))),
  ...EXTRA_FILES.map((f) => join(root, f)),
];
const errors = [];
const missing = [];
let links = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file);
  if (!text.includes("@see")) {
    if (!/[\\/](mod|main)\.(rs)$|env\.d\.ts$/.test(rel)) missing.push(rel);
    continue;
  }
  for (const m of text.matchAll(SEE)) {
    links++;
    const target = m[1];
    const body = doc(target);
    if (body === null) {
      errors.push(`${rel}: missing doc ${target}`);
      continue;
    }
    for (const idm of m[2].matchAll(ID)) {
      if (!idPresent(body, idm[1])) errors.push(`${rel}: id [${idm[1]}] not found in ${target}`);
    }
  }
}

console.log(`traceability: ${files.length} files scanned, ${links} @see links checked`);
if (missing.length) {
  console.log(`\n⚠ ${missing.length} source file(s) without a @see header (non-fatal):`);
  for (const m of missing) console.log(`  - ${m}`);
}
if (errors.length) {
  console.error(`\n✖ ${errors.length} broken @see link(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\n✓ all @see links resolve to existing zone specs and node IDs");
