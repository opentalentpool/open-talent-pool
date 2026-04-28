import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";
import { LegalDocumentPage } from "./LegalDocumentPage";

const cases = [
  {
    documentKey: "privacyPolicy" as const,
    heading: /política de privacidade/i,
    summary: /autenticação por e-mail com código/i,
  },
  {
    documentKey: "termsOfUse" as const,
    heading: /termos de uso/i,
    summary: /publicação manual do perfil/i,
  },
  {
    documentKey: "cookiesPolicy" as const,
    heading: /política de cookies/i,
    summary: /cookie essencial de sessão/i,
  },
  {
    documentKey: "inclusiveUsePolicy" as const,
    heading: /política de uso inclusivo/i,
    summary: /uso exclusivamente inclusivo/i,
  },
];

describe("LegalDocumentPage", () => {
  it.each(cases)("renderiza %s em formato documental com resumo e metadados públicos", ({ documentKey, heading, summary }) => {
    const { unmount } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LegalDocumentPage documentKey={documentKey} />
      </MemoryRouter>,
    );

    expect(document.body).toHaveClass("legal-document-mode");
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /resumo/i })).toBeInTheDocument();
    expect(screen.getAllByText(summary).length).toBeGreaterThan(0);
    expect(screen.getByText(/versão pública/i)).toBeInTheDocument();
    expect(screen.getByText(/vigência desta versão/i)).toBeInTheDocument();
    expect(screen.getAllByText(/gabriel lopes do nascimento/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /contato@opentalentpool\.org/i })).toHaveAttribute(
      "href",
      "mailto:contato@opentalentpool.org",
    );
    expect(screen.queryByText(/leitura rápida/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pontos centrais desta página no estado atual do opentalentpool 1\.0/i)).not.toBeInTheDocument();

    unmount();

    expect(document.body).not.toHaveClass("legal-document-mode");
  });

  it("explicita nas políticas que a busca inclusiva prioriza sem excluir a base técnica aderente", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LegalDocumentPage documentKey="inclusiveUsePolicy" />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/a busca técnica padrão continua mostrando perfis tecnicamente aderentes, inclusive de grupos minorizados/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/os perfis dentro do escopo afirmativo aparecem primeiro, mas os demais perfis tecnicamente aderentes continuam na mesma lista/i),
    ).toBeInTheDocument();
  });

  it("expõe bases legais, autoatendimento e retenção na política de privacidade", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LegalDocumentPage documentKey="privacyPolicy" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /bases legais por finalidade/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /direitos do titular e autoatendimento/i })).toBeInTheDocument();
    expect(screen.getByText(/exportação em json, exclusão permanente da conta/i)).toBeInTheDocument();
    expect(screen.getByText(/registros de aceite, ledger jurídico mínimo e trilha auditável da busca inclusiva/i)).toBeInTheDocument();
  });

  it("documenta turnstile, draft v2 e a remoção de dados afirmativos da política de cookies", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LegalDocumentPage documentKey="cookiesPolicy" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/professional_profile_draft:v2:\{userId\}/i)).toBeInTheDocument();
    expect(screen.getByText(/não persiste `affirmativeProfile` nem `affirmativeConsentAccepted`/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cloudflare turnstile/i).length).toBeGreaterThan(0);
  });

  it("reforça revogação, auditoria mínima e denúncia na política de uso inclusivo", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LegalDocumentPage documentKey="inclusiveUsePolicy" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/a revogação pode ser feita diretamente no dashboard profissional/i)).toBeInTheDocument();
    expect(screen.getByText(/cada execução da busca inclusiva geram trilha mínima de auditoria/i)).toBeInTheDocument();
    expect(screen.getByText(/denúncias, pedidos de revisão/i)).toBeInTheDocument();
  });

  it("mantém as seções legais em coluna única de leitura", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LegalDocumentPage documentKey="privacyPolicy" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("legal-document-page")).toHaveClass("max-w-4xl");
    expect(screen.getByTestId("legal-document-summary")).toHaveClass("border-b");
    expect(screen.getByTestId("legal-document-sections")).toHaveClass("space-y-10");
  });

  it("expõe a ação de preferências na política de cookies e descreve o cookie de consentimento", async () => {
    const user = userEvent.setup();

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CookieConsentBanner />
          <LegalDocumentPage documentKey="cookiesPolicy" />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(screen.getByText(/open-talent-pool-cookie-consent/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preferências de cookies/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /preferências de cookies/i }));

    expect(screen.getByRole("heading", { name: /preferências de cookies/i })).toBeInTheDocument();
  });
});
