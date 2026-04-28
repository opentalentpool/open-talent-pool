import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";
import { INTERNAL_OPERATIONS_ADMIN_EMAIL } from "@/lib/internal-accounts.js";
import { PENDING_AUTH_STORAGE_KEY } from "@/lib/pending-auth-session";
import Auth from "./Auth";

const mockSignUp = vi.fn();
const mockRequestCode = vi.fn();
const mockVerify = vi.fn();
const mockRefreshUser = vi.fn();
const mockNavigate = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockUseIsMobile = vi.fn();

function buildPendingAuthSession(overrides: Partial<Record<string, string | number>> = {}) {
  return JSON.stringify({
    challengeId: "0123456789abcdef0123456789abcdef",
    email: "ada@example.com",
    intent: "signin",
    expiresAt: Date.now() + 5 * 60 * 1000,
    updatedAt: Date.now(),
    ...overrides,
  });
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signOut: vi.fn(),
    refreshUser: mockRefreshUser,
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("@/lib/api", () => ({
  default: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      requestCode: (...args: unknown[]) => mockRequestCode(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe("Auth", () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockRequestCode.mockReset();
    mockVerify.mockReset();
    mockRefreshUser.mockReset();
    mockNavigate.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockUseIsMobile.mockReturnValue(false);
  });

  it("apresenta a etapa inicial com copy pública mais fluida", () => {
    render(
      <MemoryRouter initialEntries={["/entrar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /siga para a próxima etapa sem cair em um fluxo desnecessário/i })).toBeInTheDocument();
    expect(screen.getByText(/a busca pública funciona sem cadastro obrigatório para a primeira visita/i)).toBeInTheDocument();
  });

  it("prioriza o painel de cadastro no mobile e usa a copy curta da rota /cadastro", () => {
    mockUseIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/cadastro"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    const actionHeading = screen.getByRole("heading", { name: /criar conta sem etapa sobrando/i });
    const supportHeading = screen.getByRole("heading", { name: /conta quando fizer sentido\. busca continua aberta\./i });

    expect(screen.getByText(/a busca já está aberta\. a conta entra quando você quiser editar perfil, salvar buscas ou organizar favoritos\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /criar conta com e-mail/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /explorar agora/i })).toBeInTheDocument();
    expect(screen.queryByText(/siga para a próxima etapa sem cair em um fluxo desnecessário/i)).not.toBeInTheDocument();
    expect(actionHeading.compareDocumentPosition(supportHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("abre o formulário com a aba Cadastrar ativa quando o fluxo mobile de /cadastro avança", async () => {
    const user = userEvent.setup();
    mockUseIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/cadastro"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /criar conta com e-mail/i }));

    expect(screen.getByRole("tab", { name: /^Cadastrar$/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByLabelText(/nome completo/i)).toBeInTheDocument();
  });

  it("não exibe autoexplicações de fluxo quando nenhum estado contextual aconteceu", () => {
    render(
      <MemoryRouter initialEntries={["/entrar?tipo=profissional"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/o status do envio aparece aqui no card/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/se houver falha no envio/i)).not.toBeInTheDocument();
  });

  it("abre /cadastro com a aba Cadastrar ativa quando a rota já entra no passo de autenticação", async () => {
    mockUseIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/cadastro?tipo=profissional"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/proteção anti-bot local ativa/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Cadastrar$/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByLabelText(/nome completo/i)).toBeInTheDocument();
  });

  it("retoma um desafio pendente salvo no mesmo dispositivo e reabre a verificação", async () => {
    window.localStorage.setItem(PENDING_AUTH_STORAGE_KEY, buildPendingAuthSession());

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter initialEntries={["/entrar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByText(/use o código enviado para/i)).toBeInTheDocument();
    expect(screen.getByText(/ada@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Entrar$/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("button", { name: /verificar código/i })).toBeInTheDocument();
  });

  it("prioriza a intenção de cadastro ao retomar um desafio pendente", async () => {
    mockUseIsMobile.mockReturnValue(true);
    window.localStorage.setItem(PENDING_AUTH_STORAGE_KEY, buildPendingAuthSession({ intent: "signup" }));

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter initialEntries={["/cadastro"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByText(/use o código enviado para/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Cadastrar$/i })).toHaveAttribute("data-state", "active");
  });

  it("limpa o desafio pendente salvo ao voltar para a etapa inicial", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PENDING_AUTH_STORAGE_KEY, buildPendingAuthSession());

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter initialEntries={["/entrar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByText(/use o código enviado para/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /voltar ao início/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem(PENDING_AUTH_STORAGE_KEY)).toBeNull();
    });
    expect(screen.getByRole("heading", { name: /siga para a próxima etapa sem cair em um fluxo desnecessário/i })).toBeInTheDocument();
  });

  it("limpa o desafio pendente salvo depois de verificar o código com sucesso", async () => {
    const user = userEvent.setup();
    mockVerify.mockResolvedValue({ user: null });
    mockRefreshUser.mockResolvedValue(undefined);
    window.localStorage.setItem(PENDING_AUTH_STORAGE_KEY, buildPendingAuthSession());

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter initialEntries={["/entrar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByText(/use o código enviado para/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /verificar código/i }));

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith({
        challengeId: "0123456789abcdef0123456789abcdef",
        code: "123456",
      });
      expect(window.localStorage.getItem(PENDING_AUTH_STORAGE_KEY)).toBeNull();
    });
  });

  it("redireciona a conta administrativa interna direto para o dashboard ignorando o next", async () => {
    const user = userEvent.setup();
    mockVerify.mockResolvedValue({
      user: {
        id: 1,
        name: "Operações internas",
        email: INTERNAL_OPERATIONS_ADMIN_EMAIL,
        role: "administrator",
        activeRole: "administrator",
        availableRoles: ["administrator"],
        is_verified: true,
      },
    });
    mockRefreshUser.mockResolvedValue(undefined);
    window.localStorage.setItem(
      PENDING_AUTH_STORAGE_KEY,
      buildPendingAuthSession({
        email: INTERNAL_OPERATIONS_ADMIN_EMAIL,
      }),
    );

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter initialEntries={["/entrar?next=/buscar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByText(/use o código enviado para/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /verificar código/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
    expect(mockNavigate).not.toHaveBeenCalledWith("/buscar");
  });

  it("remove um desafio expirado do storage e volta a pedir um novo código", async () => {
    window.localStorage.setItem(
      PENDING_AUTH_STORAGE_KEY,
      buildPendingAuthSession({
        expiresAt: Date.now() - 1_000,
      }),
    );

    render(
      <CookieConsentProvider initialDecision="accepted">
        <MemoryRouter initialEntries={["/entrar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByText(/solicite um novo código para continuar/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(PENDING_AUTH_STORAGE_KEY)).toBeNull();
    expect(screen.queryByText(/use o código enviado para/i)).not.toBeInTheDocument();
  });

  it("ignora o desafio pendente salvo quando o armazenamento opcional foi recusado", async () => {
    window.localStorage.setItem(PENDING_AUTH_STORAGE_KEY, buildPendingAuthSession());

    render(
      <CookieConsentProvider initialDecision="rejected">
        <MemoryRouter initialEntries={["/entrar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(screen.getByRole("heading", { name: /siga para a próxima etapa sem cair em um fluxo desnecessário/i })).toBeInTheDocument();
    expect(screen.queryByText(/use o código enviado para/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PENDING_AUTH_STORAGE_KEY)).toBeNull();
  });

  it("avisa no passo de verificação quando a retomada local foi desativada por rejeição de cookies", async () => {
    const user = userEvent.setup();

    mockRequestCode.mockResolvedValue({
      ok: true,
      message: "Se o e-mail puder receber um código, ele chegará em instantes.",
      challengeId: "0123456789abcdef0123456789abcdef",
    });

    render(
      <CookieConsentProvider initialDecision="rejected">
        <MemoryRouter initialEntries={["/entrar?tipo=profissional"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Auth />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByText(/proteção anti-bot local ativa/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/email/i), "gaellopes@protonmail.com");
    await user.click(screen.getByRole("button", { name: /enviar código/i }));

    expect(await screen.findByText(/sem armazenamento opcional, este código não será retomado se você recarregar ou fechar a página/i)).toBeInTheDocument();
  });

  it("mantém a falha de envio visível dentro do card de autenticação", async () => {
    const user = userEvent.setup();

    mockRequestCode.mockRejectedValue({
      error: "email_delivery_failed",
      message: "Nao conseguimos enviar o codigo por e-mail agora. Revise o SMTP e tente novamente.",
    });

    render(
      <MemoryRouter initialEntries={["/entrar?tipo=profissional"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/proteção anti-bot local ativa/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/email/i), "gaellopes@protonmail.com");
    await user.click(screen.getByRole("button", { name: /enviar código/i }));

    expect(mockRequestCode).toHaveBeenCalledWith({
      email: "gaellopes@protonmail.com",
      captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
    });
    expect(await screen.findByText(/não conseguimos enviar o código/i)).toBeInTheDocument();
    expect(screen.getByText(/o envio por e-mail falhou no servidor/i)).toBeInTheDocument();
    expect(screen.queryByText(/use o código enviado para/i)).not.toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith("Não conseguimos enviar o código");
  });

  it("bloqueia o cadastro sem aceite dos termos e da política de privacidade", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/cadastro?tipo=profissional"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/proteção anti-bot local ativa/i)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /cadastrar/i }));
    await user.type(screen.getByLabelText(/nome completo/i), "Ada Lovelace");
    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /criar conta e enviar código/i }));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/você precisa aceitar os termos de uso e a política de privacidade para criar a conta/i),
    ).toBeInTheDocument();
  });

  it("envia o aceite legal no signup e mantém os links públicos acessíveis", async () => {
    const user = userEvent.setup();

    mockSignUp.mockResolvedValue({
      ok: true,
      message: "Se o e-mail puder receber um código, ele chegará em instantes.",
      challengeId: "0123456789abcdef0123456789abcdef",
    });

    render(
      <MemoryRouter initialEntries={["/cadastro?tipo=profissional"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/proteção anti-bot local ativa/i)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /cadastrar/i }));
    await user.type(screen.getByLabelText(/nome completo/i), "Ada Lovelace");
    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");

    const termsLink = screen.getAllByRole("link", { name: /termos de uso/i }).find((link) => link.getAttribute("target") === "_blank");
    const privacyLink = screen
      .getAllByRole("link", { name: /política de privacidade/i })
      .find((link) => link.getAttribute("target") === "_blank");

    expect(termsLink).toHaveAttribute("href", "/termos");
    expect(termsLink).toHaveAttribute("target", "_blank");
    expect(privacyLink).toHaveAttribute("href", "/privacidade");
    expect(privacyLink).toHaveAttribute("target", "_blank");

    await user.click(screen.getByRole("checkbox", { name: /aceito os termos de uso e a política de privacidade/i }));
    await user.click(screen.getByRole("button", { name: /criar conta e enviar código/i }));

    expect(mockSignUp).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
      acceptedLegalPolicies: true,
      captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
    });
  });
});
