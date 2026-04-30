import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

const profilePayload = {
  name: "Ada Lovelace",
  city: "São Paulo",
  state: "SP",
  bio: "Especialista em plataformas.",
  headline: "Staff Engineer",
  linkedin: "https://linkedin.com/in/ada",
  github: "https://github.com/ada",
  portfolio: "https://ada.dev",
  contactEmail: "",
  showContactEmailToRecruiters: false,
  skills: ["React"],
  experiences: [],
  seniority: "senior" as const,
  workModels: ["remoto"],
  openToOpportunities: true,
  isPublished: true,
};

describe("api CSRF handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("não busca CSRF antes de fluxos públicos de autenticação", async () => {
    const { authApi } = await import("./api");
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ok: true,
      message: "Se o e-mail puder receber um código, ele chegará em instantes.",
      challengeId: "a".repeat(32),
    }));

    await authApi.requestCode({
      email: "ada@example.com",
      captchaToken: "captcha-token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/request-code", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    }));
  });

  it("busca e injeta X-CSRF-Token em mutações autenticadas", async () => {
    const { profileApi } = await import("./api");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf-token-1" }))
      .mockResolvedValueOnce(jsonResponse({ profile: profilePayload, user: null }));

    await profileApi.update(profilePayload);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/csrf", expect.objectContaining({
      method: "GET",
      credentials: "include",
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/profile", expect.objectContaining({
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-token-1",
      },
    }));
  });

  it("reutiliza csrfToken retornado pelo verify sem persistir em storage", async () => {
    const { authApi, profileApi } = await import("./api");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        user: {
          id: 1,
          name: "Ada Lovelace",
          email: "ada@example.com",
          role: "professional",
          activeRole: "professional",
          availableRoles: ["professional"],
          is_verified: true,
        },
        csrfToken: "csrf-from-verify",
      }))
      .mockResolvedValueOnce(jsonResponse({ profile: profilePayload, user: null }));

    await authApi.verify({
      challengeId: "a".repeat(32),
      code: "123456",
    });
    await profileApi.update(profilePayload);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/profile", expect.objectContaining({
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-from-verify",
      },
    }));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
