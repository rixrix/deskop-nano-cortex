/**
 * TauriMidiConnection service — wraps Tauri IPC for all outgoing MIDI commands.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-3]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-SERVICE]
 */
import { connect as connectIpc, sendMidi } from "../../../shared/ipc/commands";

/**
 * Manages MIDI connection state. Wraps Tauri IPC calls.
 */
export class TauriMidiConnection {
  private portName: string | null = null;
  private _connected = false;
  private _error: string | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  get connected(): boolean {
    return this._connected;
  }

  get error(): string | null {
    return this._error;
  }

  async connect(portName: string): Promise<void> {
    this._error = null;
    await connectIpc(portName);
    this.attach(portName);
  }

  attach(portName: string): void {
    this.portName = portName;
    this._connected = true;
  }

  disconnect(): void {
    this.portName = null;
    this._connected = false;
    this.onDisconnectCallback?.();
  }

  onDisconnect(cb: () => void): void {
    this.onDisconnectCallback = cb;
  }

  async send(data: number[]): Promise<void> {
    if (!this.portName) {
      throw new Error("Not connected");
    }
    try {
      await sendMidi(this.portName, data);
    } catch (err) {
      this._error = String(err);
      throw err;
    }
  }

  private channelIndex(channel: number): number {
    return Math.max(1, Math.min(16, channel)) - 1;
  }

  /** Program Change — send PC 0-63 on MIDI channel 1-16. */
  async sendProgramChange(programNumber: number, channel = 1): Promise<void> {
    const program = Math.max(0, Math.min(63, programNumber));
    await this.send([0xc0 | this.channelIndex(channel), program]);
  }

  /** Control Change — send CC number/value on MIDI channel 1-16. */
  async sendControlChange(ccNumber: number, value: number, channel = 1): Promise<void> {
    const cc = Math.max(0, Math.min(127, ccNumber));
    const v = Math.max(0, Math.min(127, value));
    await this.send([0xb0 | this.channelIndex(channel), cc, v]);
  }

  /** Documented preset recall abstraction. */
  async recallPreset(programNumber: number, channel = 1): Promise<void> {
    await this.sendProgramChange(programNumber, channel);
  }

  /** Documented FX slot abstraction: slot 1-5 maps to CC 37-41. */
  async setFxSlotEnabled(slotIndex: number, enabled: boolean, channel = 1): Promise<void> {
    const cc = 36 + Math.max(1, Math.min(5, slotIndex));
    await this.sendControlChange(cc, enabled ? 127 : 0, channel);
  }

  /** Tuner: CC43 127=on, 0=off. */
  async setTunerEnabled(enabled: boolean, channel = 1): Promise<void> {
    await this.sendControlChange(43, enabled ? 127 : 0, channel);
  }

  /** Tap tempo: momentary CC42. */
  async sendTapTempo(channel = 1): Promise<void> {
    await this.sendControlChange(42, 127, channel);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 35));
    await this.sendControlChange(42, 0, channel);
  }

  /** Expression pedal: CC1 value 0-127. */
  async setExpression(value: number, channel = 1): Promise<void> {
    await this.sendControlChange(1, value, channel);
  }

  /** Backward-compatible aliases. */
  async switchPreset(preset: number, channel = 1): Promise<void> {
    await this.recallPreset(preset, channel);
  }

  async toggleEffect(cc: number, on: boolean, channel = 1): Promise<void> {
    await this.sendControlChange(cc, on ? 127 : 0, channel);
  }

  async tapTempo(channel = 1): Promise<void> {
    await this.sendTapTempo(channel);
  }
}
