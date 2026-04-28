import type {
  AuthActionResponse,
  AuthMeResponse,
  AuthUser,
  AuthVerifyResponse,
  PublicAccountRole,
} from "@/types/auth";
import type {
  AffirmativeSearchPayload,
  AffirmativeSearchPolicyStatus,
  FavoriteProfile,
  OwnProfileResponse,
  ProfileData,
  PublicProfileDetail,
  SavedSearch,
  SavedSearchAlertFrequency,
  SavedSearchCriteria,
  SearchProfilesParams,
  SearchProfilesResponse,
} from "@/types/profile";
import type { AccountDeleteResponse, PrivacyExportResponse } from "@/types/legal";
import type {
  AdminManagedUser,
  AdminModerationListResponse,
  AdminUserListResponse,
  ContactAccessLog,
  ModerationReport,
  ReportSubmissionStatus,
} from "@/types/moderation";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function createQueryString(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();

  return query ? `?${query}` : "";
}

async function request<T>(path: string, opts: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...opts,
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw json;
  }

  return json as T;
}

export const authApi = {
  signUp: (payload: {
    name: string;
    email: string;
    role: "professional" | "recruiter";
    acceptedLegalPolicies: boolean;
    captchaToken: string;
  }) =>
    request<AuthActionResponse>("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  requestCode: (payload: { email: string; captchaToken: string }) =>
    request<AuthActionResponse>("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  verify: (payload: { challengeId: string; code: string }) =>
    request<AuthVerifyResponse>("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  signOut: () =>
    request<{ ok: true }>("/api/auth/signout", {
      method: "POST",
    }),
  me: () =>
    request<AuthMeResponse>("/api/auth/me", {
      method: "GET",
    }),
  exportPrivacyData: () =>
    request<PrivacyExportResponse>("/api/auth/account/privacy-export", {
      method: "GET",
    }),
  deleteAccount: (payload: { confirmEmail: string }) =>
    request<AccountDeleteResponse>("/api/auth/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  setActiveRole: (payload: { role: PublicAccountRole }) =>
    request<{ user: AuthUser }>("/api/auth/active-role", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  enableRole: (payload: { role: PublicAccountRole; makeActive?: boolean }) =>
    request<{ user: AuthUser }>("/api/auth/roles/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};

export const profileApi = {
  get: () =>
    request<OwnProfileResponse>("/api/auth/profile", {
      method: "GET",
    }),
  getContactAccesses: () =>
    request<{ accesses: ContactAccessLog[] }>("/api/auth/profile/contact-accesses", {
      method: "GET",
    }),
  requestContactEmailCode: (payload: { nextContactEmail: string }) =>
    request<{ ok: true; message: string; challengeId: string }>("/api/auth/profile/contact-email/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  verifyContactEmailCode: (payload: { challengeId: string; code: string }) =>
    request<{ ok: true; email: string }>("/api/auth/profile/contact-email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  update: (payload: ProfileData & { affirmativeConsentAccepted?: boolean }) =>
    request<{ user: AuthUser } & OwnProfileResponse>("/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
};

export const profilesApi = {
  search: (params: SearchProfilesParams) =>
    request<SearchProfilesResponse>(
      `/api/profiles${createQueryString({
        q: params.q,
        seniority: params.seniority,
        workModel: params.workModel,
        state: params.state,
        openToOpportunities: params.openToOpportunities,
        page: params.page,
        pageSize: params.pageSize,
      })}`,
    ),
  getPublicProfile: (slug: string) =>
    request<{ profile: PublicProfileDetail }>(`/api/profiles/${slug}`),
};

export const recruiterApi = {
  getProfileContact: (slug: string) =>
    request<{ email: string }>(`/api/recruiter/profiles/${slug}/contact`, {
      method: "GET",
    }),
  getFavorites: () =>
    request<{ favorites: FavoriteProfile[] }>("/api/recruiter/favorites", {
    }),
  addFavorite: (profileId: number) =>
    request<{ ok: true }>("/api/recruiter/favorites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profileId }),
    }),
  removeFavorite: (profileId: number) =>
    request<Record<string, never>>(`/api/recruiter/favorites/${profileId}`, {
      method: "DELETE",
    }),
  getSavedSearches: () =>
    request<{ savedSearches: SavedSearch[] }>("/api/recruiter/saved-searches", {
    }),
  getAffirmativeSearchPolicyStatus: () =>
    request<AffirmativeSearchPolicyStatus>("/api/recruiter/affirmative-search/policy-status", {
      method: "GET",
    }),
  acceptAffirmativeSearchPolicy: (payload: { policyVersion: string }) =>
    request<AffirmativeSearchPolicyStatus>("/api/recruiter/affirmative-search/policy-acceptance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  searchAffirmativeProfiles: (payload: AffirmativeSearchPayload) =>
    request<SearchProfilesResponse>("/api/recruiter/affirmative-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  createSavedSearch: (payload: { name: string; criteria: SavedSearchCriteria; alertFrequency: SavedSearchAlertFrequency }) =>
    request<{ savedSearch: SavedSearch }>("/api/recruiter/saved-searches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  updateSavedSearch: (
    id: number,
    payload: Partial<{ name: string; criteria: SavedSearchCriteria; alertFrequency: SavedSearchAlertFrequency }>,
  ) =>
    request<{ savedSearch: SavedSearch }>(`/api/recruiter/saved-searches/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  deleteSavedSearch: (id: number) =>
    request<Record<string, never>>(`/api/recruiter/saved-searches/${id}`, {
      method: "DELETE",
    }),
};

export const reportsApi = {
  getMyStatus: () =>
    request<ReportSubmissionStatus>("/api/reports/me/status", {
      method: "GET",
    }),
  submit: (payload: {
    targetKind: "professional_public_profile" | "recruiter_contact_access";
    targetRef: string;
    category:
      | "false_identity"
      | "third_party_data"
      | "sensitive_data_exposure"
      | "harassment_or_abuse"
      | "fraud_or_misleading"
      | "discrimination"
      | "spam_or_scraping"
      | "other";
    description: string;
  }) =>
    request<{ report: ModerationReport }>("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};

export const adminApi = {
  getModerationReports: () =>
    request<AdminModerationListResponse>("/api/admin/moderation/reports", {
      method: "GET",
    }),
  getModerationReport: (id: number) =>
    request<{ report: ModerationReport }>(`/api/admin/moderation/reports/${id}`, {
      method: "GET",
    }),
  resolveModerationReport: (
    id: number,
    payload: {
      decision:
        | "dismiss_good_faith"
        | "dismiss_false_report"
        | "hide_professional_profile"
        | "suspend_target_account"
        | "permanent_ban_target_account";
      adminNotes: string;
    },
  ) =>
    request<{ report: ModerationReport }>(`/api/admin/moderation/reports/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  restoreProfile: (userId: number, payload: { reason: string }) =>
    request<{ ok: true }>(`/api/admin/moderation/users/${userId}/restore-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  restoreAccount: (userId: number, payload: { reason: string }) =>
    request<{ ok: true }>(`/api/admin/moderation/users/${userId}/restore-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  liftReportingRestriction: (userId: number, payload: { reason: string }) =>
    request<{ ok: true }>(`/api/admin/moderation/users/${userId}/lift-reporting-restriction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  getUsers: (query = "") =>
    request<AdminUserListResponse>(`/api/admin/users${createQueryString({ query })}`, {
      method: "GET",
    }),
  promoteUserToAdministrator: (userId: number, payload: { reason: string }) =>
    request<{ user: AdminManagedUser }>(`/api/admin/users/${userId}/promote-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  revokeAdministratorFromUser: (userId: number, payload: { reason: string }) =>
    request<{ user: AdminManagedUser }>(`/api/admin/users/${userId}/revoke-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};

const api = {
  auth: authApi,
  profile: profileApi,
  profiles: profilesApi,
  recruiter: recruiterApi,
  reports: reportsApi,
  admin: adminApi,
};

export default api;
