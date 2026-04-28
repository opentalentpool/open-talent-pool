import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type ResolvedThemeMode = "light" | "dark";
type ThemeMode = "light" | "dark" | "system";

interface AppThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedThemeMode;
  setTheme: (theme: ThemeMode) => void;
  canPersistPreference: boolean;
}

const AppThemeContext = createContext<AppThemeContextValue>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
  canPersistPreference: true,
});

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getSystemTheme(): ResolvedThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): ThemeMode {
  if (!canUseLocalStorage()) {
    return "light";
  }

  const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);

  return storedValue === "dark" || storedValue === "system" || storedValue === "light" ? storedValue : "light";
}

export const AppThemeProvider = ({ children }: PropsWithChildren) => {
  const { canUseOptionalStorage } = useCookieConsent();
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [systemTheme, setSystemTheme] = useState<ResolvedThemeMode>(() => getSystemTheme());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!canUseOptionalStorage) {
      setThemeState("light");

      if (canUseLocalStorage()) {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      }

      return;
    }

    setThemeState(readStoredTheme());
  }, [canUseOptionalStorage]);

  const resolvedTheme: ResolvedThemeMode = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    if (!canUseOptionalStorage) {
      setThemeState("light");
      return;
    }

    setThemeState(nextTheme);

    if (canUseLocalStorage()) {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    }
  }, [canUseOptionalStorage]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      canPersistPreference: canUseOptionalStorage,
    }),
    [canUseOptionalStorage, resolvedTheme, setTheme, theme],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
};

export function useAppTheme() {
  return useContext(AppThemeContext);
}
