/* eslint-disable react-refresh/only-export-components -- provider + hook are intentionally colocated in one module */
/**
 * LogProvider and useLogs context pair — subscribes to `midi://log`, exposes log entries,
 * and forwards each entry to Clarity telemetry (no-op when telemetry is disabled).
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-19] [FR-28]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-LOGS] [DES-SHARED-TELEMETRY]
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { sendClarityLog } from "../telemetry/clarity";

export interface LogEntry {
  ts: number;
  level: "debug" | "info" | "success" | "warn" | "error";
  message: string;
}

interface LogContextValue {
  logs: LogEntry[];
  clear: () => void;
}

const MAX_LOGS = 500;

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
    sendClarityLog(entry);
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
  }, []);

  // Listen for log events from the Rust backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const unlisten = await listen<LogEntry>("midi://log", (event) => {
        if (!cancelled) addLog(event.payload);
      });
      if (!cancelled) unlistenRef.current = unlisten;
    })();
    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [addLog]);

  return <LogContext.Provider value={{ logs, clear }}>{children}</LogContext.Provider>;
}

export function useLogs(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLogs must be used within LogProvider");
  return ctx;
}
