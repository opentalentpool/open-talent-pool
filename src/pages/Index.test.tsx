import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";
import Index from "./Index";

describe("Index", () => {
  it("apresenta uma home editorial com mensagem clara e sem copy meta de produto", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Index />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: /descoberta técnica aberta, com leitura clara desde a primeira busca/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/busca aberta para recrutadores\. presença pública sob controle do profissional/i)).toBeInTheDocument();
    expect(screen.getByText(/presença pública sob controle, sem pressão para aparecer de qualquer jeito/i)).toBeInTheDocument();
    expect(screen.getAllByText(/publicar perfil com critério/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/buscar com sinal real/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /o que entra na busca são informações profissionais\. o contato por e-mail só aparece para recrutadores autenticados quando o profissional libera esse canal/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/a home deve refletir o produto como ele opera/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sem virar um bloco lateral perdido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/promessa vazia/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /a leitura pública precisa ser útil sem transformar contato pessoal em isca/i,
      }),
    ).toHaveClass("surface-dark-title");
  });

  it("mostra o banner de preferências de cookies no primeiro acesso", () => {
    render(
      <CookieConsentProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CookieConsentBanner />
          <Index />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(screen.getByRole("heading", { name: /preferências de cookies/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /aceitar armazenamento opcional/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar só com o essencial/i })).toBeInTheDocument();
  });
});
