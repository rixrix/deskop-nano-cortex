# Third-Party Notices

Desktop Nano Cortex is licensed under the Apache License, Version 2.0 (see `LICENSE`).
It includes material derived from the third-party projects listed below. Each project's
copyright and license notice is reproduced here as required by its license.

This file is the authoritative attribution record referenced by
`docs/specs/110-backend-midi-ble/spec.md` [NFR-9] and
`docs/specs/100-backend-midi-usb/spec.md`.

---

## nano-cortex-web-editor

- **Project:** nano-cortex-web-editor — <https://github.com/choldy/nano-cortex-web-editor>
- **Licence:** MIT
- **Copyright:** © 2026 Nano Cortex Web Editor Contributors

**Use in this project.** Portions of Desktop Nano Cortex's Bluetooth LE command protocol are
derived from `nano-cortex-web-editor`, which reverse-engineered the Nano Cortex private BLE
protocol. The derived material comprises the dump-request frames, the current-state field map, the
write-command byte layouts (SAVE, FX model/float, capture/cab select), and the non-linear parameter
encoders (`captureDbToRaw`, gate offset `+108`, cab level pivot `0.66212219`). This material was
reimplemented in Rust (`backend/src/infrastructure/midi/ble_schema.rs`, `ble_encoder.rs`).

The Bluetooth LE telemetry decoding (expression pedal, control events, FX parameter readback) is
original to Desktop Nano Cortex and is not derived from this project.

```text
MIT License

Copyright (c) 2026 Nano Cortex Web Editor Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## nanoCortexPresetSwitcher (reference implementation)

- **Project:** nanoCortexPresetSwitcher — <https://github.com/AlieksieievOU/nanoCortexPresetSwitcher>
- **Licence:** MIT
- **Copyright:** © 2026 Oleksandr Alieksieiev

**Use in this project.** `nanoCortexPresetSwitcher` was reviewed as a reference for WebMIDI
control-surface behaviour — the device-perspective MIDI port convention (device `OUT` is the
host's input) and reflecting inbound Program Change / CC in the UI, both standard WebMIDI/MIDI-1.0
practices. No source code or protocol material was copied or derived from it; Desktop Nano Cortex
implements this behaviour independently in Rust (`midir`, zone `100`). Its copyright and license
notice are reproduced below in acknowledgement of the reference.

```text
MIT License

Copyright (c) 2026 Oleksandr Alieksieiev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Similar projects surveyed (no material used)

As part of a provenance review (2026-07-15), the following Nano Cortex / Neural DSP
community projects were surveyed. **No source code or protocol material from any of them is
used in Desktop Nano Cortex**; where any wire-level overlap exists it is limited to the
documented MIDI 1.0 standard (Program Change / Control Change). They are listed as a survey
record and in acknowledgement of the wider community effort.

| Project                                                                                                      | Scope                                                             | Overlap with this project                 |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------- |
| [CortexControl](https://github.com/grafster/CortexControl)                                                   | ESP32 touch-display controller for the Nano Cortex                | None                                      |
| [nano-cortex-monitor](https://github.com/naponsatha/nano-cortex-monitor)                                     | USB MIDI capture/monitor research for the Nano Cortex             | Documented MIDI observation (independent) |
| [captain-cortex](https://github.com/feehpadula/captain-cortex)                                               | MIDI Captain footswitch firmware for the Nano Cortex (TRS MIDI)   | Documented MIDI PC/CC only                |
| [Nano-Cortex-Presets-Controller-Support](https://github.com/Dagniele/Nano-Cortex-Presets-Controller-Support) | Preset/controller support material for the Nano Cortex            | None                                      |
| [FourBrain](https://github.com/Pupoff/FourBrain)                                                             | Arduino MIDI control surface for Neural DSP Archetype plugins     | None (different product)                  |
| [OpenCortex](https://github.com/VanIseghemThomas/OpenCortex)                                                 | Quad Cortex homebrew research (file decryption, capture decoding) | None (different device)                   |
