# Release Checklist

<!-- @see docs/specs/900-project-governance/spec.md [FR-6] -->

Maintainer-only. Releases are cut by manually dispatching `release.yml` from
GitHub Actions. Work through the steps in order.

1. Working tree clean, on a `release/*` branch (the pre-commit hook blocks
   `main` anyway).

2. Full local gate is green:

   ```bash
   npm run verify:full
   ```

3. Run the [hardware smoke runbook](hardware-smoke.md) against a real Nano
   Cortex and capture the evidence block.

4. Bump the version — this syncs all manifests
   (root `package.json`, `frontend/package.json`, `backend/Cargo.toml`,
   `backend/tauri.conf.json` via `scripts/sync-version.mjs`):

   ```bash
   npm version <x.y.z>
   npm run version:check
   ```

5. Update `CHANGELOG.md`: move the `Unreleased` entries into a new
   `## [x.y.z]` section with today's date.

6. Commit, push the branch, open a PR, merge to `main`.

7. GitHub → Actions → `release.yml` → Run workflow → choose platform
   (`all` / `macos` / `windows` / `linux`), draft = true.

8. Inspect the drafted GitHub Release:

   - macOS: `.dmg`, `.app.tar.gz`
   - Windows: `.msi`, `-setup.exe` — Windows 11 runtime smoke is confirmed for
     v1.0.0; keep SmartScreen notes visible while artifacts are unsigned.
   - Linux: `.deb`, `.AppImage` — mark untested until a real Linux smoke run
     passes.
   - Checksums: `SHA256SUMS-vx.y.z.txt` is attached for the release assets
     produced by the platform(s) built.
   - Sizes look sane, version string is correct on every artifact.
   - Open the checksum manifest and confirm each listed artifact is present on
     the release page.

9. Add release notes from the new CHANGELOG section.

10. Publish the release.

11. Include the unsigned-artifact caveats in the notes (v1.0.0 ships unsigned):

    - macOS Gatekeeper: right-click → Open. The app is ad-hoc signed so the
      bundle is sealed, but it is not Developer ID signed or notarized.
    - Windows SmartScreen: "More info → Run anyway"
    - Linux builds are untested previews unless smoke evidence is attached to
      the release.

12. Post-release: launch the app and verify the About panel update-check sees
    the new release.

Developer ID, Authenticode, and Linux package signing are deferred; when
certificates exist, the secret schema in
[500-ci-release](../specs/500-ci-release/spec.md) documents the values needed
for a later signed workflow. Keep the macOS ad-hoc signing identity (`-`) in
`tauri.conf.json` so unsigned preview builds still have a valid app-bundle seal.
