/**
 * Small pill marking a control/surface whose transport (USB command path or Bluetooth
 * device state) is currently unavailable. Rendered only while the transport is missing,
 * so users are never misled into clicking controls that cannot reach the device.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-49]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-UI]
 */
export function TransportBadge({ transport, label }: { transport: "usb" | "ble"; label?: string }) {
  const usb = transport === "usb";
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[1px]"
      style={{
        background: "rgba(212,160,23,0.12)",
        borderColor: "rgba(212,160,23,0.38)",
        color: "var(--color-amber-accent)",
      }}
      title={
        usb
          ? "Requires the USB MIDI command path — connect USB"
          : "Requires Bluetooth device state — connect Bluetooth"
      }
    >
      {label ?? (usb ? "USB needed" : "Bluetooth needed")}
    </span>
  );
}
