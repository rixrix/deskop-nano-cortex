---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "2.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:19:30.000Z"
tags: ["overview", "desktop-nano-cortex", "tauri", "rust", "midi", "ble", "traceability"]
---

# Desktop Nano Cortex — Project Overview

> Governing spec. Defines the spec taxonomy, traceability rules, and the routing index
> that maps every owned source surface to the zone spec that documents it. Graduated on
> 2026-06-13 from the single sprint brief now archived at
> [`docs/specs/archive/01-deskop-nano-cortex.md`](../archive/01-deskop-nano-cortex.md).

## References

- **Archived sprint brief**: [`../archive/01-deskop-nano-cortex.md`](../archive/01-deskop-nano-cortex.md) — original single-document SDD (spec + design + tasks)
- **Journal**: [`../archive/journal.md`](../archive/journal.md) — append-only decision history
- **USB debugging notes**: [`../archive/usb-debugging.md`](../archive/usb-debugging.md)

---

## Problem Statement

Desktop Nano Cortex is a cross-platform Tauri 2.x + Rust + React/TS desktop controller for the
Neural DSP Nano Cortex. It is an honest device-first live control surface: outgoing Program
Change / Control Change commands are explicit, USB availability is monitored, and captured BLE
state stays provisional/instrumented until project hardware evidence graduates it.

The spec tree must stay a living, 1:1 map of the as-built code so that a future agent making a
surgical change (e.g. "fix BLE disconnect cleanup" or "relabel an experimental panel") can find
the owning zone spec, its owned files, and its tests before reading implementation code.

---

## User Stories

### Primary Users

Maintainers and AI coding agents working in this repository.

### Stories

**As an** AI agent
**I want** to resolve any source file to its governing spec via a `@see` link
**So that** I can change behavior from the right living document instead of grepping the tree.

**As a** maintainer
**I want** spec folders numbered by category with insertion gaps
**So that** new zones slot in without renumbering existing specs.

**As a** contributor
**I want** experimental/provisional surfaces flagged in both code and spec
**So that** the honest-state rule (no fictitious editor) is enforced, not just aspirational.

---

## Requirements

### Functional Requirements

| ID   | Requirement                                                                                                                                                                            | Priority    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-1 | All non-trivial source files carry a top-level `@see` doc-comment linking to their governing zone `spec.md` + `design.md`.                                                             | Must Have   |
| FR-2 | Spec folders use 3-digit ranged numbering by category (see Appendix), spaced to allow insertion without renumbering.                                                                   | Must Have   |
| FR-3 | Each zone spec owns a disjoint set of source files; the routing index below is the authoritative owner map.                                                                            | Must Have   |
| FR-4 | Node IDs are zone-local: `[FR-x]`/`[NFR-x]` restart per `spec.md`, `[DES-*]` anchors are unique within a `design.md`.                                                                  | Must Have   |
| FR-5 | Each zone `tasks.md` keeps a Work Sessions table as its last section (append-only).                                                                                                    | Must Have   |
| FR-6 | Cross-cutting living behavior uses numbered `900–999` specs; one-off decisions use `docs/adr/` (none yet).                                                                             | Should Have |
| FR-7 | Code/spec alignment is bidirectional: code `@see` resolves to existing zone IDs, and zone specs list their owned files.                                                                | Must Have   |
| FR-8 | Experimental/provisional surfaces are either gated behind `EXPERIMENTAL_FEATURES` or explicitly labelled when intentionally always visible; each zone spec must state the actual gate. | Must Have   |

### Non-Functional Requirements

| ID    | Requirement                                                       | Target                |
| ----- | ----------------------------------------------------------------- | --------------------- |
| NFR-1 | `@see` targets resolve to existing document paths and node IDs.   | Enforced in review/CI |
| NFR-2 | Zone specs are scannable before source reading (Agent Entry Map). | Required for agent DX |
| NFR-3 | The tree reflects as-built code, not aspirational future work.    | Living-doc invariant  |

---

## Acceptance Criteria

- [ ] Every owned `.rs`/`.ts`/`.tsx` file resolves to exactly one zone via the routing index.
- [ ] Inserting a zone between `100` and `110` uses `105`, never renumbers.
- [ ] `001-overview` is the singleton routing/rules doc.
- [ ] Code `@see` links point at numbered zone specs, never the archived sprint brief.
- [ ] Experimental/provisional surfaces (`ProtocolLab`, `DesktopEditor`, `PedalWorkbench`) are flagged in code + spec, with the actual gate/labelling behavior documented in the owning zone.

---

## Non-Goals

- Feature requirements (each zone spec owns its own).
- Re-stating the archived sprint brief; it is history, not living truth.
- Full BLE preset/parameter editing before the captured command families are verified (see `110-backend-midi-ble`).

---

## Dependencies

- The afx code-traceability convention (`@see docs/specs/<zone>/spec.md [FR-x]`).
- Toolchain + CI conventions live in `400-dx-tooling` and `500-ci-release`.

---

## Appendix

### Spec Numbering Ranges

```text
001        — overview singleton: taxonomy, traceability rules, routing index
100–199    — backend (Rust / Tauri host)
  100      — USB MIDI (midir) + MIDI port/message/device domain
  110      — BLE (btleplug) + provisional Nano protocol + nano_state domain
  120      — Tauri IPC bridge (commands/events/mapping) + app state
  130      — platform integration (tray/shortcuts/settings) + footswitch/settings domain + shell
200–299    — frontend (React / TS / Tailwind webview)
  200      — control surface (app, components, hooks, services, feature models)
  210      — IPC contracts + shared providers (logs/theme) + shared UI + feature flags
400–499    — DX (linting, formatting, testing)
500–599    — CI / release
900–999    — reserved for cross-cutting living behavior
```

### Routing Index (authoritative owner map)

| Zone                                                                    | Spec                  | Owns (primary source)                                                                                                                                                                         |
| ----------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [100-backend-midi-usb](../100-backend-midi-usb/spec.md)                 | USB MIDI              | `backend/src/infrastructure/midi/{port_manager,connection,listener}.rs`, `backend/src/domain/{port,midi_message,device}.rs`, `backend/src/bin/nano_usb_*probe.rs`                             |
| [110-backend-midi-ble](../110-backend-midi-ble/spec.md)                 | BLE + protocol RE     | `backend/src/infrastructure/midi/{ble,ble_debug,ble_decoder,ble_inspector,ble_sync,port_watchdog}.rs`, `backend/src/domain/nano_state.rs`, `backend/src/bin/nano_ble_*probe.rs`, `tools/`     |
| [120-backend-ipc](../120-backend-ipc/spec.md)                           | IPC bridge            | `backend/src/ipc/{commands,events,mapping,mod}.rs`, `backend/src/app/{state,config,error,mod}.rs`                                                                                             |
| [130-backend-platform](../130-backend-platform/spec.md)                 | Platform + shell      | `backend/src/platform/{tray,shortcuts,settings_store,mod}.rs`, `backend/src/domain/{footswitch,settings}.rs`, `backend/src/{lib,main}.rs`, `backend/tauri.conf.json`, `backend/capabilities/` |
| [200-frontend-control-surface](../200-frontend-control-surface/spec.md) | React control surface | `frontend/src/app/*`, `frontend/src/features/midi/**`                                                                                                                                         |
| [210-frontend-ipc-contracts](../210-frontend-ipc-contracts/spec.md)     | IPC + shared          | `frontend/src/shared/**`                                                                                                                                                                      |
| [400-dx-tooling](../400-dx-tooling/spec.md)                             | DX/tests              | eslint/prettier/rustfmt configs, `vitest.config.ts`, `playwright.config.ts`, `*.test.*`, `e2e/**`, package scripts                                                                            |
| [500-ci-release](../500-ci-release/spec.md)                             | CI/release            | `.github/workflows/**`, Tauri bundle config                                                                                                                                                   |
| [900-project-governance](../900-project-governance/spec.md)             | Project governance    | agent/contributor docs, manual smoke runbooks, release runbooks, Apache/license metadata, dependency governance, truthfulness guardrails                                                      |

### Traceability Contract

All spec-driven source files carry a top-level doc-comment:

```rust
//! USB MIDI port enumeration and Nano Cortex name matching.
//!
//! @see docs/specs/100-backend-midi-usb/spec.md [FR-1]
//! @see docs/specs/100-backend-midi-usb/design.md [DES-USB-PORTS]
```

```typescript
/**
 * Tauri command contracts — single source of truth for IPC calls.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-1]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-IPC-COMMANDS]
 */
```

At least one `@see` MUST point at a `spec.md` or `design.md` under `docs/specs/`. Multiple zone-local
IDs are space-separated on one line. Inline annotations (`TODO`/`FIXME`/`NOTE`) that encode spec-driven
work must also carry a `@see`.

### Glossary

| Term            | Definition                                                           |
| --------------- | -------------------------------------------------------------------- |
| Zone spec       | A `docs/specs/XXX-name/` folder with spec.md, design.md, tasks.md    |
| Agent Entry Map | Appendix routing future agents to owned files, commands, and tests   |
| Living document | `spec.md`/`design.md` representing current truth, not logs           |
| `@see`          | Doc-comment linking a source file to its governing zone spec         |
| Honest state    | UI distinguishes documented MIDI, observed MIDI, and provisional BLE |
