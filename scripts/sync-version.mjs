#!/usr/bin/env node
// Version single-source: root package.json `version` drives every other manifest.
// - default: write the root version into frontend/package.json (+ lockfile),
//   backend/Cargo.toml ([package].version), backend/tauri.conf.json.
// - --check: report drift and exit 1 without writing (CI gate).
// Wired into the npm `version` lifecycle so `npm version <x.y.z>` syncs everything.
//
// @see docs/specs/500-ci-release/spec.md [FR-16]
// @see docs/specs/500-ci-release/design.md [DES-CI-VERSION]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CHECK = process.argv.includes("--check");
const root = JSON.parse(readFileSync("package.json", "utf8"));
const version = root.version;
if (!version) {
  console.error("✖ root package.json has no version field");
  process.exit(1);
}

const drift = [];
const synced = [];

function syncJson(path, mutate, describe) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  const obj = JSON.parse(raw);
  const current = describe(obj);
  if (current === version) return;
  if (CHECK) {
    drift.push(`${path}: ${current} (expected ${version})`);
    return;
  }
  mutate(obj);
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  synced.push(`${path}: ${current} → ${version}`);
}

syncJson(
  "frontend/package.json",
  (o) => (o.version = version),
  (o) => o.version,
);
syncJson(
  "frontend/package-lock.json",
  (o) => {
    o.version = version;
    if (o.packages && o.packages[""]) o.packages[""].version = version;
  },
  (o) => o.version,
);
syncJson(
  "backend/tauri.conf.json",
  (o) => (o.version = version),
  (o) => o.version,
);

// Cargo.toml: replace the version line inside the [package] section only.
{
  const path = "backend/Cargo.toml";
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n");
  let inPackage = false;
  let current = null;
  let lineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\[/.test(line)) inPackage = /^\s*\[package\]\s*$/.test(line);
    else if (inPackage) {
      const m = line.match(/^(\s*version\s*=\s*")([^"]+)(".*)$/);
      if (m) {
        current = m[2];
        lineIdx = i;
        break;
      }
    }
  }
  if (current === null) {
    console.error(`✖ ${path}: could not locate [package] version`);
    process.exit(1);
  }
  if (current !== version) {
    if (CHECK) {
      drift.push(`${path}: ${current} (expected ${version})`);
    } else {
      lines[lineIdx] = lines[lineIdx].replace(/^(\s*version\s*=\s*")[^"]+(".*)$/, `$1${version}$2`);
      writeFileSync(path, lines.join("\n"));
      synced.push(`${path}: ${current} → ${version}`);
    }
  }
}

if (CHECK) {
  if (drift.length) {
    console.error(`✖ version drift against root ${version}:`);
    for (const d of drift) console.error(`  - ${d}`);
    console.error("  Run: npm run version:sync");
    process.exit(1);
  }
  console.log(`✓ all manifests agree on ${version}`);
} else if (synced.length) {
  for (const s of synced) console.log(`✓ ${s}`);
} else {
  console.log(`✓ all manifests already at ${version}`);
}
