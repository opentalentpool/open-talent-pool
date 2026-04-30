import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Search from "./Search";
import { AFFIRMATIVE_POLICY_VERSION } from "@/lib/affirmative-config.js";

const mockSearch = vi.fn();
const mockGetFavorites = vi.fn();
const mockCreateSavedSearch = vi.fn();
const mockGetAffirmativePolicyStatus = vi.fn();
const mockAcceptAffirmativePolicy = vi.fn();
const mockSearchAffirmative = vi.fn();
const mockUseAuth = vi.fn();
const mockSwitchActiveRole = vi.fn();
const mockEnableRole = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/api", () => ({
  default: {
    profiles: {
      search: (...args: unknown[]) => mockSearch(...args),
    },
    recruiter: {
      getFavorites: (...args: unknown[]) => mockGetFavorites(...args),
      createSavedSearch: (...args: unknown[]) => mockCreateSavedSearch(...args),
      getAffirmativeSearchPolicyStatus: (...args: unknown[]) => mockGetAffirmativePolicyStatus(...args),
      acceptAffirmativeSearchPolicy: (...args: unknown[]) => mockAcceptAffirmativePolicy(...args),
      searchAffirmativeProfiles: (...args: unknown[]) => mockSearchAffirmative(...args),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe("Search", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockGetFavorites.mockReset();
    mockCreateSavedSearch.mockReset();
    mockGetAffirmativePolicyStatus.mockReset();
    mockAcceptAffirmativePolicy.mockReset();
    mockSearchAffirmative.mockReset();
    mockUseAuth.mockReset();
    mockSwitchActiveRole.mockReset();
    mockEnableRole.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockGetAffirmativePolicyStatus.mockResolvedValue({
      accepted: false,
      acceptedAt: null,
      policyVersion: AFFIRMATIVE_POLICY_VERSION,
    });
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: mockSwitchActiveRole,
      enableRole: mockEnableRole,
    });
  });

  it("sincroniza os filtros com a URL e carrega resultados reais", async () => {
    const user = userEvent.setup();

    mockSearch.mockResolvedValue({
      items: [
        {
          id: 1,
          name: "Ada Lovelace",
          publicSlug: "ada-lovelace-1",
          headline: "Frontend Engineer",
          bioExcerpt: "React e design systems.",
          city: "São Paulo",
          state: "SP",
          seniority: "pleno",
          workModels: ["remoto", "hibrido"],
          openToOpportunities: true,
          skills: ["React", "TypeScript"],
          publishedAt: "2026-04-20T12:00:00.000Z",
          updatedAt: "2026-04-20T12:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    render(
      <MemoryRouter initialEntries={["/buscar?q=react&state=SP"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/1 perfil público/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /buscar talentos publicados/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        /filtre por sinais reais: palavras-chave, senioridade, estado, modelo de trabalho e disponibilidade explícita/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("react")).toBeInTheDocument();
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/remoto, híbrido/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/idioma/i), "Inglês");
    await user.type(screen.getByLabelText(/certificação/i), "AWS");
    await user.type(screen.getByLabelText(/formação/i), "Software");

    await waitFor(() => {
      expect(mockSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: "react",
          state: "SP",
          language: "Inglês",
          certification: "AWS",
          education: "Software",
          page: 1,
          pageSize: 20,
        }),
      );
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "react",
        state: "SP",
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it("mostra estado vazio útil quando não há resultados", async () => {
    mockSearch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(
      <MemoryRouter initialEntries={["/buscar?q=rust"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/nenhum perfil público corresponde aos filtros atuais/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /limpar filtros/i }).length).toBeGreaterThan(0);
  });

  it("mostra mensagem de erro quando a busca falha", async () => {
    mockSearch.mockRejectedValue({
      error: "server_error",
    });

    render(
      <MemoryRouter initialEntries={["/buscar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/não conseguimos carregar a busca agora/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/server_error/i)).toBeInTheDocument();
    });
  });

  it("salva uma busca com alerta diário por padrão", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 2,
        name: "Rachel Recruiter",
        email: "rachel@example.com",
        role: "recruiter",
        activeRole: "recruiter",
        availableRoles: ["recruiter"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: mockSwitchActiveRole,
      enableRole: mockEnableRole,
    });
    mockSearch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    mockGetFavorites.mockResolvedValue({ favorites: [] });
    mockCreateSavedSearch.mockResolvedValue({
      savedSearch: {
        id: 1,
        name: "Busca: react",
        criteria: {
          q: "react",
          seniority: "",
          workModel: "",
          state: "SP",
          openToOpportunities: false,
        },
        alertFrequency: "daily",
        createdAt: "2026-04-24T12:00:00.000Z",
        updatedAt: "2026-04-24T12:00:00.000Z",
        lastAlertSentAt: null,
      },
    });

    render(
      <MemoryRouter initialEntries={["/buscar?q=react&state=SP"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /buscar talentos publicados/i });
    await user.click(screen.getByRole("button", { name: /^salvar busca$/i }));
    await user.click(screen.getAllByRole("button", { name: /^salvar busca$/i }).at(-1)!);

    await waitFor(() => {
      expect(mockCreateSavedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          alertFrequency: "daily",
        }),
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Busca salva com alerta diário.");
  });

  it("permite salvar uma busca sem alerta", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 2,
        name: "Rachel Recruiter",
        email: "rachel@example.com",
        role: "recruiter",
        activeRole: "recruiter",
        availableRoles: ["recruiter"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: mockSwitchActiveRole,
      enableRole: mockEnableRole,
    });
    mockSearch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    mockGetFavorites.mockResolvedValue({ favorites: [] });
    mockCreateSavedSearch.mockResolvedValue({
      savedSearch: {
        id: 2,
        name: "Busca: react",
        criteria: {
          q: "react",
          seniority: "",
          workModel: "",
          state: "SP",
          openToOpportunities: false,
        },
        alertFrequency: "disabled",
        createdAt: "2026-04-24T12:00:00.000Z",
        updatedAt: "2026-04-24T12:00:00.000Z",
        lastAlertSentAt: null,
      },
    });

    render(
      <MemoryRouter initialEntries={["/buscar?q=react&state=SP"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /buscar talentos publicados/i });
    await user.click(screen.getByRole("button", { name: /^salvar busca$/i }));
    await user.click(screen.getByRole("combobox", { name: /frequência do alerta/i }));
    await user.click(screen.getByRole("option", { name: /desativado/i }));
    await user.click(screen.getAllByRole("button", { name: /^salvar busca$/i }).at(-1)!);

    await waitFor(() => {
      expect(mockCreateSavedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          alertFrequency: "disabled",
        }),
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Busca salva sem alerta.");
  });

  it("não mostra o modo inclusivo para visitantes", async () => {
    mockSearch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(
      <MemoryRouter initialEntries={["/buscar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /buscar talentos publicados/i });
    expect(screen.queryByText(/busca inclusiva/i)).not.toBeInTheDocument();
  });

  it("exige aceite explícito antes de liberar a busca inclusiva e salva os critérios afirmativos", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 2,
        name: "Rachel Recruiter",
        email: "rachel@example.com",
        role: "recruiter",
        activeRole: "recruiter",
        availableRoles: ["recruiter"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: mockSwitchActiveRole,
      enableRole: mockEnableRole,
    });
    mockSearch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    mockGetFavorites.mockResolvedValue({ favorites: [] });
    mockAcceptAffirmativePolicy.mockResolvedValue({
      accepted: true,
      acceptedAt: "2026-04-26T12:00:00.000Z",
      policyVersion: AFFIRMATIVE_POLICY_VERSION,
    });
    mockSearchAffirmative.mockResolvedValue({
      items: [
        {
          id: 1,
          name: "Ada Lovelace",
          publicSlug: "ada-lovelace-1",
          headline: "Frontend Engineer",
          bioExcerpt: "React e design systems.",
          city: "São Paulo",
          state: "SP",
          seniority: "pleno",
          workModel: "remoto",
          openToOpportunities: true,
          skills: ["React", "TypeScript"],
          publishedAt: "2026-04-20T12:00:00.000Z",
          updatedAt: "2026-04-20T12:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mockCreateSavedSearch.mockResolvedValue({
      savedSearch: {
        id: 99,
        name: "Busca inclusiva",
        criteria: {
          q: "",
          seniority: "",
          workModel: "",
          state: "",
          openToOpportunities: false,
          affirmativeContext: {
            useCase: "vaga_afirmativa",
            vacancyReference: "REQ-123 - Frontend afirmativa",
          },
          affirmativeFilters: {
            genderGroups: ["women"],
            raceGroups: ["black_people"],
            pcdOnly: false,
          },
        },
        alertFrequency: "daily",
        createdAt: "2026-04-24T12:00:00.000Z",
        updatedAt: "2026-04-24T12:00:00.000Z",
        lastAlertSentAt: null,
      },
    });

    render(
      <MemoryRouter initialEntries={["/buscar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /buscar talentos publicados/i });
    const filtersAside = screen.getByText(/refine a leitura da base pública/i).closest("aside");
    const inclusiveToggle = within(filtersAside as HTMLElement).getByRole("button", {
      name: /vagas afirmativas e inclusivas/i,
    });

    expect(filtersAside).toBeTruthy();
    expect(filtersAside?.className).toContain("lg:max-h-[calc(100vh-7rem)]");
    expect(filtersAside?.className).toContain("lg:overflow-y-auto");
    expect(inclusiveToggle).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /confirmo o uso apenas inclusivo/i })).not.toBeInTheDocument();

    await user.click(inclusiveToggle);

    expect(
      screen.getByText(/priorize o escopo afirmativo sem excluir os demais resultados técnicos aderentes/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/regras de uso e responsabilidade operacional/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/esse campo registra a finalidade operacional da filtragem inclusiva/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /política de uso inclusivo/i }).at(0)).toHaveAttribute("href", "/uso-inclusivo");

    await user.click(screen.getByRole("checkbox", { name: /confirmo o uso apenas inclusivo/i }));
    await user.click(screen.getByRole("button", { name: /liberar busca inclusiva/i }));

    expect(mockAcceptAffirmativePolicy).toHaveBeenCalledWith({
      policyVersion: AFFIRMATIVE_POLICY_VERSION,
    });

    expect(screen.getByRole("checkbox", { name: /pessoas lgbtqiapn\+/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /pessoas trans/i })).not.toBeInTheDocument();
    const vacancyReferenceInput = screen.getByLabelText(/referência da vaga/i);

    expect(vacancyReferenceInput.className).toContain("!bg-white/10");
    expect(vacancyReferenceInput.className).toContain("!text-white");

    await user.type(vacancyReferenceInput, "REQ-123 - Frontend afirmativa");
    await user.click(screen.getByRole("checkbox", { name: /mulheres/i }));
    await user.click(screen.getByRole("checkbox", { name: /pessoas negras/i }));
    await user.click(screen.getByRole("button", { name: /executar busca inclusiva/i }));

    await waitFor(() => {
      expect(mockSearchAffirmative).toHaveBeenCalledWith(
        expect.objectContaining({
          affirmativeContext: {
            useCase: "vaga_afirmativa",
            vacancyReference: "REQ-123 - Frontend afirmativa",
          },
          affirmativeFilters: {
            genderGroups: ["women"],
            raceGroups: ["black_people"],
            pcdOnly: false,
          },
        }),
      );
    });

    expect(await screen.findByText(/ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/resultados com priorização inclusiva/i)).toBeInTheDocument();
    expect(
      screen.getByText(/os perfis dentro do escopo afirmativo aparecem primeiro\. os demais perfis tecnicamente aderentes continuam listados em seguida\./i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^salvar busca$/i }));
    await user.click(screen.getAllByRole("button", { name: /^salvar busca$/i }).at(-1)!);

    await waitFor(() => {
      expect(mockCreateSavedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          criteria: expect.objectContaining({
            affirmativeContext: {
              useCase: "vaga_afirmativa",
              vacancyReference: "REQ-123 - Frontend afirmativa",
            },
            affirmativeFilters: {
              genderGroups: ["women"],
              raceGroups: ["black_people"],
              pcdOnly: false,
            },
          }),
        }),
      );
    });
  });

  it("mostra mensagem útil de validação da API em vez do código cru na busca inclusiva", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 2,
        name: "Rachel Recruiter",
        email: "rachel@example.com",
        role: "recruiter",
        activeRole: "recruiter",
        availableRoles: ["recruiter"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: mockSwitchActiveRole,
      enableRole: mockEnableRole,
    });
    mockSearch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    mockGetFavorites.mockResolvedValue({ favorites: [] });
    mockGetAffirmativePolicyStatus.mockResolvedValue({
      accepted: true,
      acceptedAt: "2026-04-26T12:00:00.000Z",
      policyVersion: AFFIRMATIVE_POLICY_VERSION,
    });
    mockSearchAffirmative.mockRejectedValue({
      error: "validation_error",
      issues: [
        {
          path: "affirmativeContext.vacancyReference",
          message: "Informe uma referência curta com pelo menos 2 caracteres.",
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/buscar"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /buscar talentos publicados/i });
    await user.click(screen.getByRole("button", { name: /vagas afirmativas e inclusivas/i }));
    await user.type(screen.getByLabelText(/referência da vaga/i), "RQ");
    await user.click(screen.getByRole("checkbox", { name: /mulheres/i }));
    await user.click(screen.getByRole("button", { name: /executar busca inclusiva/i }));

    expect(await screen.findByText(/informe uma referência curta com pelo menos 2 caracteres\./i)).toBeInTheDocument();
    expect(screen.queryByText(/^validation_error$/i)).not.toBeInTheDocument();
  });

  it("pede troca para o perfil recrutador quando a conta já tem esse papel habilitado", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 3,
        name: "Ada Lead",
        email: "ada@example.com",
        role: "professional",
        activeRole: "professional",
        availableRoles: ["professional", "recruiter"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: mockSwitchActiveRole.mockResolvedValue({
        id: 3,
        name: "Ada Lead",
        email: "ada@example.com",
        role: "recruiter",
        activeRole: "recruiter",
        availableRoles: ["professional", "recruiter"],
        is_verified: true,
      }),
      enableRole: mockEnableRole,
    });
    mockSearch.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(
      <MemoryRouter initialEntries={["/buscar?q=react"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/buscar" element={<Search />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /buscar talentos publicados/i });
    await user.click(screen.getByRole("button", { name: /^salvar busca$/i }));

    expect(await screen.findByRole("heading", { name: /trocar para perfil recrutador/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /trocar perfil/i }));

    await waitFor(() => {
      expect(mockSwitchActiveRole).toHaveBeenCalledWith("recruiter");
    });
  });
});
