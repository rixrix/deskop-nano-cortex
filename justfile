# Desktop Nano Cortex — common dev tasks. Run `just` to list.
#
# @see docs/specs/400-dx-tooling/spec.md [FR-13]
# @see docs/specs/400-dx-tooling/design.md [DES-DX-SCRIPTS]

default:
    @just --list

# First-time setup: root tooling (husky, knip, prettier, …) + frontend deps
setup:
    npm install
    npm ci --prefix frontend
    @echo ""
    @echo "Optional native tools (secret scan, Rust supply-chain, task runner):"
    @echo "  brew install gitleaks cargo-deny just"

# Install frontend deps only
install:
    npm ci --prefix frontend

# Vite dev server (browser, mocked backend)
dev:
    npm run dev

# Full desktop app (Rust backend + webview)
app:
    npm run dev:tauri

# Bundle installers (dmg/msi/deb/appimage)
build:
    npm run build:tauri

# Static checks, no mutation: format:check + lint(+clippy+trace) + typecheck + knip + md
check:
    npm run check

# Auto-resolve mechanical issues: prettier + rustfmt → markdownlint --fix → eslint --fix
fix:
    npm run fix

# Fast pre-push gate: check + unit tests (also runs on git push via husky)
verify:
    npm run verify

# Full PR lifecycle: verify + coverage + rust tests + e2e + build + deps + version drift
verify-full:
    npm run verify:full

# Lint everything: ESLint + clippy(-D warnings) + traceability gate
lint:
    npm run lint

# Format Rust + TS/TSX in place
fmt:
    npm run format

# Unit tests (cargo + Vitest)
test:
    npm test

# Playwright E2E (mocked Tauri IPC)
e2e:
    npm run e2e

# Dead code / unused dependency analysis
knip:
    npm run knip

# Full-tree secret scan (requires gitleaks)
scan:
    npm run scan:secrets

# Rust advisories + license allowlist (requires cargo-deny)
deny:
    npm run lint:deps:rust

# Bump version everywhere (root + frontend + Cargo.toml + tauri.conf.json)
version ver:
    npm version {{ver}}

# Validate @see traceability links
trace:
    node scripts/check-traceability.mjs
