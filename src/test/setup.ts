import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

type PreferredColorScheme = "light" | "dark";
type MatchMediaListener = (event: MediaQueryListEvent) => void;

declare global {
  interface Window {
    __setPreferredColorScheme: (scheme: PreferredColorScheme) => void;
  }
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}

    unobserve() {}

    disconnect() {}
  };
}

let preferredColorScheme: PreferredColorScheme = "light";
const colorSchemeListeners = new Set<MatchMediaListener>();

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => {
      const isColorSchemeQuery = query === "(prefers-color-scheme: dark)";
      const listeners = isColorSchemeQuery ? colorSchemeListeners : new Set<MatchMediaListener>();
      const mediaQueryList: MediaQueryList = {
        media: query,
        matches: isColorSchemeQuery ? preferredColorScheme === "dark" : false,
        onchange: null,
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
        addEventListener: (_type, listener) => {
          if (typeof listener === "function") {
            listeners.add(listener as MatchMediaListener);
          }
        },
        removeEventListener: (_type, listener) => {
          if (typeof listener === "function") {
            listeners.delete(listener as MatchMediaListener);
          }
        },
        dispatchEvent: () => true,
      };

      return mediaQueryList;
    },
  });
}

Object.defineProperty(window, "__setPreferredColorScheme", {
  writable: true,
  value: (scheme: PreferredColorScheme) => {
    preferredColorScheme = scheme;
    const event = {
      matches: scheme === "dark",
      media: "(prefers-color-scheme: dark)",
    } as MediaQueryListEvent;

    colorSchemeListeners.forEach((listener) => listener(event));
  },
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  preferredColorScheme = "light";
  window.__setPreferredColorScheme("light");
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
});
