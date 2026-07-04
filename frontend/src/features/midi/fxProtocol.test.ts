/**
 * Unit tests for the FX protocol model bridge.
 *
 * @see docs/specs/110-backend-midi-ble/spec.md [FR-20]
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-46]
 */
import { describe, expect, it } from "vitest";
import { getProtocolFxModel, getProtocolFxModelByDeviceId } from "./fxProtocol";

describe("FX protocol model mapping", () => {
  it("maps readback raw ids to display models", () => {
    expect(getProtocolFxModel("D1 8C 01")?.deviceId).toBe("transpose");
    expect(getProtocolFxModel("F336")?.deviceId).toBe("chief-dc2w-st");
  });

  it("maps selectable device ids back to raw protocol ids", () => {
    expect(getProtocolFxModelByDeviceId("transpose")?.rawId).toBe("D18C01");
    expect(getProtocolFxModelByDeviceId("doubler")?.rawId).toBe("8B7D");
    expect(getProtocolFxModelByDeviceId("legendary-87-st")?.rawId).toBe("9427");
  });
});
