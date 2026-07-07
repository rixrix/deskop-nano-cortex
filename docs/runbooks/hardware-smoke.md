# Hardware Smoke Runbook

<!-- @see docs/specs/900-project-governance/spec.md [FR-5] -->

## Purpose

CI has no Nano Cortex hardware. This manual runbook is the verification gate
for device behavior: run it **before every release** and **after any change to
MIDI or BLE behavior**. Documented MIDI steps are authoritative checks;
BLE steps exercise experimental BLE diagnostics whose decoded values are
provisional — a BLE "pass" means the provisional decode behaved as expected,
not that the decode is authoritative.

Related specs: [900-project-governance](../specs/900-project-governance/spec.md)
· [110-backend-midi-ble](../specs/110-backend-midi-ble/spec.md)

## Prerequisites

- Nano Cortex on firmware ~2.2.1 (the tested baseline), powered on
- USB cable connected to the test machine
- BLE-capable Mac
- App build: `npm run build:mac`, or run live via `npm run dev:tauri`

## Checklist

Work through the steps in order. Record Pass/Fail per step.

| Step                        | Action                                                                                       | Expected                                                                                                                                                                                            | Pass/Fail |
| --------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1. USB discovery            | Connect USB, open the app, check the port list                                               | Nano Cortex appears in the MIDI port listing and can be selected                                                                                                                                    |           |
| 2. USB MIDI send            | Change preset from the app (documented Program Change)                                       | Device audibly/visibly switches to the selected preset                                                                                                                                              |           |
| 3. USB MIDI observe         | With the USB input listener active, turn a device knob and press a footswitch                | Listener stays healthy. Note: on tested firmware 2.2.1 the device sends zero device-to-host USB MIDI, so no incoming events is the expected baseline; any observed incoming MIDI is worth recording |           |
| 4. BLE scan/connect         | Open the experimental BLE panel and scan, then connect                                       | Device is found and connects; surface is labeled experimental                                                                                                                                       |           |
| 5. BLE state readout        | Compare the provisional BLE decode readout against the device's actual state (preset, knobs) | Provisional values track device changes plausibly; readout remains labeled provisional                                                                                                              |           |
| 6. BLE disconnect/reconnect | Power-cycle or move out of range, then reconnect                                             | App reports the disconnect honestly and recovers on reconnect without restart                                                                                                                       |           |
| 7. App relaunch             | Quit and relaunch the app with the device still on                                           | App restores a sane state: ports re-enumerate, no stale "connected" claims before a real connection                                                                                                 |           |

## Evidence capture

Record a run using this format and attach it to the release PR (or the PR
that changed MIDI/BLE behavior). Do not rely on `logs/` for permanent
evidence — it is gitignored, and its contents must be scrubbed of personal
data before sharing anyway.

```
Date:          2026-07-06
Firmware:      2.2.1
App version:   1.0.1 (About panel)
OS:            macOS 15.x
Step results:  1 PASS / 2 PASS / 3 PASS / 4 PASS / 5 PASS / 6 PASS / 7 PASS
Notes:         <anything observed, especially BLE anomalies>
```

Caveat for the record: BLE observations in steps 4–6 are **provisional BLE
decode**, not authoritative device state. Hardware verification of individual
BLE fields is tracked in
[110-backend-midi-ble](../specs/110-backend-midi-ble/spec.md); a smoke pass
here does not upgrade any field's verification status.
