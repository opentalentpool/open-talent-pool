import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";

describe("SiteFooter", () => {
  it("expõe links para as páginas legais públicas", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SiteFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /política de privacidade/i })).toHaveAttribute("href", "/privacidade");
    expect(screen.getByRole("link", { name: /termos de uso/i })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: /política de cookies/i })).toHaveAttribute("href", "/cookies");
    expect(screen.getByRole("link", { name: /política de uso inclusivo/i })).toHaveAttribute("href", "/uso-inclusivo");
  });

  it("mantém a primeira coluna do footer encolhível no mobile para não empurrar o viewport", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SiteFooter />
      </MemoryRouter>,
    );

    const brandColumn = screen
      .getByRole("heading", { name: /descoberta técnica aberta, com contato sob controle do profissional\./i })
      .parentElement;

    expect(brandColumn).toHaveClass("min-w-0");
  });

  it("renderiza a variante document sem bloco promocional", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SiteFooter variant="document" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("site-footer")).toHaveAttribute("data-variant", "document");
    expect(screen.queryByRole("heading", { name: /descoberta técnica aberta, com contato sob controle do profissional\./i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /legal/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /início/i })).toBeInTheDocument();
  });

  it("expõe uma ação pública para reabrir as preferências de cookies", async () => {
    const user = userEvent.setup();

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CookieConsentBanner />
          <SiteFooter />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(screen.queryByRole("heading", { name: /preferências de cookies/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /preferências de cookies/i }));

    expect(screen.getByRole("heading", { name: /preferências de cookies/i })).toBeInTheDocument();
  });
});
