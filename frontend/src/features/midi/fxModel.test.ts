/**
 * Unit tests for the static FX model: slot catalogue, signal-chain ordering,
 * category/device compatibility, and default assignments.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-32]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, it, expect } from "vitest";
import {
  NANO_FX_SLOT_IDS,
  EDITABLE_FX_SLOT_IDS,
  DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS,
  nanoSignalChain,
  getFxSlot,
  isEditableFxSlot,
  isDeviceAllowedInSlot,
  getDevicesForSlotCategory,
  getLoadedDeviceName,
  getAvailableCategoriesForSlot,
  getAvailableDevicesForSlot,
  normalizeFxSlotAssignments,
} from "./fxModel";

// ─── Signal-chain ordering ───────────────────────────────────────────────────

describe("nanoSignalChain ordering", () => {
  it("contains exactly 8 slots in the documented order", () => {
    expect(nanoSignalChain).toHaveLength(8);
    const ids = nanoSignalChain.map((s) => s.id);
    expect(ids).toEqual([
      "gate",
      "pre-1",
      "pre-2",
      "capture",
      "ir-loader",
      "post-1",
      "post-2",
      "post-3",
    ]);
  });

  it("assigns the correct roleLabels in order", () => {
    const labels = nanoSignalChain.map((s) => s.roleLabel);
    expect(labels).toEqual([
      "Gate",
      "Pre FX 1",
      "Pre FX 2",
      "Capture",
      "IR Loader",
      "Post FX 1",
      "Post FX 2",
      "Post FX 3",
    ]);
  });

  it("matches NANO_FX_SLOT_IDS order exactly", () => {
    const chainIds = nanoSignalChain.map((s) => s.id);
    expect(chainIds).toEqual([...NANO_FX_SLOT_IDS]);
  });

  it("marks only the five editable slots as editable", () => {
    const editableIds = nanoSignalChain.filter((s) => s.editable).map((s) => s.id);
    expect(editableIds).toEqual([...EDITABLE_FX_SLOT_IDS]);
  });

  it("fixed slots have fixedLoadedName, editable slots do not", () => {
    for (const slot of nanoSignalChain) {
      if (!slot.editable) {
        expect(slot.fixedLoadedName).toBeDefined();
      } else {
        expect(slot.fixedLoadedName).toBeUndefined();
      }
    }
  });

  it("editable slots have a midiCc assigned", () => {
    for (const slot of nanoSignalChain) {
      if (slot.editable) {
        expect(typeof slot.midiCc).toBe("number");
      }
    }
  });
});

// ─── getFxSlot ───────────────────────────────────────────────────────────────

describe("getFxSlot", () => {
  it("returns the correct slot for each id", () => {
    for (const id of NANO_FX_SLOT_IDS) {
      const slot = getFxSlot(id);
      expect(slot.id).toBe(id);
    }
  });

  it("returns a fallback (gate) for an unknown id", () => {
    // Cast to bypass TypeScript narrowing for the runtime fallback test.
    const slot = getFxSlot("nonexistent" as Parameters<typeof getFxSlot>[0]);
    expect(slot.id).toBe("gate");
  });
});

// ─── isEditableFxSlot ────────────────────────────────────────────────────────

describe("isEditableFxSlot", () => {
  it("returns true for all editable slot ids", () => {
    for (const id of EDITABLE_FX_SLOT_IDS) {
      expect(isEditableFxSlot(id)).toBe(true);
    }
  });

  it("returns false for non-editable slot ids", () => {
    expect(isEditableFxSlot("gate")).toBe(false);
    expect(isEditableFxSlot("capture")).toBe(false);
    expect(isEditableFxSlot("ir-loader")).toBe(false);
  });
});

// ─── isDeviceAllowedInSlot ───────────────────────────────────────────────────

describe("isDeviceAllowedInSlot", () => {
  it("returns false for non-editable slots", () => {
    expect(isDeviceAllowedInSlot("obsessive-drive", "gate")).toBe(false);
    expect(isDeviceAllowedInSlot("obsessive-drive", "capture")).toBe(false);
    expect(isDeviceAllowedInSlot("obsessive-drive", "ir-loader")).toBe(false);
  });

  it("allows guitar-overdrive devices in pre-1 but not post-1", () => {
    expect(isDeviceAllowedInSlot("obsessive-drive", "pre-1")).toBe(true);
    expect(isDeviceAllowedInSlot("obsessive-drive", "post-1")).toBe(false);
  });

  it("allows reverb devices only in Post FX 3", () => {
    expect(isDeviceAllowedInSlot("room", "post-1")).toBe(false);
    expect(isDeviceAllowedInSlot("room", "post-2")).toBe(false);
    expect(isDeviceAllowedInSlot("room", "post-3")).toBe(true);
    expect(isDeviceAllowedInSlot("room", "pre-1")).toBe(false);
    expect(isDeviceAllowedInSlot("room", "pre-2")).toBe(false);
  });

  it("enforces the Transpose special rule: only allowed in pre-1", () => {
    expect(isDeviceAllowedInSlot("transpose", "pre-1")).toBe(true);
    expect(isDeviceAllowedInSlot("transpose", "pre-2")).toBe(false);
    expect(isDeviceAllowedInSlot("transpose", "post-1")).toBe(false);
  });

  it("allows delay devices only in Post FX 2", () => {
    expect(isDeviceAllowedInSlot("analog-delay", "post-1")).toBe(false);
    expect(isDeviceAllowedInSlot("analog-delay", "post-2")).toBe(true);
    expect(isDeviceAllowedInSlot("analog-delay", "post-3")).toBe(false);
  });

  it("allows modulation devices only in Post FX 1", () => {
    expect(isDeviceAllowedInSlot("chief-dc2w-st", "post-1")).toBe(true);
    expect(isDeviceAllowedInSlot("tremolo", "post-2")).toBe(false);
    expect(isDeviceAllowedInSlot("tremolo", "post-3")).toBe(false);
    expect(isDeviceAllowedInSlot("chief-dc2w-st", "pre-1")).toBe(false);
  });

  it("allows eq in both pre and post sections", () => {
    expect(isDeviceAllowedInSlot("parametric-3", "pre-1")).toBe(true);
    expect(isDeviceAllowedInSlot("parametric-3", "pre-2")).toBe(true);
    expect(isDeviceAllowedInSlot("parametric-3", "post-1")).toBe(true);
  });

  it("keeps post utility models in their hardware-compatible slots", () => {
    expect(isDeviceAllowedInSlot("doubler", "post-1")).toBe(true);
    expect(isDeviceAllowedInSlot("doubler", "post-2")).toBe(false);
    expect(isDeviceAllowedInSlot("doubler", "pre-1")).toBe(false);
    expect(isDeviceAllowedInSlot("legendary-87-st", "post-2")).toBe(true);
    expect(isDeviceAllowedInSlot("legendary-87-st", "pre-1")).toBe(false);
  });
});

// ─── getDevicesForSlotCategory ───────────────────────────────────────────────

describe("getDevicesForSlotCategory", () => {
  it("returns an empty array for an invalid category/slot pairing", () => {
    // reverb is not valid in pre-1
    expect(getDevicesForSlotCategory("pre-1", "reverb")).toEqual([]);
  });

  it("returns only the Transpose device for pitch in pre-1", () => {
    const devices = getDevicesForSlotCategory("pre-1", "pitch");
    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe("transpose");
  });

  it("returns no pitch devices for pre-2 (Transpose is pre-1 only)", () => {
    expect(getDevicesForSlotCategory("pre-2", "pitch")).toEqual([]);
  });

  it("returns reverb devices for post-3", () => {
    const devices = getDevicesForSlotCategory("post-3", "reverb");
    expect(devices.length).toBeGreaterThan(0);
    for (const d of devices) {
      expect(d.category).toBe("reverb");
    }
  });

  it("does not return reverb devices for post-1", () => {
    expect(getDevicesForSlotCategory("post-1", "reverb")).toEqual([]);
  });

  it("returns an empty array for gate (non-editable, no categories)", () => {
    expect(getDevicesForSlotCategory("gate", "utility")).toEqual([]);
  });
});

// ─── getAvailableCategoriesForSlot ───────────────────────────────────────────

describe("getAvailableCategoriesForSlot", () => {
  it("returns empty for non-editable slots", () => {
    expect(getAvailableCategoriesForSlot("gate")).toEqual([]);
    expect(getAvailableCategoriesForSlot("capture")).toEqual([]);
    expect(getAvailableCategoriesForSlot("ir-loader")).toEqual([]);
  });

  it("pre-1 includes pitch but pre-2 does not", () => {
    const pre1 = getAvailableCategoriesForSlot("pre-1");
    const pre2 = getAvailableCategoriesForSlot("pre-2");
    expect(pre1).toContain("pitch");
    expect(pre2).not.toContain("pitch");
  });

  it("post slots expose only their compatible effect families", () => {
    expect(getAvailableCategoriesForSlot("post-1")).toEqual(["eq", "modulation"]);
    expect(getAvailableCategoriesForSlot("post-2")).toEqual(["eq", "delay"]);
    expect(getAvailableCategoriesForSlot("post-3")).toEqual(["eq", "reverb"]);
  });
});

// ─── getAvailableDevicesForSlot ──────────────────────────────────────────────

describe("getAvailableDevicesForSlot", () => {
  it("returns no devices for non-editable slots", () => {
    expect(getAvailableDevicesForSlot("gate")).toHaveLength(0);
    expect(getAvailableDevicesForSlot("capture")).toHaveLength(0);
  });

  it("all returned devices are actually allowed in that slot", () => {
    for (const id of EDITABLE_FX_SLOT_IDS) {
      const devices = getAvailableDevicesForSlot(id);
      for (const d of devices) {
        expect(isDeviceAllowedInSlot(d.id, id)).toBe(true);
      }
    }
  });
});

// ─── getLoadedDeviceName ─────────────────────────────────────────────────────

describe("getLoadedDeviceName", () => {
  it("returns fixedLoadedName for non-editable slots", () => {
    expect(getLoadedDeviceName("gate", DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS)).toBe("Input Gate");
    expect(getLoadedDeviceName("capture", DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS)).toBe(
      "Neural Capture",
    );
    expect(getLoadedDeviceName("ir-loader", DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS)).toBe(
      "IR Loader / Cab",
    );
  });

  it("returns the device name for editable slots given valid assignments", () => {
    // DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS maps pre-1 -> rodent-drive
    expect(getLoadedDeviceName("pre-1", DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS)).toBe("Rodent Drive");
    expect(getLoadedDeviceName("pre-2", DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS)).toBe("Bass Wah");
    expect(getLoadedDeviceName("post-2", DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS)).toBe(
      "Digital Delay / Standard Delay",
    );
    expect(getLoadedDeviceName("post-3", DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS)).toBe("Ambience");
  });

  it("falls back to first compatible device when assignment is not allowed", () => {
    // Assign a reverb device to pre-1, which only accepts pre-fx categories
    const bad = { ...DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS, "pre-1": "room" as const };
    const name = getLoadedDeviceName("pre-1", bad as Parameters<typeof getLoadedDeviceName>[1]);
    // The fallback is the first available device in pre-1
    const firstAvailable = getAvailableDevicesForSlot("pre-1")[0];
    expect(name).toBe(firstAvailable?.name ?? "No compatible device");
  });
});

// ─── DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS ─────────────────────────────────────

describe("DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS", () => {
  it("covers all five editable slots", () => {
    const keys = Object.keys(DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS);
    expect(keys.sort()).toEqual([...EDITABLE_FX_SLOT_IDS].sort());
  });

  it("every default assignment is valid for its slot", () => {
    for (const id of EDITABLE_FX_SLOT_IDS) {
      const deviceId = DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS[id];
      expect(isDeviceAllowedInSlot(deviceId, id)).toBe(true);
    }
  });
});

// ─── normalizeFxSlotAssignments ──────────────────────────────────────────────

describe("normalizeFxSlotAssignments", () => {
  it("returns the same valid assignments unchanged", () => {
    const normalized = normalizeFxSlotAssignments(DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS);
    expect(normalized["pre-1"]).toBe(DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS["pre-1"]);
    expect(normalized["post-3"]).toBe(DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS["post-3"]);
  });

  it("replaces invalid assignments with a valid fallback for that slot", () => {
    const bad = {
      ...DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS,
      "pre-1": "room" as const, // reverb → not allowed in pre-1
    };
    const normalized = normalizeFxSlotAssignments(
      bad as Parameters<typeof normalizeFxSlotAssignments>[0],
    );
    expect(isDeviceAllowedInSlot(normalized["pre-1"], "pre-1")).toBe(true);
  });
});
