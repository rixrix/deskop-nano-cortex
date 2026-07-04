<!--
@see docs/specs/900-project-governance/spec.md [FR-9] [FR-10]
Keep it honest: documented MIDI is authoritative, BLE decode is provisional.
-->

## Summary

<!-- What and why, in a few lines. -->

## Spec traceability

- [ ] Linked zone spec/design under `docs/specs/` updated — or N/A because: …
- [ ] New/changed source files carry `@see docs/specs/<zone>/spec.md [FR-x]` headers
- [ ] `npm run lint` traceability gate passes

## Verification

- [ ] `npm run verify` green
- [ ] `npm run verify:full` green (required for behavior changes)
- [ ] Hardware smoke run per `docs/runbooks/hardware-smoke.md` with evidence attached (required if MIDI/BLE behavior changed)
- [ ] N/A — no MIDI/BLE behavior change

## Truthfulness guard

- [ ] No claim of full editor, preset sync, parameter sync, or authoritative BLE state anywhere in UI, docs, or notes — unless hardware-verified and spec-linked
- [ ] Experimental BLE surfaces remain labeled provisional

## Screenshots

<!-- If UI changed. Otherwise delete. -->

## Breaking changes

<!-- None, or list them. -->
