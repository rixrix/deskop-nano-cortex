/**
 * useMidiConnection hook — manages connection lifecycle and polls device state.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-4]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useState, useCallback, useRef, useEffect } from "react";
import type { MidiPort } from "../../../shared/ipc/commands";
import {
  disconnect as disconnectIpc,
  getDeviceName,
  getState,
  listPorts as listPortsIpc,
} from "../../../shared/ipc/commands";
import { onConnected, onDisconnected, onPortsChanged } from "../../../shared/ipc/events";
import { TauriMidiConnection } from "../services/TauriMidiConnection";

export interface UseMidiConnectionReturn {
  connection: TauriMidiConnection;
  isConnected: boolean;
  deviceName: string | null;
  ports: MidiPort[];
  error: string | null;
  connectTo: (portName: string) => Promise<void>;
  adoptConnection: (portName: string) => void;
  disconnect: () => Promise<void>;
  refreshPorts: () => Promise<void>;
}

export function useMidiConnection(): UseMidiConnectionReturn {
  const connRef = useRef(new TauriMidiConnection());
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [ports, setPorts] = useState<MidiPort[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Reactively listen for backend connection/disconnection events ──
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    onConnected((payload) => {
      console.log("[midi] connected event received:", payload);
      connRef.current.attach(payload.name);
      setIsConnected(true);
      setDeviceName(payload.name);
    }).then((fn) => unsubs.push(fn));

    onDisconnected(() => {
      console.log("[midi] disconnected event received");
      connRef.current.disconnect();
      setIsConnected(false);
      setDeviceName(null);
    }).then((fn) => unsubs.push(fn));

    onPortsChanged((payload) => {
      setPorts(payload.ports);
    }).then((fn) => unsubs.push(fn));

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  // ── Polling fallback: sync state from backend every 2s in case events miss ──
  useEffect(() => {
    const poll = async () => {
      try {
        const state = await getState();
        const name = await getDeviceName();
        const connected = state === "connected";
        if (connected) {
          connRef.current.attach(name ?? "Nano Cortex");
        } else {
          connRef.current.disconnect();
        }
        setIsConnected((prev) => {
          if (prev !== connected) {
            console.log(`[midi] poll: state changed ${prev} → ${connected}`);
          }
          return connected;
        });
        setDeviceName(connected ? (name ?? "Nano Cortex") : null);
      } catch {
        // backend may be unavailable between polls — ignore and retry on next tick
      }
    };
    const interval = setInterval(poll, 2000);
    poll(); // initial check
    return () => clearInterval(interval);
  }, []);

  const refreshPorts = useCallback(async () => {
    try {
      const p = await listPortsIpc();
      setPorts(p);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const connectTo = useCallback(async (portName: string) => {
    try {
      setError(null);
      await connRef.current.connect(portName);
      // Imperative fallback — events from backend are the primary source of truth
      setIsConnected(true);
      setDeviceName(portName);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }, []);

  const adoptConnection = useCallback((portName: string) => {
    connRef.current.attach(portName);
    setIsConnected(true);
    setDeviceName(portName);
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectIpc();
    } catch (err) {
      setError(String(err));
    } finally {
      connRef.current.disconnect();
      setIsConnected(false);
      setDeviceName(null);
    }
  }, []);

  return {
    connection: connRef.current,
    isConnected,
    deviceName,
    ports,
    error,
    connectTo,
    adoptConnection,
    disconnect,
    refreshPorts,
  };
}
