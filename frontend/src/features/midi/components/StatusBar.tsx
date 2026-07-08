/**
 * StatusBar component — fixed top navigation bar with connect controls, log toggle, theme toggle,
 * and (when a newer release is known) an update pill.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-7] [FR-42] [FR-48]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import type { ReactNode } from "react";
import {
  ArrowCircleUpIcon,
  ArrowSquareOutIcon,
  BluetoothIcon,
  BroadcastIcon,
  LinkBreakIcon,
  ListDashesIcon,
  UsbIcon,
} from "@phosphor-icons/react";
import { ThemeToggle } from "../../../shared/ui/components/ThemeToggle";
import { openExternal } from "../../../shared/ipc/commands";
// App mark (S05 Rotary Surface). Canonical source: docs/assets/logo/app-icon.svg
// (also drives the desktop bundle icon); this is the frontend-bundled copy.
import appIcon from "../../../assets/app-icon.svg";

const AGENTICFLOWX_URL = "https://agenticflowx.github.io/";

interface StatusBarProps {
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string | null;
  usbControlActive: boolean;
  bleStateActive: boolean;
  statusMsg: string | null;
  error: string | null;
  onConnectUsb: () => void;
  onConnectBle: () => void;
  onDisconnect: () => void | Promise<void>;
  onPingBle: () => void;
  onToggleLogs: () => void;
  logCount: number;
  /** Newer release version (no leading `v`) when known, or null — renders the update pill. */
  updateVersion?: string | null;
  /** Open the About tab, where the release link lives. */
  onShowUpdate?: () => void;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 0 20"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ToolButton({
  title,
  onClick,
  children,
  disabled,
  active,
  activeTone = "cyan",
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  activeTone?: "cyan" | "green";
}) {
  const activeColor =
    activeTone === "green" ? "var(--color-green-accent)" : "var(--color-cyan-accent)";
  const activeBorder = activeTone === "green" ? "rgba(0,170,85,0.42)" : "rgba(0,153,204,0.42)";
  const activeBackground = activeTone === "green" ? "rgba(0,170,85,0.10)" : "rgba(0,153,204,0.10)";
  const activeGlow =
    activeTone === "green" ? "0 0 14px var(--glow-green)" : "0 0 14px var(--glow-cyan)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="h-9 min-w-9 px-2.5 flex items-center justify-center gap-1.5 rounded-xl border transition-all cursor-pointer disabled:cursor-default disabled:opacity-55"
      style={{
        borderColor: active ? activeBorder : "var(--panel-border-light)",
        background: active ? activeBackground : "var(--surface)",
        color: active ? activeColor : "var(--text-secondary)",
        boxShadow: active
          ? `${activeGlow}, inset 0 1px 0 var(--panel-border-light)`
          : "inset 0 1px 0 var(--panel-border-light)",
      }}
    >
      {children}
    </button>
  );
}

export function StatusBar({
  isConnected,
  isConnecting,
  deviceName,
  usbControlActive,
  bleStateActive,
  statusMsg,
  error,
  onConnectUsb,
  onConnectBle,
  onDisconnect,
  onPingBle,
  onToggleLogs,
  logCount,
  updateVersion = null,
  onShowUpdate,
}: StatusBarProps) {
  const stateLabel = isConnecting ? "Scanning" : isConnected ? "Connected" : "Disconnected";
  const stateTitle = error || statusMsg || stateLabel;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-xl"
      style={{ borderColor: "var(--panel-border)", background: "var(--nav-bg)" }}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 sm:px-5 lg:px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={appIcon}
            alt="Nano Cortex control surface"
            className="h-9 w-9 flex-shrink-0 rounded-xl"
          />
          <div className="leading-tight hidden sm:block">
            <span
              className="text-[12px] font-extrabold tracking-wide"
              style={{ color: "var(--text)" }}
            >
              UNOFFICIAL NANO CORTEX
            </span>
            <button
              type="button"
              onClick={() => void openExternal(AGENTICFLOWX_URL).catch(() => {})}
              title="Built with AgenticFlowX — open agenticflowx.github.io"
              className="mt-1 flex w-fit items-center gap-1 rounded-full border border-[rgba(0,153,204,0.3)] bg-[rgba(0,153,204,0.06)] px-1.5 py-0.5 text-[9px] font-bold tracking-[1px] transition-colors hover:border-[rgba(0,153,204,0.5)] hover:bg-[rgba(0,153,204,0.12)]"
              style={{ color: "var(--color-cyan-accent)" }}
            >
              BUILT WITH AGENTICFLOWX
              <ArrowSquareOutIcon size={9} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 items-center justify-center min-w-0 px-4">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
            title={stateTitle}
            style={{
              background: isConnected || isConnecting ? "rgba(0,153,204,0.07)" : "var(--surface)",
              borderColor:
                isConnected || isConnecting ? "rgba(0,153,204,0.28)" : "var(--panel-border-light)",
              color:
                isConnected || isConnecting ? "var(--color-cyan-accent)" : "var(--text-secondary)",
            }}
          >
            {isConnecting ? (
              <Spinner />
            ) : (
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: isConnected ? "var(--color-cyan-accent)" : "var(--text-secondary)",
                  boxShadow: isConnected ? "0 0 8px var(--glow-cyan-strong)" : "none",
                }}
              />
            )}
            <span className="text-[11px] font-extrabold uppercase tracking-[1.2px]">
              {stateLabel}
            </span>
            {deviceName && (
              <span
                className="text-[11px] font-semibold truncate max-w-[220px]"
                style={{ color: "var(--text)" }}
              >
                {deviceName}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {updateVersion && onShowUpdate && (
            <button
              type="button"
              onClick={onShowUpdate}
              title={`Update available — v${updateVersion}. Open About for the release link.`}
              aria-label={`Update available: v${updateVersion}`}
              className="h-9 px-2.5 flex items-center gap-1.5 rounded-xl border transition-all cursor-pointer"
              style={{
                borderColor: "rgba(0,170,85,0.42)",
                background: "rgba(0,170,85,0.10)",
                color: "var(--color-green-accent)",
                boxShadow: "0 0 14px var(--glow-green), inset 0 1px 0 var(--panel-border-light)",
              }}
            >
              <ArrowCircleUpIcon size={16} weight="bold" aria-hidden="true" />
              <span className="hidden sm:inline text-[11px] font-extrabold">
                Update v{updateVersion}
              </span>
            </button>
          )}

          <ToolButton
            onClick={onConnectUsb}
            disabled={isConnecting}
            active={isConnecting || usbControlActive}
            activeTone="green"
            title={
              isConnected ? "Attach/refresh USB MIDI command and log path" : "Connect via USB MIDI"
            }
          >
            <UsbIcon size={16} weight="bold" aria-hidden="true" />
            <span className="hidden sm:inline text-[11px] font-extrabold">USB</span>
          </ToolButton>

          <ToolButton
            onClick={onConnectBle}
            disabled={isConnecting}
            active={isConnecting || bleStateActive}
            activeTone="cyan"
            title={isConnected ? "Attach Bluetooth observation path" : "Connect via Bluetooth"}
          >
            <BluetoothIcon size={16} weight="bold" aria-hidden="true" />
            <span className="hidden sm:inline text-[11px] font-extrabold">Bluetooth</span>
          </ToolButton>

          <ToolButton onClick={onPingBle} title="Scan Bluetooth availability">
            <BroadcastIcon size={16} weight="bold" aria-hidden="true" />
            <span className="hidden xl:inline text-[11px] font-extrabold">SCAN</span>
          </ToolButton>

          {isConnected && (
            <button
              type="button"
              onClick={onDisconnect}
              className="h-9 px-3 flex items-center gap-1.5 text-[11px] font-extrabold rounded-xl border transition-all cursor-pointer"
              style={{
                borderColor: "rgba(221,34,68,0.28)",
                background: "rgba(221,34,68,0.06)",
                color: "var(--color-red-accent)",
              }}
            >
              <LinkBreakIcon size={16} weight="bold" aria-hidden="true" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          )}

          <div className="w-px h-6 mx-0.5" style={{ background: "var(--panel-border)" }} />

          <ToolButton onClick={onToggleLogs} title="Show logs" active={logCount > 0}>
            <span className="relative flex items-center justify-center">
              <ListDashesIcon size={16} weight="bold" aria-hidden="true" />
              {logCount > 0 && (
                <span
                  className="absolute -top-2 -right-2 w-4 h-4 flex items-center justify-center text-[8px] font-bold rounded-full"
                  style={{ background: "var(--color-cyan-accent)", color: "var(--text-inverse)" }}
                >
                  {logCount > 9 ? "9+" : logCount}
                </span>
              )}
            </span>
            <span className="hidden lg:inline text-[11px] font-extrabold">Logs</span>
          </ToolButton>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
