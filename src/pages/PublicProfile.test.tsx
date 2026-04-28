import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicProfile from "./PublicProfile";

const mockGetPublicProfile = vi.fn();
const mockGetFavorites = vi.fn();
const mockAddFavorite = vi.fn();
const mockGetProfileContact = vi.fn();
const mockGetReportStatus = vi.fn();
const mockSubmitReport = vi.fn();
const mockEnableRole = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/api", () => ({
  default: {
    profiles: {
      getPublicProfile: (...args: unknown[]) => mockGetPublicProfile(...args),
    },
    recruiter: {
      getFavorites: (...args: unknown[]) => mockGetFavorites(...args),
      addFavorite: (...args: unknown[]) => mockAddFavorite(...args),
      getProfileContact: (...args: unknown[]) => mockGetProfileContact(...args),
      removeFavorite: vi.fn(),
    },
    reports: {
      getMyStatus: (...args: unknown[]) => mockGetReportStatus(...args),
      submit: (...args: unknown[]) => mockSubmitReport(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("PublicProfile", () => {
  beforeEach(() => {
    mockGetPublicProfile.mockReset();
    mockGetFavorites.mockReset();
    mockAddFavorite.mockReset();
    mockGetProfileContact.mockReset();
    mockGetReportStatus.mockReset();
    mockSubmitReport.mockReset();
    mockEnableRole.mockReset();
    mockUseAuth.mockReset();
    mockGetFavorites.mockResolvedValue({ favorites: [] });
    mockGetProfileContact.mockRejectedValue({ error: "contact_email_not_available" });
    mockGetReportStatus.mockResolvedValue({
      canSubmit: true,
      falseReportStrikeCount: 0,
      reportingRestrictedUntil: null,
      reportingRestrictionReason: null,
    });
    mockSubmitReport.mockResolvedValue({
      report: {
        id: 1,
      },
    });
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: vi.fn(),
      enableRole: mockEnableRole,
    });
  });

  it("renderiza os principais rótulos estáticos da página pública do perfil", async () => {
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: 1,
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-1",
        headline: "Engenheira de software focada em plataformas web.",
        bio: "Atuo com plataformas internas, DX e arquitetura frontend.",
        city: "São Paulo",
        state: "SP",
        seniority: "senior",
        workModels: ["remoto", "hibrido"],
        openToOpportunities: true,
        skills: ["TypeScript", "React", "Platform"],
        publishedAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-20T12:00:00.000Z",
        experiences: [
          {
            id: "exp-1",
            role_title: "Staff Engineer",
            company_name: "Analytical Engines",
            start_date: "2024-01",
            end_date: "",
            is_current: true,
            description: "Liderança técnica em plataformas e arquitetura.",
          },
        ],
        links: {
          linkedin: "https://linkedin.com/in/ada",
          github: "https://github.com/ada",
          portfolio: "https://ada.dev",
        },
      },
    });

    render(
      <MemoryRouter
        initialEntries={["/profissionais/ada-lovelace-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/profissionais/:slug" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /ada lovelace/i })).toBeInTheDocument();
    expect(screen.getByText(/perfil publicado/i)).toBeInTheDocument();
    expect(screen.getByText(/resumo/i)).toBeInTheDocument();
    expect(screen.getByText(/stack/i)).toBeInTheDocument();
    expect(screen.getByText(/ações do recrutador/i)).toBeInTheDocument();
    expect(screen.getByText(/links públicos/i)).toBeInTheDocument();
    expect(screen.getByText(/experiência profissional/i)).toBeInTheDocument();
    expect(screen.getByText(/remoto, híbrido/i)).toBeInTheDocument();
    expect(screen.getAllByText(/voltar para a busca/i).length).toBeGreaterThan(0);

    const recruiterBackLink = screen
      .getAllByRole("link", { name: /voltar para a busca/i })
      .find((link) => link.className.includes("w-full"));

    expect(recruiterBackLink).toBeDefined();
    expect(recruiterBackLink?.className).not.toContain("bg-background");
  });

  it("mostra uma mensagem amigável quando o perfil saiu da vitrine pública", async () => {
    mockGetPublicProfile.mockRejectedValue({
      error: "profile_not_found",
    });

    render(
      <MemoryRouter
        initialEntries={["/profissionais/ada-lovelace-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/profissionais/:slug" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /este perfil não está disponível/i })).toBeInTheDocument();
    expect(screen.getByText(/ele pode ter saído da vitrine pública ou este link não estar mais ativo/i)).toBeInTheDocument();
    expect(screen.queryByText("profile_not_found")).not.toBeInTheDocument();
  });

  it("oferece criar o perfil recrutador quando a conta ainda não o possui", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
        activeRole: "professional",
        availableRoles: ["professional"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: vi.fn(),
      enableRole: mockEnableRole.mockResolvedValue({
        id: 1,
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "recruiter",
        activeRole: "recruiter",
        availableRoles: ["professional", "recruiter"],
        is_verified: true,
      }),
    });
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: 1,
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-1",
        headline: "Engenheira de software focada em plataformas web.",
        bio: "Atuo com plataformas internas, DX e arquitetura frontend.",
        city: "São Paulo",
        state: "SP",
        seniority: "senior",
        workModel: "remoto",
        openToOpportunities: true,
        skills: ["TypeScript", "React", "Platform"],
        publishedAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-20T12:00:00.000Z",
        experiences: [],
        links: {
          linkedin: "",
          github: "",
          portfolio: "",
        },
      },
    });

    render(
      <MemoryRouter
        initialEntries={["/profissionais/ada-lovelace-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/profissionais/:slug" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /ada lovelace/i });
    await user.click(screen.getByRole("button", { name: /favoritar perfil/i }));

    expect(await screen.findByRole("heading", { name: /criar perfil recrutador/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /criar e trocar/i }));

    await waitFor(() => {
      expect(mockEnableRole).toHaveBeenCalledWith("recruiter", { makeActive: true });
    });
  });

  it("mostra o mailto quando o recrutador autenticado pode acessar o contato do perfil", async () => {
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
      switchActiveRole: vi.fn(),
      enableRole: mockEnableRole,
    });
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: 1,
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-1",
        headline: "Engenheira de software focada em plataformas web.",
        bio: "Atuo com plataformas internas, DX e arquitetura frontend.",
        city: "São Paulo",
        state: "SP",
        seniority: "senior",
        workModels: ["remoto"],
        openToOpportunities: true,
        skills: ["TypeScript", "React", "Platform"],
        publishedAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-20T12:00:00.000Z",
        experiences: [],
        links: {
          linkedin: "",
          github: "",
          portfolio: "",
        },
      },
    });
    mockGetProfileContact.mockResolvedValue({
      email: "jobs@ada.dev",
    });

    render(
      <MemoryRouter
        initialEntries={["/profissionais/ada-lovelace-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/profissionais/:slug" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    const emailLink = await screen.findByRole("link", { name: /enviar e-mail/i });

    expect(emailLink).toHaveAttribute("href", "mailto:jobs@ada.dev");
    expect(screen.getByText(/jobs@ada\.dev/i)).toBeInTheDocument();
    expect(mockGetProfileContact).toHaveBeenCalledWith("ada-lovelace-1");
  });

  it("não mostra o contato quando a pessoa não está no contexto de recrutador", async () => {
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: 1,
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-1",
        headline: "Engenheira de software focada em plataformas web.",
        bio: "Atuo com plataformas internas, DX e arquitetura frontend.",
        city: "São Paulo",
        state: "SP",
        seniority: "senior",
        workModels: ["remoto"],
        openToOpportunities: true,
        skills: ["TypeScript", "React", "Platform"],
        publishedAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-20T12:00:00.000Z",
        experiences: [],
        links: {
          linkedin: "",
          github: "",
          portfolio: "",
        },
      },
    });

    render(
      <MemoryRouter
        initialEntries={["/profissionais/ada-lovelace-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/profissionais/:slug" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /ada lovelace/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /enviar e-mail/i })).not.toBeInTheDocument();
    expect(mockGetProfileContact).not.toHaveBeenCalled();
  });

  it("permite denunciar o perfil público quando a pessoa autenticada envia um relato válido", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: {
        id: 9,
        name: "Grace Reporter",
        email: "grace@example.com",
        role: "professional",
        activeRole: "professional",
        availableRoles: ["professional"],
        is_verified: true,
      },
      loading: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
      switchActiveRole: vi.fn(),
      enableRole: mockEnableRole,
    });
    mockGetPublicProfile.mockResolvedValue({
      profile: {
        id: 1,
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-1",
        headline: "Engenheira de software focada em plataformas web.",
        bio: "Atuo com plataformas internas, DX e arquitetura frontend.",
        city: "São Paulo",
        state: "SP",
        seniority: "senior",
        workModels: ["remoto"],
        openToOpportunities: true,
        skills: ["TypeScript", "React", "Platform"],
        publishedAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-20T12:00:00.000Z",
        experiences: [],
        links: {
          linkedin: "",
          github: "",
          portfolio: "",
        },
      },
    });

    render(
      <MemoryRouter
        initialEntries={["/profissionais/ada-lovelace-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/profissionais/:slug" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /ada lovelace/i });
    await user.click(screen.getByRole("button", { name: /denunciar perfil/i }));
    await user.click(screen.getByRole("combobox", { name: /categoria da denúncia/i }));
    await user.click(screen.getByRole("option", { name: /falsa identidade/i }));
    await user.type(screen.getByLabelText(/relato da denúncia/i), "Esse perfil aparenta representar outra pessoa.");
    await user.click(screen.getByRole("button", { name: /enviar denúncia/i }));

    await waitFor(() => {
      expect(mockSubmitReport).toHaveBeenCalledWith({
        targetKind: "professional_public_profile",
        targetRef: "ada-lovelace-1",
        category: "false_identity",
        description: "Esse perfil aparenta representar outra pessoa.",
      });
    });
  });
});
