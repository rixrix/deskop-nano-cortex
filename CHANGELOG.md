# Changelog

<!-- @see docs/specs/900-project-governance/spec.md [FR-12] -->

All notable changes to Desktop Nano Cortex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No changes yet.

## [1.0.4] - 2026-07-16

### Added

- Preset-change acknowledgement over BLE after a recall, matching the
  documented switch-preset flow so the device leaves its pending
  preset-change context instead of ignoring subsequent recalls.
- Transport gating affordances across the Console and Tone Studio: a
  "USB needed" / "Bluetooth needed" badge on any control whose transport is
  unavailable, plus a one-shot activity note on partial connectivity.
- Preset rail improvements: names render as read-only labels with a pencil
  button to edit (disabled while disconnected), a hover recall affordance on
  each slot, and every bank (including the active one) can now collapse.
- Third-party attribution for the adopted Bluetooth command-protocol material,
  with a Credits section in the About panel and connectivity guidance in Help
  and the README.

### Fixed

- Corrected the Capture slot selection frame and the state-dump rotary-position
  decode: selecting captures in Bank D/E previously left the capture silent and
  snapped the UI back to Bank A.
- Removed a hover flicker on the preset rail's recall button.

## [1.0.3] - 2026-07-11

### Added

- Footswitch Deck asset pickers for Capture and Cab/IR slots, including grouped
  Capture banks, direct 1-5 slot jumps, and visible bypass controls.
- Tone Studio graph editing that keeps graph handles and parameter sliders in
  sync while writing live device values.

### Changed

- Stabilized Tone Studio value loading and write progress so parameter forms stay
  mounted during graph/slider edits and progress appears in a fixed lane.
- Replaced capture/Cab-IR rotary left/right cycling with direct picker and slot
  buttons for clearer bank and slot selection.
- Refreshed backend dependency versions for the BLE/MIDI stack.

### Fixed

- Decoded the observed Cab/IR parameter refresh reply shape so level, filters,
  mic, and position values can sync from newer slot replies.
- Restored amount readout syncing from device state dumps and recognized the
  normal EXIT press packet in Protocol Lab decoding.
- Updated the Playwright rotary-write smoke test to use the new direct slot
  selectors so `verify:full` matches the shipped UI.

## [1.0.2] - 2026-07-09

### Added

- Update-availability surfacing: a top-bar pill and a one-time toast when a
  newer GitHub release is detected.
- Help page additions: a Tone Studio overview and a debugging guide covering how
  to capture and submit diagnostic logs.

### Changed

- Reworked the top bar: USB / Bluetooth / SCAN are grouped into a single
  segmented control, with a softer active-state glow and less-rounded buttons.
- Replaced the theme control with a swatch popover that previews each theme and
  folds in the high-contrast toggle.
- Simplified the device status dock and removed the footer pill for a lighter,
  less boxy layout.

### Fixed

- Telemetry session replay now renders the styled UI: the stylesheet is inlined
  into the bundle so recordings are no longer a bare app icon.
- The console fits a maximized 1920x1080 window without page scroll, with
  comfortable top spacing at every window height.
- Raised dark, night, and dim text contrast to meet WCAG AA: signal-path labels
  and muted captions are legible, and light-glass panels no longer wash out text
  in dark themes.

## [1.0.1] - 2026-07-07

### Changed

- Updated release documentation to mark macOS and Windows 11 as confirmed
  runtime targets, while keeping Linux labelled as preview/untested until a
  real platform smoke test is recorded.
- Refined Windows installation and release runbook notes for unsigned
  SmartScreen behavior and Windows 11 validation.

### Fixed

- Fixed the blank Windows system tray icon by using the packaged default app
  icon for the tray menu.
- Improved the 1920x1080 console layout so the footswitch quick presets and
  Utilities rail remain reachable without burying primary controls below the
  first viewport.
- Corrected the AgenticFlowX website link in the app footer.

## [1.0.0] - 2026-07-07

### Added

- Console workbench with collapsible preset rail, signal-path quick controls,
  Nano-ordered amp knobs, clickable footswitch deck, and a scrollable Utilities
  rail.
- USB MIDI command path for preset recall, FX on/off, tap tempo, tuner,
  expression, and documented Program Change / Control Change messages.
- Bluetooth device-state sync for preset names, knob movement, loaded
  capture/cab/IR assets, signal-chain model state, gate state, footswitch
  assignments, rotary state, and Tone Studio values.
- Floating Tone Studio for focused signal-chain inspection, parameter values,
  live parameter writes, verified gate/capture/IR controls, and guarded
  save/discard workflows.
- Preset editing workflows for 64 presets across 8 banks, including remembered
  last-opened preset, rename handling, manual/auto save mode, dirty-state
  prompts, and save confirmation.
- Footswitch assignment and rotary workflows for quick preset slots plus
  capture/cab/IR selection where verified by hardware testing.
- Diagnostics, logs, status progress lane, Protocol Lab tooling, and copyable
  support bundles for debugging app/device sessions.
- Help, About, privacy, telemetry toggle, support links, version details, and
  warranty/unofficial-use guidance inside the app.
- Release governance: Apache-2.0 license, community health docs, issue/PR
  templates, CI/security/release workflows, platform runbooks, and AFX
  traceability checks.
- macOS app/DMG packaging plus Windows and Linux release targets for preview
  validation.

### Changed

- Packaged app identity is **Unofficial Nano Cortex**, including macOS Bluetooth
  permission prompts and unofficial About metadata.
- README now includes a screenshot/video walkthrough, installation guidance for
  unsigned macOS builds, and preview notes for Windows and Linux artifacts.
- Save/Load and broad Settings entry points are hidden from the primary header
  because the connected device is the source of truth for v1.
- Rust toolchain and release workflows pin Rust 1.90.0 so GitHub Actions can
  read the committed Cargo lockfile across macOS, Windows, and Linux runners.

### Known limitations

- macOS is the only hardware-tested runtime for v1.0.0.
- Windows and Linux artifacts are wired but untested; treat them as preview
  builds until platform smoke tests are recorded.
- v1.0.0 is unsigned, so macOS Gatekeeper and Windows SmartScreen prompts are
  expected.
- Bluetooth state remains clearly labelled and guarded where device behavior is
  still provisional.
- Capture/IR library management and deeper paid/advanced tone-generation ideas
  are intentionally outside this v1 release.

[Unreleased]: https://github.com/rixrix/deskop-nano-cortex/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/rixrix/deskop-nano-cortex/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/rixrix/deskop-nano-cortex/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/rixrix/deskop-nano-cortex/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/rixrix/deskop-nano-cortex/releases/tag/v1.0.0
