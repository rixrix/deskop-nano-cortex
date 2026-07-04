# Nano Cortex USB Debugging Notes

Date: 2026-06-13

## What macOS sees

- USB device: `Nano Cortex`
- Vendor: `Neural DSP`
- Serial: `NP00AM120`
- Vendor ID: `5418`
- Product ID: `35047`
- USB speed: 480 Mbps

Observed USB interfaces from `ioreg`:

- USB audio control interface
- USB audio stream interfaces
- `Nano Cortex MIDI Control`
- `Nano Cortex MIDI Stream`
- `Nano Cortex HID interface`

The HID interface exposes:

- Max input report size: 65 bytes
- Max output report size: 65 bytes
- Report ID 1: input report, 64 payload bytes
- Report ID 2: output report, 64 payload bytes

## Raw USB MIDI Probe

Tool added:

```sh
cargo run --manifest-path backend/Cargo.toml --bin nano_usb_probe -- --list
cargo run --manifest-path backend/Cargo.toml --bin nano_usb_probe -- 60
```

Result:

- CoreMIDI exposes one input port: `Nano Cortex`
- The probe can open the port successfully.
- Physical panel controls produced no inbound CoreMIDI bytes during capture:
  - knobs
  - footswitches
  - bank
  - FX
  - save / exit / capture

This means the current USB MIDI path is not passively emitting panel telemetry.

## Raw USB HID Probe

Tool added:

```sh
swift tools/nano_hid_probe.swift 60
```

Result:

- IOHID opens the Nano Cortex HID interface successfully.
- The probe receives no passive input reports.
- The probe receives no parsed HID input values.
- Polling input report IDs 1 and 2 returns success with zero-length data.

This means the HID interface exists, but it is not passively streaming panel telemetry. If it carries editor data, it likely needs an unknown output-report command or handshake first.

## Cross-Check: Browser MIDI Baseline

The browser MIDI baseline uses WebMIDI and WebBluetooth only.

Relevant behavior:

- USB path sends documented MIDI PC/CC.
- USB path listens for documented incoming PC/CC.
- It states that the Nano Cortex does not support querying preset names or current state via MIDI.
- It suggests configuring `USB MIDI Out` in Cortex Cloud to receive preset/effect changes from hardware.

It does not contain a hidden USB knob-value implementation.

## Current Transport Model

Use this as the working model until disproven:

- USB MIDI:
  - Good for sending documented commands: preset changes, tuner, FX bypass, tap tempo, expression.
  - May receive documented PC/CC only if the device is configured to emit them.
  - Not a passive source for physical knob/footswitch telemetry in the observed setup.
- USB HID:
  - Present and probeable.
  - Not passively emitting telemetry.
  - Possible future research path if we discover the output-report handshake.
- BLE:
  - Proven source for observed hardware telemetry from the previous `c305` / `c306` notification captures.
  - Should be treated as the current source of truth for physical knobs, bank, FX, footswitch press/rotate, save, exit, and capture observation.

## Architecture Implication

The UI should not depend on a specific transport. It should consume a normalized hardware state/event stream from adapters:

- `UsbMidiAdapter`: documented MIDI command send/receive.
- `BleTelemetryAdapter`: Nano panel telemetry from BLE notifications.
- `UsbHidAdapter`: future adapter for HID command/response if the handshake is discovered.
- `NanoHardwareStore`: merges adapter events into in-memory and persisted last-known state.

This keeps knobs, pedals, footswitches, presets, and expression UI independent from whether the data came from USB MIDI, BLE, or future USB HID.
