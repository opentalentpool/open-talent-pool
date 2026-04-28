import type { ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppThemeProvider } from "@/components/AppThemeProvider";
import { ThemeModeControl } from "@/components/ThemeModeControl";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";
import { THEME_STORAGE_KEY } from "@/lib/theme";

declare global {
  interface Window {
    __setPreferredColorScheme: (scheme: "light" | "dark") => void;
  }
}

function renderWithThemeProvider(ui: ReactNode, consentDecision: "accepted" | "rejected" | "unset" = "accepted") {
  return render(
    <CookieConsentProvider initialDecision={consentDecision}>
      <AppThemeProvider>{ui}</AppThemeProvider>
    </CookieConsentProvider>,
  );
}

describe("ThemeModeControl", () => {
  it("inicia em claro, alterna para escuro e persiste a preferência local", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithThemeProvider(<ThemeModeControl variant="dropdown" />);

    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: /abrir opções de tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /escuro/i }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    unmount();
    document.documentElement.className = "";

    renderWithThemeProvider(<ThemeModeControl variant="dropdown" />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
  });

  it("mantém a opção sistema e segue a preferência do dispositivo quando ela muda", async () => {
    const user = userEvent.setup();

    renderWithThemeProvider(<ThemeModeControl variant="dropdown" />);

    await user.click(screen.getByRole("button", { name: /abrir opções de tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /sistema/i }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(screen.getByRole("button", { name: /seleção atual: sistema/i })).toBeInTheDocument();

    await act(async () => {
      window.__setPreferredColorScheme("dark");
    });

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
  });

  it("mantém o controle visível, mas bloqueia a persistência quando o armazenamento opcional foi recusado", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    renderWithThemeProvider(<ThemeModeControl variant="list" />, "rejected");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(screen.getByText(/lembrar o tema neste navegador exige armazenamento opcional/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /claro/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /escuro/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /sistema/i })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /escuro/i }));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
