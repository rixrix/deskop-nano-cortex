/**
 * Unit tests for the documented-MIDI helper byte encoding.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-3]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../shared/ipc/commands", () => ({
  connect: vi.fn().mockResolvedValue("connected"),
  sendMidi: vi.fn().mockResolvedValue(undefined),
}));

import { TauriMidiConnection } from "./TauriMidiConnection";
import { connect as connectIpc, sendMidi } from "../../../shared/ipc/commands";

const PORT = "Nano Cortex";

function connected() {
  const conn = new TauriMidiConnection();
  conn.attach(PORT);
  return conn;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connection lifecycle", () => {
  it("connect() calls the IPC and marks itself connected", async () => {
    const conn = new TauriMidiConnection();
    expect(conn.connected).toBe(false);
    await conn.connect(PORT);
    expect(connectIpc).toHaveBeenCalledWith(PORT);
    expect(conn.connected).toBe(true);
  });

  it("send() throws when not connected", async () => {
    const conn = new TauriMidiConnection();
    await expect(conn.send([0xc0, 0x00])).rejects.toThrow("Not connected");
    expect(sendMidi).not.toHaveBeenCalled();
  });

  it("disconnect() clears state and fires the callback", () => {
    const conn = connected();
    const cb = vi.fn();
    conn.onDisconnect(cb);
    conn.disconnect();
    expect(conn.connected).toBe(false);
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe("Program Change encoding", () => {
  it("sends 0xC0 + program on channel 1 by default", async () => {
    await connected().sendProgramChange(5);
    expect(sendMidi).toHaveBeenCalledWith(PORT, [0xc0, 5]);
  });

  it("clamps the program to the documented 0-63 range", async () => {
    const conn = connected();
    await conn.sendProgramChange(99);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xc0, 63]);
    await conn.sendProgramChange(-4);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xc0, 0]);
  });

  it("encodes the MIDI channel into the status nibble (1-16)", async () => {
    const conn = connected();
    await conn.sendProgramChange(0, 16);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xcf, 0]); // 0xC0 | 15
    await conn.sendProgramChange(0, 99); // clamps to 16 -> nibble 15
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xcf, 0]);
    await conn.sendProgramChange(0, 0); // clamps to 1 -> nibble 0
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xc0, 0]);
  });
});

describe("Control Change encoding", () => {
  it("sends 0xB0 + cc + value, clamping both to 0-127", async () => {
    const conn = connected();
    await conn.sendControlChange(37, 200);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xb0, 37, 127]);
  });

  it("maps FX slots 1-5 to CC 37-41", async () => {
    const conn = connected();
    await conn.setFxSlotEnabled(1, true);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xb0, 37, 127]);
    await conn.setFxSlotEnabled(5, false);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xb0, 41, 0]);
  });

  it("clamps the FX slot index to 1-5", async () => {
    const conn = connected();
    await conn.setFxSlotEnabled(9, true);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xb0, 41, 127]); // slot 5
  });

  it("tuner is CC43 and expression is CC1", async () => {
    const conn = connected();
    await conn.setTunerEnabled(true);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xb0, 43, 127]);
    await conn.setExpression(64);
    expect(sendMidi).toHaveBeenLastCalledWith(PORT, [0xb0, 1, 64]);
  });

  it("tap tempo sends a momentary 127 then 0 on CC42", async () => {
    await connected().sendTapTempo();
    expect(sendMidi).toHaveBeenNthCalledWith(1, PORT, [0xb0, 42, 127]);
    expect(sendMidi).toHaveBeenNthCalledWith(2, PORT, [0xb0, 42, 0]);
  });
});
