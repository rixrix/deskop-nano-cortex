// Vitest global setup: jest-dom matchers + React tree cleanup between tests.
//
// @see docs/specs/400-dx-tooling/spec.md [FR-10]
// @see docs/specs/400-dx-tooling/design.md [DES-DX-UNIT]
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

function installLocalStorageShim() {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(String(key)) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(String(key));
    },
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: shim,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: shim,
    });
  }
}

if (typeof localStorage === "undefined" || typeof localStorage.clear !== "function") {
  installLocalStorageShim();
}

// Unmount React trees between tests so the jsdom document stays isolated.
afterEach(() => {
  cleanup();
});
