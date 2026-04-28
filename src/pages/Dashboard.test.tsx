import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";
import Dashboard from "./Dashboard";
import { AFFIRMATIVE_POLICY_VERSION } from "@/lib/affirmative-config.js";
import {
  PROFESSIONAL_PROFILE_DRAFT_TTL_MS,
  PROFESSIONAL_PROFILE_DRAFT_VERSION,
  createEmptyExperienceDraft,
  getProfessionalProfileDraftStorageKey,
} from "@/lib/professional-profile-draft";

const mockProfileGet = vi.fn();
const mockProfileUpdate = vi.fn();
const mockProfileRequestContactEmailCode = vi.fn();
const mockProfileVerifyContactEmailCode = vi.fn();
const mockGetContactAccesses = vi.fn();
const mockGetFavorites = vi.fn();
const mockGetSavedSearches = vi.fn();
const mockUpdateSavedSearch = vi.fn();
const mockExportPrivacyData = vi.fn();
const mockDeleteAccount = vi.fn();
const mockGetReportStatus = vi.fn();
const mockSubmitReport = vi.fn();
const mockGetAdminModerationReports = vi.fn();
const mockGetAdminModerationReport = vi.fn();
const mockResolveModerationReport = vi.fn();
const mockRestoreProfile = vi.fn();
const mockRestoreAccount = vi.fn();
const mockLiftReportingRestriction = vi.fn();
const mockGetAdminUsers = vi.fn();
const mockPromoteAdminUser = vi.fn();
const mockRevokeAdminUser = vi.fn();
const mockUseAuth = vi.fn();
const mockUseIsMobile = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

function buildProfessionalAuthValue() {
  return {
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
    refreshUser: vi.fn().mockResolvedValue(undefined),
    switchActiveRole: vi.fn(),
    enableRole: vi.fn(),
  };
}

function buildProfessionalProfileResponse({
  profile = {},
  publication = {},
}: {
  profile?: Record<string, unknown>;
  publication?: Record<string, unknown>;
} = {}) {
  return {
    profile: {
      name: "Ada Lovelace",
      city: "São Paulo",
      state: "SP",
      bio: "Especialista em interfaces.",
      headline: "Frontend Engineer",
      linkedin: "",
      github: "",
      portfolio: "",
      skills: ["React"],
      experiences: [],
      seniority: "pleno",
      workModels: ["hibrido"],
      contactEmail: "ada@example.com",
      showContactEmailToRecruiters: false,
      openToOpportunities: true,
      isPublished: false,
      affirmativeProfile: {
        groups: [],
        policyVersion: "",
        consentAcceptedAt: null,
      },
      ...profile,
    },
    publication: {
      isPublished: false,
      publicSlug: "",
      publishedAt: null,
      updatedAt: "2026-04-26T12:00:00.000Z",
      expiredAt: null,
      staleAfterAt: null,
      freshnessStatus: "active",
      isPublishable: true,
      issues: [],
      ...publication,
    },
  };
}

function buildProfessionalDraftPayload({
  updatedAt = Date.now(),
  sourcePublicationUpdatedAt = "2026-04-26T12:00:00.000Z",
  profile = {},
  newSkill = "",
  newExperience = createEmptyExperienceDraft(),
}: {
  updatedAt?: number;
  sourcePublicationUpdatedAt?: string | null;
  profile?: Record<string, unknown>;
  newSkill?: string;
  newExperience?: ReturnType<typeof createEmptyExperienceDraft>;
} = {}) {
  const {
    affirmativeProfile: _ignoredAffirmativeProfile,
    ...draftProfile
  } = buildProfessionalProfileResponse({ profile }).profile;

  return {
    version: PROFESSIONAL_PROFILE_DRAFT_VERSION,
    userId: 1,
    updatedAt,
    sourcePublicationUpdatedAt,
    profile: draftProfile,
    newSkill,
    newExperience,
  };
}

function buildProfessionalProfileUpdateResponse({
  profile = {},
  publication = {},
}: {
  profile?: Record<string, unknown>;
  publication?: Record<string, unknown>;
} = {}) {
  return {
    user: {
      id: 1,
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
      is_verified: true,
    },
    ...buildProfessionalProfileResponse({ profile, publication }),
  };
}

function buildAdminAuthValue() {
  return {
    user: {
      id: 7,
      name: "Morgan Admin",
      email: "admin@example.com",
      role: "administrator",
      activeRole: "administrator",
      availableRoles: ["administrator"],
      is_verified: true,
    },
    loading: false,
    signOut: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    switchActiveRole: vi.fn(),
    enableRole: vi.fn(),
  };
}

function buildAdminModerationListResponse() {
  return {
    reports: [
      {
        id: 11,
        reporterUserId: 9,
        reporterName: "Grace Reporter",
        targetUserId: 3,
        targetName: "Ada Lovelace",
        targetEmailHint: null,
        targetKind: "professional_public_profile",
        category: "third_party_data",
        status: "open",
        resolutionCode: null,
        createdAt: "2026-04-27T12:00:00.000Z",
        resolvedAt: null,
        resolvedByName: null,
        targetStrikeCount: 0,
        nextSanction: "hide_professional_profile",
      },
    ],
    hiddenProfiles: [
      {
        userId: 3,
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-3",
        blockedAt: "2026-04-27T12:30:00.000Z",
        blockReason: "Perfil ocultado por moderação.",
      },
    ],
    suspendedAccounts: [
      {
        userId: 4,
        name: "Rachel Recruiter",
        emailHint: "ra****@example.com",
        suspendedAt: "2026-04-27T13:00:00.000Z",
        suspensionReason: "Conta suspensa após revisão.",
      },
    ],
    restrictedReporters: [
      {
        userId: 5,
        name: "Alex Reporter",
        emailHint: "al****@example.com",
        restrictedUntil: "2026-07-26T12:00:00.000Z",
        restrictionReason: "Canal restrito temporariamente.",
        falseReportStrikeCount: 3,
      },
    ],
    recentActions: [
      {
        id: 91,
        actionType: "hide_professional_profile",
        subjectUserId: 3,
        subjectName: "Ada Lovelace",
        subjectEmailHint: "ad****@example.com",
        relatedReportId: 10,
        createdByName: "Morgan Admin",
        reason: "Perfil retirado da vitrine pública.",
        metadata: {},
        createdAt: "2026-04-27T13:30:00.000Z",
      },
    ],
  };
}

function buildAdminUsersResponse() {
  return {
    users: [
      {
        id: 12,
        name: "Teammate Internal",
        email: "teammate@opentalentpool.org",
        isVerified: true,
        isAdministrator: false,
        isReservedInternalAdmin: false,
        canPromote: true,
        canRevoke: false,
        lastAdminAction: null,
      },
      {
        id: 13,
        name: "Ops Admin",
        email: "ops-admin@opentalentpool.org",
        isVerified: true,
        isAdministrator: true,
        isReservedInternalAdmin: false,
        canPromote: false,
        canRevoke: true,
        lastAdminAction: {
          actionType: "grant_administrator",
          reason: "Conta movida para operações internas.",
          createdAt: "2026-04-28T12:00:00.000Z",
          createdByName: "Morgan Admin",
        },
      },
      {
        id: 14,
        name: "Operações internas",
        email: "administrator@opentalentpool.org",
        isVerified: true,
        isAdministrator: true,
        isReservedInternalAdmin: true,
        canPromote: false,
        canRevoke: false,
        lastAdminAction: null,
      },
    ],
  };
}

function buildAdminModerationDetailResponse() {
  return {
    report: {
      ...buildAdminModerationListResponse().reports[0],
      description: "Há dados de terceiros publicados neste perfil.",
      targetSnapshot: {
        targetName: "Ada Lovelace",
        publicSlug: "ada-lovelace-3",
      },
      adminNotes: null,
      targetStrikeCount: 0,
      nextSanction: "hide_professional_profile",
    },
  };
}

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("@/lib/api", () => ({
  default: {
    profile: {
      get: (...args: unknown[]) => mockProfileGet(...args),
      update: (...args: unknown[]) => mockProfileUpdate(...args),
      requestContactEmailCode: (...args: unknown[]) => mockProfileRequestContactEmailCode(...args),
      verifyContactEmailCode: (...args: unknown[]) => mockProfileVerifyContactEmailCode(...args),
      getContactAccesses: (...args: unknown[]) => mockGetContactAccesses(...args),
    },
    recruiter: {
      getFavorites: (...args: unknown[]) => mockGetFavorites(...args),
      getSavedSearches: (...args: unknown[]) => mockGetSavedSearches(...args),
      removeFavorite: vi.fn(),
      updateSavedSearch: (...args: unknown[]) => mockUpdateSavedSearch(...args),
      deleteSavedSearch: vi.fn(),
    },
    auth: {
      exportPrivacyData: (...args: unknown[]) => mockExportPrivacyData(...args),
      deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
    },
    reports: {
      getMyStatus: (...args: unknown[]) => mockGetReportStatus(...args),
      submit: (...args: unknown[]) => mockSubmitReport(...args),
    },
    admin: {
      getModerationReports: (...args: unknown[]) => mockGetAdminModerationReports(...args),
      getModerationReport: (...args: unknown[]) => mockGetAdminModerationReport(...args),
      resolveModerationReport: (...args: unknown[]) => mockResolveModerationReport(...args),
      restoreProfile: (...args: unknown[]) => mockRestoreProfile(...args),
      restoreAccount: (...args: unknown[]) => mockRestoreAccount(...args),
      liftReportingRestriction: (...args: unknown[]) => mockLiftReportingRestriction(...args),
      getUsers: (...args: unknown[]) => mockGetAdminUsers(...args),
      promoteUserToAdministrator: (...args: unknown[]) => mockPromoteAdminUser(...args),
      revokeAdministratorFromUser: (...args: unknown[]) => mockRevokeAdminUser(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe("Dashboard", () => {
  beforeEach(() => {
    mockProfileGet.mockReset();
    mockProfileUpdate.mockReset();
    mockProfileRequestContactEmailCode.mockReset();
    mockProfileVerifyContactEmailCode.mockReset();
    mockGetContactAccesses.mockReset();
    mockGetFavorites.mockReset();
    mockGetSavedSearches.mockReset();
    mockUpdateSavedSearch.mockReset();
    mockExportPrivacyData.mockReset();
    mockDeleteAccount.mockReset();
    mockGetReportStatus.mockReset();
    mockSubmitReport.mockReset();
    mockGetAdminModerationReports.mockReset();
    mockGetAdminModerationReport.mockReset();
    mockResolveModerationReport.mockReset();
    mockRestoreProfile.mockReset();
    mockRestoreAccount.mockReset();
    mockLiftReportingRestriction.mockReset();
    mockGetAdminUsers.mockReset();
    mockPromoteAdminUser.mockReset();
    mockRevokeAdminUser.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockUseIsMobile.mockReturnValue(false);
    mockGetContactAccesses.mockResolvedValue({ accesses: [] });
    mockGetReportStatus.mockResolvedValue({
      canSubmit: true,
      falseReportStrikeCount: 0,
      reportingRestrictedUntil: null,
      reportingRestrictionReason: null,
    });
    mockSubmitReport.mockResolvedValue({ report: { id: 1 } });
    mockGetAdminModerationReports.mockResolvedValue(buildAdminModerationListResponse());
    mockGetAdminModerationReport.mockResolvedValue(buildAdminModerationDetailResponse());
    mockResolveModerationReport.mockResolvedValue({
      report: {
        ...buildAdminModerationDetailResponse().report,
        status: "resolved",
        resolutionCode: "hide_professional_profile",
        adminNotes: "Perfil removido após revisão.",
      },
    });
    mockRestoreProfile.mockResolvedValue({ ok: true });
    mockRestoreAccount.mockResolvedValue({ ok: true });
    mockLiftReportingRestriction.mockResolvedValue({ ok: true });
    mockGetAdminUsers.mockResolvedValue(buildAdminUsersResponse());
    mockPromoteAdminUser.mockResolvedValue({
      user: {
        ...buildAdminUsersResponse().users[0],
        isAdministrator: true,
        canPromote: false,
        canRevoke: true,
        lastAdminAction: {
          actionType: "grant_administrator",
          reason: "Conta movida para operações administrativas internas.",
          createdAt: "2026-04-28T14:00:00.000Z",
          createdByName: "Morgan Admin",
        },
      },
    });
    mockRevokeAdminUser.mockResolvedValue({
      user: {
        ...buildAdminUsersResponse().users[1],
        isAdministrator: false,
        canPromote: true,
        canRevoke: false,
        lastAdminAction: {
          actionType: "revoke_administrator",
          reason: "Conta voltou ao escopo público interno.",
          createdAt: "2026-04-28T15:00:00.000Z",
          createdByName: "Morgan Admin",
        },
      },
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite que o profissional ative a publicação e envie o perfil atualizado", async () => {
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
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockProfileGet.mockResolvedValue({
      profile: {
        name: "Ada Lovelace",
        city: "São Paulo",
        state: "SP",
        bio: "Especialista em interfaces.",
        headline: "Frontend Engineer",
        linkedin: "",
        github: "",
        portfolio: "",
        skills: ["React"],
        experiences: [],
        seniority: "pleno",
        workModel: "hibrido",
        openToOpportunities: true,
        isPublished: false,
      },
      publication: {
        isPublished: false,
        publicSlug: "",
        publishedAt: null,
        updatedAt: null,
        isPublishable: true,
        issues: [],
      },
    });
    mockProfileUpdate.mockResolvedValue({
      user: {
        id: 1,
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
        is_verified: true,
      },
      profile: {
        name: "Ada Lovelace",
        city: "São Paulo",
        state: "SP",
        bio: "Especialista em interfaces.",
        headline: "Frontend Engineer",
        linkedin: "",
        github: "",
        portfolio: "",
        skills: ["React"],
        experiences: [],
        seniority: "pleno",
        workModel: "hibrido",
        openToOpportunities: true,
        isPublished: true,
      },
      publication: {
        isPublished: true,
        publicSlug: "ada-lovelace-1",
        publishedAt: "2026-04-22T12:00:00.000Z",
        updatedAt: "2026-04-22T12:00:00.000Z",
        isPublishable: true,
        issues: [],
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/edite seu perfil, revise a publicação e mantenha seus dados privados fora da vitrine/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/telefone/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/data de início/i)).toHaveClass("block", "min-w-0", "max-w-full");
    expect(screen.getByLabelText(/data de fim/i)).toHaveClass("block", "min-w-0", "max-w-full");

    fireEvent.click(screen.getByLabelText(/tornar perfil público/i));
    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          isPublished: true,
        }),
      );
    });

    expect(await screen.findByRole("link", { name: /ver perfil público/i })).toBeInTheDocument();
  });

  it("bloqueia a publicação enquanto houver pendências e destaca o checklist pendente em vermelho", async () => {
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
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockProfileGet.mockResolvedValue({
      profile: {
        name: "Ada Lovelace",
        city: "",
        state: "",
        bio: "",
        headline: "",
        linkedin: "",
        github: "",
        portfolio: "",
        skills: [],
        experiences: [],
        seniority: "",
        workModel: "",
        openToOpportunities: false,
        isPublished: false,
      },
      publication: {
        isPublished: false,
        publicSlug: "",
        publishedAt: null,
        updatedAt: null,
        isPublishable: false,
        issues: [],
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText(/checklist de publicação/i);

    expect(screen.getByRole("switch", { name: /tornar perfil público/i })).toBeDisabled();
    expect(screen.getByText(/checklist pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/^oculta$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /seu perfil só entra na descoberta quando você decide publicar/i,
      }),
    ).toHaveClass("surface-dark-title");
    expect(screen.getByText(/itens pendentes para publicar/i)).toHaveClass("text-destructive");
    expect(screen.getByText(/adicione um headline profissional/i).closest("li")).toHaveClass("text-destructive");
  });

  it("usa fallback de texto para as datas da experiência no mobile", async () => {
    mockUseIsMobile.mockReturnValue(true);
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
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockProfileGet.mockResolvedValue({
      profile: {
        name: "Ada Lovelace",
        city: "São Paulo",
        state: "SP",
        bio: "Especialista em interfaces.",
        headline: "Frontend Engineer",
        linkedin: "",
        github: "",
        portfolio: "",
        skills: ["React"],
        experiences: [],
        seniority: "pleno",
        workModel: "hibrido",
        openToOpportunities: true,
        isPublished: false,
      },
      publication: {
        isPublished: false,
        publicSlug: "",
        publishedAt: null,
        updatedAt: null,
        isPublishable: true,
        issues: [],
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    const startDate = await screen.findByLabelText(/data de início/i);
    const endDate = screen.getByLabelText(/data de fim/i);

    expect(startDate).toHaveAttribute("type", "text");
    expect(startDate).toHaveAttribute("placeholder", "AAAA-MM-DD");
    expect(startDate).toHaveAttribute("inputmode", "numeric");
    expect(endDate).toHaveAttribute("type", "text");
    expect(endDate).toHaveAttribute("placeholder", "AAAA-MM-DD");
  });

  it("restaura automaticamente um rascunho local válido e prioriza o navegador sobre o backend", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(
        buildProfessionalDraftPayload({
          profile: {
            city: "Recife",
            headline: "Platform Engineer",
            workModels: ["remoto", "hibrido"],
          },
          newSkill: "TypeScript",
          newExperience: {
            ...createEmptyExperienceDraft(),
            role_title: "Tech Lead",
          },
        }),
      ),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("Recife")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Platform Engineer")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/react, node\.js, platform engineering/i)).toHaveValue("TypeScript");
    expect(screen.getByLabelText(/cargo/i)).toHaveValue("Tech Lead");
    expect(screen.getByRole("button", { name: /modelo de trabalho: remoto, híbrido/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /autorizo o uso desses dados/i })).not.toBeChecked();
    expect(screen.getByText(/rascunho salvo neste navegador/i)).toBeInTheDocument();
  });

  it("hidrata o e-mail de contato com o e-mail da conta e mantém a visibilidade desligada por padrão", async () => {
    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(
      buildProfessionalProfileResponse({
        profile: {
          contactEmail: "",
          showContactEmailToRecruiters: false,
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText(/e-mail de contato/i)).toHaveValue("ada@example.com");
    expect(screen.getByRole("switch", { name: /exibir e-mail para recrutadores/i })).not.toBeChecked();
  });

  it("permite ligar a visibilidade usando o e-mail da conta sem verificação extra", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockProfileUpdate.mockResolvedValue(
      buildProfessionalProfileUpdateResponse({
        profile: {
          showContactEmailToRecruiters: true,
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByLabelText(/e-mail de contato/i);
    await user.click(screen.getByRole("switch", { name: /exibir e-mail para recrutadores/i }));
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          contactEmail: "ada@example.com",
          showContactEmailToRecruiters: true,
        }),
      );
    });
    expect(mockProfileRequestContactEmailCode).not.toHaveBeenCalled();
    expect(mockProfileVerifyContactEmailCode).not.toHaveBeenCalled();
  });

  it("bloqueia save com e-mail custom até confirmar o código e libera depois da verificação", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockProfileRequestContactEmailCode.mockResolvedValue({
      ok: true,
      message: "Enviamos um código para o e-mail da sua conta.",
      challengeId: "challenge-123",
    });
    mockProfileVerifyContactEmailCode.mockResolvedValue({
      ok: true,
      email: "jobs@ada.dev",
    });
    mockProfileUpdate.mockResolvedValue(
      buildProfessionalProfileUpdateResponse({
        profile: {
          contactEmail: "jobs@ada.dev",
          showContactEmailToRecruiters: true,
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByLabelText(/e-mail de contato/i);
    await user.clear(screen.getByLabelText(/e-mail de contato/i));
    await user.type(screen.getByLabelText(/e-mail de contato/i), "jobs@ada.dev");
    await user.click(screen.getByRole("switch", { name: /exibir e-mail para recrutadores/i }));
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).not.toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /enviar código para confirmar/i }));

    await waitFor(() => {
      expect(mockProfileRequestContactEmailCode).toHaveBeenCalledWith({
        nextContactEmail: "jobs@ada.dev",
      });
    });

    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /confirmar código/i }));

    await waitFor(() => {
      expect(mockProfileVerifyContactEmailCode).toHaveBeenCalledWith({
        challengeId: "challenge-123",
        code: "123456",
      });
    });

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          contactEmail: "jobs@ada.dev",
          showContactEmailToRecruiters: true,
        }),
      );
    });
  });

  it("permite voltar para o e-mail da conta sem pedir novo código", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(
      buildProfessionalProfileResponse({
        profile: {
          contactEmail: "jobs@ada.dev",
          showContactEmailToRecruiters: true,
        },
      }),
    );
    mockProfileUpdate.mockResolvedValue(
      buildProfessionalProfileUpdateResponse({
        profile: {
          contactEmail: "ada@example.com",
          showContactEmailToRecruiters: true,
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    const contactEmailInput = await screen.findByLabelText(/e-mail de contato/i);
    expect(contactEmailInput).toHaveValue("jobs@ada.dev");

    await user.clear(contactEmailInput);
    await user.type(contactEmailInput, "ada@example.com");
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          contactEmail: "ada@example.com",
        }),
      );
    });
    expect(mockProfileRequestContactEmailCode).not.toHaveBeenCalled();
    expect(mockProfileVerifyContactEmailCode).not.toHaveBeenCalled();
  });

  it("permite selecionar múltiplos modelos de trabalho e persiste a lista no rascunho e no save", async () => {
    const user = userEvent.setup();
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockProfileUpdate.mockResolvedValue(
      buildProfessionalProfileUpdateResponse({
        profile: {
          workModels: ["remoto", "hibrido", "presencial"],
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText(/edite seu perfil, revise a publicação/i);
    await user.click(screen.getByRole("button", { name: /modelo de trabalho: híbrido/i }));
    await user.click(screen.getByRole("checkbox", { name: /remoto/i }));
    await user.click(screen.getByRole("checkbox", { name: /presencial/i }));

    expect(screen.getByRole("button", { name: /modelo de trabalho: remoto, híbrido, presencial/i })).toBeInTheDocument();

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem(storageKey);

      expect(rawDraft).not.toBeNull();
      expect(JSON.parse(rawDraft || "{}")).toMatchObject({
        profile: {
          workModels: ["remoto", "hibrido", "presencial"],
        },
      });
    });

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          workModels: ["remoto", "hibrido", "presencial"],
        }),
      );
    });
  });

  it("não cria rascunho local só por carregar o perfil do backend", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText(/edite seu perfil, revise a publicação/i);
    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(screen.queryByText(/rascunho salvo neste navegador/i)).not.toBeInTheDocument();
  });

  it("salva o rascunho local após o debounce quando o perfil muda", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    const cityInput = await screen.findByLabelText(/cidade/i);

    fireEvent.change(cityInput, { target: { value: "Recife" } });

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem(storageKey);

      expect(rawDraft).not.toBeNull();
      expect(JSON.parse(rawDraft || "{}")).toMatchObject({
        profile: {
          city: "Recife",
        },
      });
    });

    expect(screen.getByText(/rascunho salvo neste navegador/i)).toBeInTheDocument();
  });

  it("não persiste dados afirmativos nem consentimento no rascunho local", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(
      buildProfessionalProfileResponse({
        profile: {
          affirmativeProfile: {
            groups: ["women"],
            policyVersion: AFFIRMATIVE_POLICY_VERSION,
            consentAcceptedAt: "2026-04-26T12:00:00.000Z",
          },
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText(/cidade/i), { target: { value: "Recife" } });

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem(storageKey);

      expect(rawDraft).not.toBeNull();
      const parsedDraft = JSON.parse(rawDraft || "{}");

      expect(parsedDraft.affirmativeConsentAccepted).toBeUndefined();
      expect(parsedDraft.profile.affirmativeProfile).toBeUndefined();
    });
  });

  it("remove drafts legados ao abrir o dashboard", async () => {
    const legacyStorageKey = "professional_profile_draft:v1:1";

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    window.localStorage.setItem(
      legacyStorageKey,
      JSON.stringify(
        buildProfessionalDraftPayload({
          profile: {
            headline: "Headline legado",
          },
        }),
      ),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByDisplayValue("Frontend Engineer");

    expect(window.localStorage.getItem(legacyStorageKey)).toBeNull();
    expect(screen.queryByDisplayValue("Headline legado")).not.toBeInTheDocument();
  });

  it("remove o rascunho local quando o estado volta ao baseline do backend", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    const cityInput = await screen.findByLabelText(/cidade/i);

    fireEvent.change(cityInput, { target: { value: "Recife" } });

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).not.toBeNull();
    });

    fireEvent.change(cityInput, { target: { value: "São Paulo" } });

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).toBeNull();
    });

    expect(screen.queryByText(/rascunho salvo neste navegador/i)).not.toBeInTheDocument();
  });

  it("descarta o rascunho local e restaura o último estado salvo no backend", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(
        buildProfessionalDraftPayload({
          profile: {
            city: "Recife",
          },
          newSkill: "TypeScript",
        }),
      ),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("Recife")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /descartar rascunho local/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/cidade/i)).toHaveValue("São Paulo");
    });

    expect(screen.getByPlaceholderText(/react, node\.js, platform engineering/i)).toHaveValue("");
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(screen.queryByText(/rascunho salvo neste navegador/i)).not.toBeInTheDocument();
  });

  it("limpa o rascunho local após save bem-sucedido quando não restam pendências auxiliares", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockProfileUpdate.mockResolvedValue(
      buildProfessionalProfileUpdateResponse({
        profile: {
          city: "Recife",
        },
        publication: {
          updatedAt: "2026-04-27T12:00:00.000Z",
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    const cityInput = await screen.findByLabelText(/cidade/i);

    fireEvent.change(cityInput, { target: { value: "Recife" } });

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          city: "Recife",
        }),
      );
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).toBeNull();
    });

    expect(screen.queryByText(/rascunho salvo neste navegador/i)).not.toBeInTheDocument();
  });

  it("preserva apenas pendências auxiliares no rascunho após save bem-sucedido", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockProfileUpdate.mockResolvedValue(
      buildProfessionalProfileUpdateResponse({
        profile: {
          city: "Recife",
        },
        publication: {
          updatedAt: "2026-04-27T12:00:00.000Z",
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText(/cidade/i), { target: { value: "Recife" } });
    fireEvent.change(screen.getByLabelText(/cargo/i), { target: { value: "Tech Lead" } });

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          city: "Recife",
        }),
      );
    });

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem(storageKey);

      expect(rawDraft).not.toBeNull();
      expect(JSON.parse(rawDraft || "{}")).toMatchObject({
        profile: {
          city: "Recife",
        },
        newSkill: "",
        newExperience: {
          role_title: "Tech Lead",
        },
      });
    });

    expect(screen.getByText(/rascunho salvo neste navegador/i)).toBeInTheDocument();
  });

  it("ignora e remove rascunho local inválido", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    window.localStorage.setItem(storageKey, "{invalid");

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText(/cidade/i)).toHaveValue("São Paulo");
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(screen.queryByText(/rascunho salvo neste navegador/i)).not.toBeInTheDocument();
  });

  it("ignora e remove rascunho local expirado", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(
        buildProfessionalDraftPayload({
          updatedAt: Date.now() - PROFESSIONAL_PROFILE_DRAFT_TTL_MS - 1,
          profile: {
            city: "Recife",
          },
        }),
      ),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText(/cidade/i)).toHaveValue("São Paulo");
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(screen.queryByText(/rascunho salvo neste navegador/i)).not.toBeInTheDocument();
  });

  it("mostra quando o perfil expirou por recência e exige atualização antes de republicar", async () => {
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
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockProfileGet.mockResolvedValue({
      profile: {
        name: "Ada Lovelace",
        city: "São Paulo",
        state: "SP",
        bio: "Especialista em interfaces.",
        headline: "Frontend Engineer",
        linkedin: "",
        github: "",
        portfolio: "",
        skills: ["React"],
        experiences: [],
        seniority: "pleno",
        workModel: "hibrido",
        openToOpportunities: true,
        isPublished: false,
      },
      publication: {
        isPublished: false,
        publicSlug: "ada-lovelace-1",
        publishedAt: null,
        updatedAt: "2025-10-20T12:00:00.000Z",
        expiredAt: "2026-04-20T12:00:00.000Z",
        staleAfterAt: "2026-04-18T12:00:00.000Z",
        freshnessStatus: "expired",
        isPublishable: true,
        issues: [],
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/perfil expirado/i)).toBeInTheDocument();
    expect(screen.getByText(/seu currículo saiu da descoberta pública/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /tornar perfil público/i })).toBeDisabled();
    expect(screen.getByText(/atualização obrigatória/i)).toBeInTheDocument();
  });

  it("mostra favoritos e buscas salvas persistidos no painel do recrutador e permite ajustar a frequência do alerta", async () => {
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
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockGetFavorites.mockResolvedValue({
      favorites: [
        {
          id: 10,
          name: "Grace Hopper",
          publicSlug: "grace-hopper-10",
          headline: "Platform Engineer",
          bioExcerpt: "Kubernetes e AWS.",
          city: "Recife",
          state: "PE",
          seniority: "senior",
          workModels: ["remoto", "hibrido"],
          openToOpportunities: true,
          skills: ["AWS"],
          publishedAt: "2026-04-22T12:00:00.000Z",
          updatedAt: "2026-04-22T12:00:00.000Z",
          favoritedAt: "2026-04-22T12:00:00.000Z",
        },
      ],
    });
    mockGetSavedSearches.mockResolvedValue({
      savedSearches: [
        {
          id: 1,
          name: "React remoto",
          criteria: {
            q: "react",
            seniority: "",
            workModel: "remoto",
            state: "SP",
            openToOpportunities: true,
          },
          alertFrequency: "daily",
          createdAt: "2026-04-22T12:00:00.000Z",
          updatedAt: "2026-04-22T12:00:00.000Z",
          lastAlertSentAt: "2026-04-23T12:00:00.000Z",
        },
      ],
    });
    mockUpdateSavedSearch.mockResolvedValue({
      savedSearch: {
        id: 1,
        name: "React remoto",
        criteria: {
          q: "react",
          seniority: "",
          workModel: "remoto",
          state: "SP",
          openToOpportunities: true,
        },
        alertFrequency: "monthly",
        createdAt: "2026-04-22T12:00:00.000Z",
        updatedAt: "2026-04-24T12:00:00.000Z",
        lastAlertSentAt: "2026-04-23T12:00:00.000Z",
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/acompanhe sua curadoria sem perder o fio da busca/i)).toBeInTheDocument();
    expect(screen.getByText(/grace hopper/i)).toBeInTheDocument();
    expect(screen.getByText(/remoto, híbrido/i)).toBeInTheDocument();
    expect(screen.getByText(/react remoto/i)).toBeInTheDocument();
    expect(screen.getByText(/alerta diário/i)).toBeInTheDocument();
    expect(screen.getByText(/último alerta enviado/i)).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /frequência do alerta da busca react remoto/i }));
    await user.click(screen.getByRole("option", { name: /mensal/i }));

    await waitFor(() => {
      expect(mockUpdateSavedSearch).toHaveBeenCalledWith(1, {
        alertFrequency: "monthly",
      });
    });

    expect(await screen.findByText(/alerta mensal/i)).toBeInTheDocument();
  });

  it("exporta os dados da conta em JSON pelo painel de privacidade", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    const createObjectURL = vi.fn(() => "blob:privacy-export");
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = vi.fn();

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockExportPrivacyData.mockResolvedValue({
      exportedAt: "2026-04-27T12:00:00.000Z",
      account: {
        id: 1,
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
        activeRole: "professional",
        availableRoles: ["professional"],
        is_verified: true,
        createdAt: "2026-04-20T12:00:00.000Z",
      },
      profile: buildProfessionalProfileResponse().profile,
      recruiter: {
        favorites: [],
        savedSearches: [],
      },
      policyAcceptances: {
        user: [],
        recruiter: [],
      },
      inclusiveSearchAudit: [],
    });

    try {
      render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Dashboard />
        </MemoryRouter>,
      );

      await screen.findByText(/privacidade e lgpd/i);
      await user.click(screen.getByRole("button", { name: /exportar meus dados/i }));

      await waitFor(() => {
        expect(mockExportPrivacyData).toHaveBeenCalledTimes(1);
      });
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:privacy-export");
      expect(mockToastSuccess).toHaveBeenCalledWith("Exportação gerada com sucesso.");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
  });

  it("permite revogar a autodeclaração afirmativa pelo dashboard profissional", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(
      buildProfessionalProfileResponse({
        profile: {
          affirmativeProfile: {
            groups: ["women", "black_people"],
            policyVersion: AFFIRMATIVE_POLICY_VERSION,
            consentAcceptedAt: "2026-04-26T12:00:00.000Z",
          },
        },
      }),
    );
    mockProfileUpdate.mockResolvedValue(
      buildProfessionalProfileUpdateResponse({
        profile: {
          affirmativeProfile: {
            groups: [],
            policyVersion: "",
            consentAcceptedAt: null,
          },
        },
      }),
    );

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: /revogar autodeclaração/i });
    await user.click(screen.getByRole("button", { name: /revogar autodeclaração/i }));
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          affirmativeProfile: {
            groups: [],
            policyVersion: "",
            consentAcceptedAt: null,
          },
          affirmativeConsentAccepted: false,
        }),
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Autodeclaração marcada para remoção. Salve o perfil para concluir.");
  });

  it("permite que o profissional salve autodeclaração afirmativa opcional com consentimento explícito", async () => {
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
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockProfileGet.mockResolvedValue({
      profile: {
        name: "Ada Lovelace",
        city: "São Paulo",
        state: "SP",
        bio: "Especialista em interfaces.",
        headline: "Frontend Engineer",
        linkedin: "",
        github: "",
        portfolio: "",
        skills: ["React"],
        experiences: [],
        seniority: "pleno",
        workModel: "hibrido",
        openToOpportunities: true,
        isPublished: false,
        affirmativeProfile: {
          groups: [],
          policyVersion: "",
          consentAcceptedAt: null,
        },
      },
      publication: {
        isPublished: false,
        publicSlug: "",
        publishedAt: null,
        updatedAt: null,
        isPublishable: true,
        issues: [],
      },
    });
    mockProfileUpdate.mockResolvedValue({
      user: {
        id: 1,
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
        is_verified: true,
      },
      profile: {
        name: "Ada Lovelace",
        city: "São Paulo",
        state: "SP",
        bio: "Especialista em interfaces.",
        headline: "Frontend Engineer",
        linkedin: "",
        github: "",
        portfolio: "",
        skills: ["React"],
        experiences: [],
        seniority: "pleno",
        workModel: "hibrido",
        openToOpportunities: true,
        isPublished: false,
        affirmativeProfile: {
          groups: ["women", "black_people"],
          policyVersion: AFFIRMATIVE_POLICY_VERSION,
          consentAcceptedAt: "2026-04-26T12:00:00.000Z",
        },
      },
      publication: {
        isPublished: false,
        publicSlug: "",
        publishedAt: null,
        updatedAt: "2026-04-26T12:00:00.000Z",
        isPublishable: true,
        issues: [],
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText(/edite seu perfil, revise a publicação/i);
    expect(screen.getByText(/mulheres, pessoas lgbtqiapn\+ e outros recortes afirmativos/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /pessoas lgbtqiapn\+/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /pessoas trans/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /mulheres/i }));
    await user.click(screen.getByRole("checkbox", { name: /pessoas negras/i }));
    await user.click(screen.getByRole("checkbox", { name: /autorizo o uso desses dados/i }));
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          affirmativeProfile: {
            groups: ["women", "black_people"],
            policyVersion: "",
            consentAcceptedAt: null,
          },
          affirmativeConsentAccepted: true,
        }),
      );
    });
  });

  it("exclui a conta autenticada com confirmação forte por e-mail", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockResolvedValue(undefined);

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
      signOut,
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockGetFavorites.mockResolvedValue({ favorites: [] });
    mockGetSavedSearches.mockResolvedValue({ savedSearches: [] });
    mockDeleteAccount.mockResolvedValue({
      ok: true,
      deletedAt: "2026-04-27T12:00:00.000Z",
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText(/privacidade e lgpd/i);
    await user.click(screen.getByRole("button", { name: /excluir conta/i }));
    await screen.findByRole("heading", { name: /excluir conta permanentemente/i });

    await user.type(screen.getByPlaceholderText("rachel@example.com"), "rachel@example.com");
    await user.click(screen.getByRole("button", { name: /confirmar exclusão/i }));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledWith({
        confirmEmail: "rachel@example.com",
      });
    });
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Conta excluída com sucesso.");
  });

  it("desativa restauração e autosave local quando o armazenamento opcional foi recusado", async () => {
    const storageKey = getProfessionalProfileDraftStorageKey(1);

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockGetFavorites.mockResolvedValue({ favorites: [] });
    mockGetSavedSearches.mockResolvedValue({ savedSearches: [] });

    window.localStorage.setItem(
      storageKey,
      JSON.stringify(
        buildProfessionalDraftPayload({
          profile: {
            headline: "Headline do rascunho local",
          },
        }),
      ),
    );

    render(
      <CookieConsentProvider initialDecision="rejected">
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Dashboard />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    expect(await screen.findByDisplayValue("Frontend Engineer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Headline do rascunho local")).not.toBeInTheDocument();
    expect(screen.getByText(/rascunhos neste navegador exigem armazenamento opcional/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(storageKey)).toBeNull();

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText(/headline profissional/i), {
      target: { value: "Frontend Engineer atualizado" },
    });

    vi.advanceTimersByTime(900);

    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(screen.queryByText(/rascunho salvo neste navegador/i)).not.toBeInTheDocument();
  });

  it("resume buscas inclusivas no painel do recrutador sem expor critérios afirmativos detalhados", async () => {
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
      refreshUser: vi.fn().mockResolvedValue(undefined),
      switchActiveRole: vi.fn(),
      enableRole: vi.fn(),
    });
    mockGetFavorites.mockResolvedValue({
      favorites: [],
    });
    mockGetSavedSearches.mockResolvedValue({
      savedSearches: [
        {
          id: 10,
          name: "Busca inclusiva frontend",
          criteria: {
            q: "react",
            seniority: "",
            workModel: "",
            state: "SP",
            openToOpportunities: true,
            affirmativeContext: {
              useCase: "vaga_afirmativa",
              vacancyReference: "REQ-123",
            },
            affirmativeFilters: {
              genderGroups: ["women"],
              raceGroups: ["black_people"],
              pcdOnly: false,
            },
          },
          alertFrequency: "daily",
          createdAt: "2026-04-22T12:00:00.000Z",
          updatedAt: "2026-04-22T12:00:00.000Z",
          lastAlertSentAt: null,
        },
      ],
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText(/busca inclusiva frontend/i);
    expect(screen.getByText(/busca com priorização inclusiva e critérios afirmativos ativos/i)).toBeInTheDocument();
    expect(screen.queryByText(/pessoas negras/i)).not.toBeInTheDocument();
  });

  it("lista acessos ao contato e permite denunciar um recrutador a partir do painel profissional", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockGetContactAccesses.mockResolvedValue({
      accesses: [
        {
          id: 1,
          recruiterUserId: 2,
          recruiterName: "Rachel Recruiter",
          recruiterEmailHint: "ra****@example.com",
          professionalPublicSlug: "ada-lovelace-1",
          accessedAt: "2026-04-27T12:00:00.000Z",
        },
      ],
    });

    render(
      <CookieConsentProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Dashboard />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    await screen.findByText(/rachel recruiter/i);
    expect(screen.getByText(/ra\*\*\*\*@example\.com/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /denunciar recrutador/i }));
    await user.click(screen.getByRole("combobox", { name: /categoria da denúncia/i }));
    await user.click(screen.getByRole("option", { name: /assédio ou abuso/i }));
    await user.type(screen.getByLabelText(/relato da denúncia/i), "Uso indevido do canal de contato.");
    await user.click(screen.getByRole("button", { name: /enviar denúncia/i }));

    await waitFor(() => {
      expect(mockSubmitReport).toHaveBeenCalledWith({
        targetKind: "recruiter_contact_access",
        targetRef: "1",
        category: "harassment_or_abuse",
        description: "Uso indevido do canal de contato.",
      });
    });
  });

  it("mostra erro específico quando o recibo por e-mail da denúncia falha", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildProfessionalAuthValue());
    mockProfileGet.mockResolvedValue(buildProfessionalProfileResponse());
    mockGetContactAccesses.mockResolvedValue({
      accesses: [
        {
          id: 1,
          recruiterUserId: 2,
          recruiterName: "Rachel Recruiter",
          recruiterEmailHint: "ra****@example.com",
          professionalPublicSlug: "ada-lovelace-1",
          accessedAt: "2026-04-27T12:00:00.000Z",
        },
      ],
    });
    mockSubmitReport.mockRejectedValueOnce({ error: "email_delivery_failed" });

    render(
      <CookieConsentProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Dashboard />
        </MemoryRouter>
      </CookieConsentProvider>,
    );

    await screen.findByText(/rachel recruiter/i);
    await user.click(screen.getByRole("button", { name: /denunciar recrutador/i }));
    await user.click(screen.getByRole("combobox", { name: /categoria da denúncia/i }));
    await user.click(screen.getByRole("option", { name: /assédio ou abuso/i }));
    await user.type(screen.getByLabelText(/relato da denúncia/i), "Uso indevido do canal de contato.");
    await user.click(screen.getByRole("button", { name: /enviar denúncia/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Não foi possível confirmar a denúncia por e-mail agora. Tente novamente em instantes.",
      );
    });
  });

  it("mostra a fila administrativa de moderação e envia a decisão escolhida", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildAdminAuthValue());

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /fila de moderação/i });
    expect(screen.getByRole("heading", { name: /perfis ocultados/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /contas suspensas/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /denunciantes restritos/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /auditoria de moderação/i })).toBeInTheDocument();
    expect(screen.getByText(/perfil retirado da vitrine pública/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /abrir caso/i }));
    await screen.findByText(/há dados de terceiros publicados neste perfil/i);
    expect(screen.getByText(/primeira sanção: retirar o perfil da vitrine/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/notas da decisão/i), "Perfil removido após revisão.");
    await user.click(screen.getByRole("button", { name: /ocultar perfil/i }));

    await waitFor(() => {
      expect(mockResolveModerationReport).toHaveBeenCalledWith(11, {
        decision: "hide_professional_profile",
        adminNotes: "Perfil removido após revisão.",
      });
    });
  });

  it("mostra banimento definitivo imediato como CTA único para discriminação em perfil público", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildAdminAuthValue());
    mockGetAdminModerationReports.mockResolvedValue({
      ...buildAdminModerationListResponse(),
      reports: [
        {
          ...buildAdminModerationListResponse().reports[0],
          category: "discrimination",
          nextSanction: "permanent_ban_target_account",
        },
      ],
    });
    mockGetAdminModerationReport.mockResolvedValue({
      report: {
        ...buildAdminModerationDetailResponse().report,
        category: "discrimination",
        nextSanction: "permanent_ban_target_account",
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /fila de moderação/i });
    await user.click(screen.getByRole("button", { name: /abrir caso/i }));
    await screen.findByText(/conteúdo discriminatório em perfil público segue banimento definitivo imediato/i);
    expect(screen.queryByRole("button", { name: /ocultar perfil/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /banir definitivamente/i })).toBeInTheDocument();
  });

  it("mostra a gestão de administradores internos e oculta a conta reservada", async () => {
    mockUseAuth.mockReturnValue(buildAdminAuthValue());

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /fila de moderação/i });
    expect(screen.getByRole("heading", { name: /gestão de administradores internos/i })).toBeInTheDocument();
    expect(screen.getByText(/teammate internal/i)).toBeInTheDocument();
    expect(screen.getByText(/ops admin/i)).toBeInTheDocument();
    expect(screen.queryByText(/administrator@opentalentpool\.org/i)).not.toBeInTheDocument();
  });

  it("permite promover uma conta interna com motivo válido", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildAdminAuthValue());

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /gestão de administradores internos/i });
    await user.type(screen.getByLabelText(/motivo da alteração administrativa/i), "Conta movida para operações administrativas internas.");
    await user.click(screen.getByRole("button", { name: /promover teammate internal/i }));

    await waitFor(() => {
      expect(mockPromoteAdminUser).toHaveBeenCalledWith(12, {
        reason: "Conta movida para operações administrativas internas.",
      });
    });
  });

  it("permite revogar uma conta administrativa gerenciável com motivo válido", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildAdminAuthValue());

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /gestão de administradores internos/i });
    await user.type(screen.getByLabelText(/motivo da alteração administrativa/i), "Conta voltou ao escopo público interno.");
    await user.click(screen.getByRole("button", { name: /revogar ops admin/i }));

    await waitFor(() => {
      expect(mockRevokeAdminUser).toHaveBeenCalledWith(13, {
        reason: "Conta voltou ao escopo público interno.",
      });
    });
  });

  it("mostra erro quando a alteração administrativa falha", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue(buildAdminAuthValue());
    mockPromoteAdminUser.mockRejectedValueOnce({ error: "internal_admin_domain_required" });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /gestão de administradores internos/i });
    await user.type(screen.getByLabelText(/motivo da alteração administrativa/i), "Falha planejada.");
    await user.click(screen.getByRole("button", { name: /promover teammate internal/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });
});
