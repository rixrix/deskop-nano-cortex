/**
 * Browser-side Tauri IPC mock for Playwright E2E.
 *
 * Playwright cannot drive the production Tauri WebView + Rust backend, so we run the
 * React app in headless Chromium and stub `window.__TAURI_INTERNALS__` (the surface
 * that `@tauri-apps/api` `invoke()` and the event system both call) before any app
 * script runs. Tests drive the app through `window.__nanoMock`.
 *
 * @see docs/specs/400-dx-tooling/spec.md [FR-11]
 * @see docs/specs/400-dx-tooling/design.md [DES-DX-E2E]
 */
import type { Page } from "@playwright/test";

export interface NanoMockBridge {
  /** Every invoke({cmd,args}) the app made, in order. */
  invokeLog: Array<{ cmd: string; args: unknown }>;
  /** Convenience: the args of every `send_midi` call. */
  sentMidi: () => Array<{ portName: string; bytes: number[] }>;
  /** Push a backend event (e.g. "midi://message") to all registered listeners. */
  emit: (event: string, payload: unknown) => void;
}

export interface NanoMockOptions {
  connection?: "disconnected" | "usb" | "bluetooth" | "full";
  presetNames?: string[];
}

declare global {
  interface Window {
    __nanoMock: NanoMockBridge;
  }
}

/** Install the Tauri IPC mock as an init script (runs before the app boots). */
export async function installTauriMock(page: Page, options: NanoMockOptions = {}): Promise<void> {
  await page.addInitScript((mockOptions: NanoMockOptions) => {
    const listeners: Record<string, Array<{ id: number; rid: number }>> = {};
    const callbacks: Record<number, (msg: unknown) => void> = {};
    const invokeLog: Array<{ cmd: string; args: unknown }> = [];
    const initialConnection = mockOptions.connection ?? "disconnected";
    const device = {
      state: initialConnection === "disconnected" ? "disconnected" : "connected",
      name:
        initialConnection === "disconnected"
          ? null
          : initialConnection === "bluetooth" || initialConnection === "full"
            ? "Neural DSP Nano Cortex (Bluetooth)"
            : "Nano Cortex",
    };
    let nextRid = 1;
    let nextEventId = 1;

    const ports =
      initialConnection === "bluetooth"
        ? []
        : [{ id: "usb:Nano Cortex", name: "Nano Cortex", direction: "out", kind: "usb" }];
    const capabilityStatus = "unverified";
    const caps = {
      activePresetSlot: capabilityStatus,
      presetName: capabilityStatus,
      bank: capabilityStatus,
      captureAssignment: capabilityStatus,
      irAssignment: capabilityStatus,
      preFxSlot1: capabilityStatus,
      preFxSlot2: capabilityStatus,
      postFxSlot1: capabilityStatus,
      postFxSlot2: capabilityStatus,
      postFxSlot3: capabilityStatus,
      bypassFlags: capabilityStatus,
      expressionValues: capabilityStatus,
      notes: [] as string[],
    };
    const nanoState = {
      connectionStatus: "disconnected",
      syncMode: "disconnected-preview",
      activePresetSlot: null,
      presetName: null,
      bank: null,
      captureAssignment: null,
      irAssignment: null,
      slots: {
        preFx1: {
          role: "pre-fx-1",
          loadedName: null,
          modelId: "D18C01",
          modelIdNumeric: 101585,
          bypassed: null,
          active: true,
          confirmed: true,
        },
        preFx2: {
          role: "pre-fx-2",
          loadedName: null,
          modelId: "03",
          modelIdNumeric: 3,
          bypassed: null,
          active: true,
          confirmed: true,
        },
        postFx1: {
          role: "post-fx-1",
          loadedName: null,
          modelId: "ED36",
          modelIdNumeric: 60726,
          bypassed: null,
          active: true,
          confirmed: true,
        },
        postFx2: {
          role: "post-fx-2",
          loadedName: null,
          modelId: "FE2E",
          modelIdNumeric: 65070,
          bypassed: null,
          active: true,
          confirmed: true,
        },
        postFx3: {
          role: "post-fx-3",
          loadedName: null,
          modelId: "C73E",
          modelIdNumeric: 51006,
          bypassed: null,
          active: true,
          confirmed: true,
        },
      },
      expressionValue: null,
      expressionPercent: null,
      ampGain: initialConnection === "disconnected" ? null : 118,
      ampLevel: initialConnection === "disconnected" ? null : 96,
      ampBass: initialConnection === "disconnected" ? null : 127,
      ampMid: initialConnection === "disconnected" ? null : 112,
      ampTreble: initialConnection === "disconnected" ? null : 126,
      footswitchAssignments:
        initialConnection === "disconnected" ? null : { ia: 3, ib: 7, iia: 10, iib: 16 },
      captureSlot: initialConnection === "disconnected" ? null : 1,
      captureVolume: initialConnection === "disconnected" ? null : 127,
      gateOn: initialConnection === "disconnected" ? null : true,
      cabIrOn: initialConnection === "disconnected" ? null : true,
      stale: false,
      provisional: true,
    };
    const presetNames =
      mockOptions.presetNames ??
      Array.from({ length: 64 }, (_, index) => `Device Preset ${index + 1}`);

    function handleInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
      invokeLog.push({ cmd, args });
      switch (cmd) {
        case "plugin:event|listen": {
          const event = String(args.event);
          (listeners[event] ||= []).push({ id: nextEventId, rid: Number(args.handler) });
          return Promise.resolve(nextEventId++);
        }
        case "plugin:event|unlisten":
          return Promise.resolve();
        case "list_ports":
          return Promise.resolve(ports);
        case "get_state":
          return Promise.resolve(device.state);
        case "get_device_name":
          return Promise.resolve(device.name);
        case "connect":
          device.state = "connected";
          device.name = (args.deviceName as string) || "Nano Cortex";
          return Promise.resolve("connected:" + device.name);
        case "disconnect":
          device.state = "disconnected";
          device.name = null;
          return Promise.resolve();
        case "send_midi":
          return Promise.resolve();
        case "ble_scan":
          device.state = "connected";
          device.name = "Nano Cortex (BLE)";
          return Promise.resolve(["Nano Cortex"]);
        case "ble_ping":
          return Promise.resolve("BLE adapter available");
        case "get_nano_state":
          return Promise.resolve(nanoState);
        case "request_state_dump":
          return Promise.resolve(nanoState);
        case "request_metadata":
          return Promise.resolve({
            presetNames,
            captureNames: ["Watt Custom Clean 7"],
            irNames: ["412 CA Stand OS A V30 '01"],
            packetCount: presetNames.length >= 64 ? 18 : 2,
            payloadBytes: presetNames.length * 18,
            expectedPresetSlots: 64,
            presetSlots: Math.min(presetNames.length, 64),
            usablePresetNames: presetNames.filter((name) => String(name).trim()).length,
            complete: presetNames.length >= 64,
          });
        case "request_fx_params":
          // A generous fixed-length array so models with many parameters (e.g. Dual Reverse
          // Delay's 22) render fully synced rather than mostly "not yet synced". Index 0 stays
          // 0.5 ("50.0 %") since a test asserts on that value for the default selected slot.
          return Promise.resolve({
            values: [
              0.5, 0.25, 0.75, 0.4, 0.6, 0.8, 0.15, 0.9, 0.35, 0.55, 0.7, 0.2, 0.45, 0.65, 0.1,
              0.85, 0.3, 0.95, 0.05, 0.5, 0.6, 0.4,
            ],
          });
        case "request_cab_ir_params":
          return Promise.resolve({
            levelDb: -3.5,
            highPassHz: 80,
            lowPassHz: 9500,
            mic: "Ribbon 160",
            position: 3,
          });
        case "set_capture_slot":
          nanoState.captureSlot = Number(args.slot);
          nanoState.captureAssignment =
            nanoState.captureSlot > 0 ? `Capture ${nanoState.captureSlot}` : null;
          return Promise.resolve();
        case "set_cab_ir_slot":
          nanoState.irAssignment = Number(args.slot) > 0 ? `IR ${Number(args.slot)}` : null;
          nanoState.cabIrOn = Number(args.slot) > 0;
          return Promise.resolve();
        case "set_gate_enabled":
          nanoState.gateOn = Boolean(args.enabled);
          return Promise.resolve();
        case "set_gate_reduction":
          return Promise.resolve();
        case "set_capture_volume":
          nanoState.captureVolume = 128;
          return Promise.resolve();
        case "set_cab_ir_param":
          return Promise.resolve();
        case "set_cab_ir_mic_position":
          return Promise.resolve();
        case "set_footswitch_assignments":
          return Promise.resolve();
        case "set_fx_model":
          return Promise.resolve();
        case "save_active_preset":
          return Promise.resolve();
        case "get_ble_capabilities":
          return Promise.resolve(caps);
        case "get_ble_debug_log":
          return Promise.resolve([]);
        case "trace_marker":
          return Promise.resolve();
        case "export_settings_json":
          return Promise.resolve(args.path);
        case "import_settings_json":
          return Promise.resolve("{}");
        default:
          return Promise.resolve(null);
      }
    }

    // The surface @tauri-apps/api invoke() + event system call into.
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args: Record<string, unknown>) => handleInvoke(cmd, args),
      transformCallback: (cb: (msg: unknown) => void) => {
        const id = nextRid++;
        callbacks[id] = cb;
        return id;
      },
      unregisterCallback: (id: number) => {
        delete callbacks[id];
      },
      convertFileSrc: (p: string) => p,
    };
    (
      window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: unknown }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };

    window.__nanoMock = {
      invokeLog,
      sentMidi: () =>
        invokeLog
          .filter((e) => e.cmd === "send_midi")
          .map((e) => e.args as { portName: string; bytes: number[] }),
      emit: (event: string, payload: unknown) => {
        for (const l of listeners[event] || []) {
          callbacks[l.rid]?.({ event, id: l.id, payload });
        }
      },
    };
  }, options);
}
