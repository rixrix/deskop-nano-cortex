/**
 * Error code to user-facing message mapping.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-18]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-IPC-ERRORS]
 */

const ERROR_MESSAGES: Record<string, string> = {
  "MIDI error": "A MIDI communication error occurred. Check your connection.",
  "BLE error": "Bluetooth connection failed. Try again or use USB.",
  "Not found": "Device not found. Is your Nano Cortex connected?",
  "Already connected": "Already connected to a device. Disconnect first.",
  "Not connected": "Not connected to any device. Connect first.",
};

export function formatError(raw: string): string {
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(key)) return msg;
  }
  return raw;
}
