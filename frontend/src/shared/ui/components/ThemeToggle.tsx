/**
 * Compound theme control — high-contrast toggle button and theme cycle select.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-24]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-UI]
 */
import { useTheme, type Theme } from "../../hooks/useTheme";

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "night", label: "Night" },
  { value: "dim", label: "Dim" },
  { value: "light", label: "Light" },
  { value: "day", label: "Day" },
  { value: "system", label: "Auto" },
];

export function ThemeToggle() {
  const { theme, resolved, highContrast, setTheme, toggleContrast } = useTheme();
  const resolvedLabel = resolved.charAt(0).toUpperCase() + resolved.slice(1);
  const title = theme === "system" ? `Theme: Auto (${resolvedLabel})` : `Theme: ${resolvedLabel}`;

  return (
    <div
      className="flex h-9 items-center overflow-hidden rounded-xl border"
      style={{
        background: "var(--surface)",
        borderColor: highContrast ? "rgba(212,160,23,0.48)" : "var(--panel-border-light)",
        boxShadow: "inset 0 1px 0 var(--panel-border-light)",
      }}
    >
      <button
        type="button"
        onClick={toggleContrast}
        aria-pressed={highContrast}
        title={highContrast ? "High contrast on" : "High contrast off"}
        className="flex h-full w-9 cursor-pointer select-none items-center justify-center border-r transition-colors"
        style={{
          borderColor: "var(--panel-border-light)",
          background: highContrast ? "rgba(212,160,23,0.10)" : "transparent",
          color: highContrast ? "var(--color-amber-accent)" : "var(--text-secondary)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      </button>

      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
        aria-label={title}
        title={title}
        className="h-full min-w-[78px] cursor-pointer border-0 bg-transparent px-2 text-[10px] font-extrabold uppercase tracking-[0.8px] outline-none"
        style={{
          color: "var(--text-secondary)",
        }}
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
