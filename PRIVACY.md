# Desktop Nano Cortex Privacy Policy

Last updated: July 6, 2026

Desktop Nano Cortex uses Microsoft Clarity for app telemetry, on by default. This document
states plainly what is and isn't collected, and how to turn it off.

## Telemetry

**Microsoft Clarity is enabled by default.** Clarity provides session interactions, heatmaps,
and JavaScript error stack traces from the app's webview. In addition, this app forwards its
own diagnostic log lines (the same entries shown in the in-app Logs panel — MIDI/BLE events,
connection state, error messages) to Clarity as custom events when telemetry is on.

Turn it off any time in **About → Telemetry posture**. Turning it **off** takes full effect
the next time you launch the app (Clarity has no supported way to fully unload an
already-running session); turning it **on** takes effect immediately.

Diagnostic log lines can include device-identifying strings (e.g. connected device name,
firmware version, provisional BLE packet contents) — see [Your data](#your-data) below for
what always stays local regardless of this setting.

## Network access

- **Telemetry (Clarity)** — when enabled, the app loads `clarity.ms` and sends session/event
  data to Microsoft's servers, per [Microsoft's Clarity privacy documentation](https://learn.microsoft.com/en-us/clarity/faq).
- **Update check** — once per session, the app may query the GitHub Releases API for this
  repository to see whether a newer version exists. No personal data, device data, or
  identifiers are sent beyond what any HTTPS request carries. If you are offline, the app works
  normally and the check silently does nothing.

There is no cloud backend or proxy operated by this project; both network calls above go
directly to their respective third parties (Microsoft, GitHub).

## Your data

- **Device traffic (MIDI/BLE):** stays on your machine. USB MIDI messages and provisional BLE
  captures are processed locally and shown in the app. This data is **not** sent to Clarity as
  structured device state — only what appears as a human-readable log line is forwarded (see
  Telemetry above).
- **Logs & diagnostics files:** written locally (the `logs/` directory is gitignored). Saved
  diagnostic bundles leave your machine only if you copy and share them yourself — scrub
  anything personal first.
- **Settings:** stored locally via the Tauri store plugin / `localStorage`, including your
  telemetry preference.

## What we don't do

- No selling of your data.
- No model training on your data.
- No additional analytics or advertising SDKs beyond Microsoft Clarity.
- No claims on your device's behalf: BLE-derived readouts are provisional decode, not
  authoritative device state (see the Truthfulness Guard in
  [docs/specs/900-project-governance/spec.md](docs/specs/900-project-governance/spec.md)).

## Contact

Questions: open an issue at <https://github.com/rixrix/deskop-nano-cortex/issues>.
