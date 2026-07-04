/**
 * DeviceSyncStatus — type provider for last-inbound/last-outbound USB MIDI telemetry.
 *
 * Exports the shared `UsbInboundSync` type consumed by DeviceStatusDock, which
 * renders the live telemetry itself.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-37]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-MONITOR]
 */
export interface UsbInboundSync {
  kind: "pc" | "cc" | "raw";
  summary: string;
  detail: string;
  channel: number;
  bytes: number[];
  timestampMs: number;
}
