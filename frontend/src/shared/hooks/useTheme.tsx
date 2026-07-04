/* eslint-disable react-refresh/only-export-components -- provider + hook are intentionally colocated in one module */
/**
 * ThemeProvider and useTheme context pair — manages theme selection and high-contrast mode.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-21]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-THEME]
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Theme = "light" | "dark" | "night" | "day" | "dim" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;
type HighContrast = boolean;

interface ThemeContextValue {
  theme: Theme;
  resolved: ResolvedTheme;
  highContrast: HighContrast;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleContrast: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "desktop-nano-cortex-theme";
const CONTRAST_KEY = "desktop-nano-cortex-hc";
const THEMES: readonly Theme[] = ["dark", "night", "dim", "light", "day", "system"];

function isTheme(value: string): value is Theme {
  return THEMES.includes(value as Theme);
}

function getStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function getStoredTheme(): Theme {
  const stored = getStored(STORAGE_KEY, "system");
  return isTheme(stored) ? stored : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [highContrast, setHC] = useState<HighContrast>(
    () => getStored(CONTRAST_KEY, "false") === "true",
  );

  const resolve = useCallback((t: Theme): ResolvedTheme => {
    if (t === "system") {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return t;
  }, []);

  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(theme));

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      localStorage.setItem(STORAGE_KEY, t);
      setResolved(resolve(t));
    },
    [resolve],
  );

  // Cycle through the practical stage/day modes.
  const toggleTheme = useCallback(() => {
    const next: Record<Theme, Theme> = {
      dark: "night",
      night: "dim",
      dim: "light",
      light: "day",
      day: "system",
      system: "dark",
    };
    setTheme(next[theme]);
  }, [theme, setTheme]);

  const toggleContrast = useCallback(() => {
    setHC((v) => {
      const next = !v;
      localStorage.setItem(CONTRAST_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") setResolved(resolve("system"));
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, resolve]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.toggleAttribute("data-high-contrast", highContrast);
  }, [resolved, highContrast]);

  return (
    <ThemeContext.Provider
      value={{ theme, resolved, highContrast, setTheme, toggleTheme, toggleContrast }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
