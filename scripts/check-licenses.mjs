#!/usr/bin/env node
// Lightweight JS dependency-license allowlist over frontend production deps
// (read from frontend/package-lock.json). Pairs with `npm audit` in the
// `lint:deps` script and with cargo-deny (backend/deny.toml) on the Rust side.
// Unknown/missing license fields warn; disallowed licenses fail.
//
// @see docs/specs/900-project-governance/spec.md [FR-8]
// @see docs/specs/500-ci-release/spec.md [FR-15]
import { readFileSync } from "node:fs";

const ALLOW = [
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "CC0-1.0",
  "CC-BY-4.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
  "MPL-2.0",
];

const lock = JSON.parse(readFileSync("frontend/package-lock.json", "utf8"));
const packages = lock.packages ?? {};

const bad = [];
const unknown = [];
let checked = 0;

const allowed = (expr) =>
  // Handles plain ids plus simple "(A OR B)" expressions: pass if any allowed id appears.
  ALLOW.some((id) => new RegExp(`(^|[\\s(])${id}([\\s)]|$)`).test(expr));

for (const [path, meta] of Object.entries(packages)) {
  if (!path.startsWith("node_modules/")) continue; // skip the root workspace entry
  if (meta.dev) continue; // production graph only
  if (meta.link) continue;
  checked++;
  const name = path.replace(/^.*node_modules\//, "");
  const license = meta.license;
  if (!license) {
    unknown.push(name);
  } else if (!allowed(license)) {
    bad.push(`${name}: ${license}`);
  }
}

console.log(
  `license check: ${checked} production packages (frontend), allowlist: ${ALLOW.join(", ")}`,
);
if (unknown.length) {
  console.log(
    `\n⚠ ${unknown.length} package(s) without a license field in the lockfile (non-fatal):`,
  );
  for (const u of unknown) console.log(`  - ${u}`);
}
if (bad.length) {
  console.error(`\n✖ ${bad.length} package(s) outside the allowlist:`);
  for (const b of bad) console.error(`  - ${b}`);
  process.exit(1);
}
console.log("\n✓ all production licenses within the allowlist");
