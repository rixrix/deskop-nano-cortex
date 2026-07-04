// Staged-file formatting/linting across the two-package repo.
//
// The frontend has the only ESLint (flat) config, and flat config is discovered
// from cwd upward with `files:` globs relative to that base — so frontend files
// are linted via `npm --prefix frontend run lint:staged` (cwd = frontend/) with
// paths rewritten relative to frontend/. Everything else gets Prettier only.
//
// @see docs/specs/400-dx-tooling/spec.md [FR-19]
// @see docs/specs/400-dx-tooling/design.md [DES-DX-HOOKS]
import path from "node:path";

const FRONTEND = path.resolve("frontend");
const q = (f) => JSON.stringify(f);

const frontendFix = (files) => {
  const abs = files.map(q).join(" ");
  const rel = files.map((f) => q(path.relative(FRONTEND, f))).join(" ");
  return [`prettier --write ${abs}`, `npm --prefix frontend run lint:staged -- ${rel}`];
};

export default {
  // Frontend TS/JS: prettier (root binary; config resolves to frontend/.prettierrc.json),
  // then eslint --fix executed inside frontend/.
  "frontend/**/*.{ts,tsx,js,mjs}": frontendFix,

  // Root-level JS/config — no ESLint config governs these; prettier only.
  "*.{js,mjs,cjs}": ["prettier --write"],
  "scripts/**/*.mjs": ["prettier --write"],

  // Structured config anywhere (lockfiles are excluded via .prettierignore).
  "*.{json,jsonc,yml,yaml}": ["prettier --write"],

  // Markdown: prettier first, markdownlint --fix wins last.
  "*.md": ["prettier --write", "markdownlint-cli2 --fix"],

  // Rust: format staged files in place. --edition passed explicitly because
  // standalone rustfmt does not reliably honor the edition key in rustfmt.toml.
  "backend/**/*.rs": ["rustfmt --edition 2021"],
};
