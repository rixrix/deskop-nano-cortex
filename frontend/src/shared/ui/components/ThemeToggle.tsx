/**
 * Theme control — a popover that previews each theme as a swatch and folds the
 * high-contrast toggle in as a switch. Replaces the old icon-button + native select.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-24]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-UI]
 */
import { useEffect, useRef, useState } from "react";
import { CaretDownIcon, CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme, type Theme } from "../../hooks/useTheme";

type ThemeItem = { value: Theme; label: string; bg: string | null; tone: string | null };

// Swatch colors mirror each theme's --surface plus a mood tint. Accents are global
// (:root), so only the surface/tone differ per theme.
const THEME_ITEMS: ThemeItem[] = [
  { value: "dark", label: "Dark", bg: "#0c1420", tone: "#38bdf8" },
  { value: "dim", label: "Dim", bg: "#1b1e23", tone: "#94a3b8" },
  { value: "night", label: "Night", bg: "#100c08", tone: "#e0a35e" },
  { value: "light", label: "Light", bg: "#ffffff", tone: "#0ea5e9" },
  { value: "day", label: "Day", bg: "#fffefa", tone: "#d97706" },
  { value: "system", label: "Auto", bg: null, tone: null },
];

const LIGHT_RESOLVED = new Set(["light", "day"]);

function Swatch({ item, selected }: { item: ThemeItem; selected: boolean }) {
  const ring = selected ? "var(--color-cyan-accent)" : "var(--panel-border-light)";
  if (item.value === "system") {
    return (
      <span
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border"
        style={{
          borderColor: ring,
          background: "var(--surface-2)",
          color: "var(--text-secondary)",
        }}
      >
        <MonitorIcon size={11} weight="bold" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="relative grid h-[18px] w-[18px] shrink-0 place-items-center overflow-hidden rounded-md border"
      style={{ borderColor: ring, background: item.bg ?? "var(--surface)" }}
    >
      <span
        className="h-[7px] w-[7px] rounded-full"
        style={{ background: item.tone ?? "var(--text-secondary)" }}
      />
    </span>
  );
}

export function ThemeToggle() {
  const { theme, resolved, highContrast, setTheme, toggleContrast } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentLabel =
    theme === "system" ? "Auto" : resolved.charAt(0).toUpperCase() + resolved.slice(1);
  const TriggerIcon =
    theme === "system" ? MonitorIcon : LIGHT_RESOLVED.has(resolved) ? SunIcon : MoonIcon;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${currentLabel}${highContrast ? ", high contrast on" : ""}`}
        title={`Theme: ${currentLabel}`}
        className="flex h-9 items-center gap-1.5 rounded-lg border px-2.5 transition-colors cursor-pointer"
        style={{
          background: "var(--surface)",
          borderColor: highContrast ? "rgba(212,160,23,0.48)" : "var(--panel-border-light)",
          color: "var(--text-secondary)",
          boxShadow: "inset 0 1px 0 var(--panel-border-light)",
        }}
      >
        <TriggerIcon size={16} weight="bold" aria-hidden="true" />
        <span className="hidden md:inline text-[10px] font-extrabold uppercase tracking-[0.8px]">
          {currentLabel}
        </span>
        <CaretDownIcon size={11} weight="bold" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme options"
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border p-1.5"
          style={{
            background: "var(--surface)",
            borderColor: "var(--panel-border)",
            boxShadow: "0 12px 40px rgba(15,23,42,0.28), inset 0 1px 0 var(--panel-border-light)",
          }}
        >
          <div
            className="px-2 pb-1 pt-1 text-[9px] font-extrabold uppercase tracking-[1px]"
            style={{ color: "var(--text-muted)" }}
          >
            Theme
          </div>
          {THEME_ITEMS.map((item) => {
            const selected = theme === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setTheme(item.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                style={{ color: selected ? "var(--color-cyan-accent)" : "var(--text)" }}
              >
                <Swatch item={item} selected={selected} />
                <span className="flex-1 text-[12px] font-bold">{item.label}</span>
                {selected && <CheckIcon size={13} weight="bold" aria-hidden="true" />}
              </button>
            );
          })}

          <div className="my-1 h-px" style={{ background: "var(--panel-border-light)" }} />

          <button
            type="button"
            role="switch"
            aria-checked={highContrast}
            onClick={toggleContrast}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text)" }}
          >
            <span className="flex-1 text-[12px] font-bold">High contrast</span>
            <span
              className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
              style={{
                background: highContrast ? "var(--color-amber-accent)" : "var(--panel-border)",
              }}
            >
              <span
                className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
                style={{ left: highContrast ? "0.875rem" : "0.125rem" }}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
