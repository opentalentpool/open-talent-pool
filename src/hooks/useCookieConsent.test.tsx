import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CookieConsentProvider, useCookieConsent } from "@/hooks/useCookieConsent";
import { COOKIE_CONSENT_COOKIE_NAME } from "@/lib/cookie-consent";
import { PENDING_AUTH_STORAGE_KEY } from "@/lib/pending-auth-session";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { getProfessionalProfileDraftStorageKey } from "@/lib/professional-profile-draft";

function clearConsentCookie() {
  document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/`;
}

function ConsentProbe() {
  const {
    decision,
    canUseOptionalStorage,
    isBannerOpen,
    acceptOptionalStorage,
    rejectOptionalStorage,
    reopenPreferences,
  } = useCookieConsent();

  return (
    <div>
      <p>decision:{decision}</p>
      <p>optional-storage:{canUseOptionalStorage ? "yes" : "no"}</p>
      <p>banner:{isBannerOpen ? "open" : "closed"}</p>
      <button type="button" onClick={acceptOptionalStorage}>
        accept
      </button>
      <button type="button" onClick={rejectOptionalStorage}>
        reject
      </button>
      <button type="button" onClick={reopenPreferences}>
        reopen
      </button>
    </div>
  );
}

describe("useCookieConsent", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  it("começa sem decisão quando não existe cookie válido", () => {
    render(
      <CookieConsentProvider>
        <ConsentProbe />
      </CookieConsentProvider>,
    );

    expect(screen.getByText("decision:unset")).toBeInTheDocument();
    expect(screen.getByText("optional-storage:no")).toBeInTheDocument();
    expect(screen.getByText("banner:open")).toBeInTheDocument();
  });

  it("aceita armazenamento opcional, persiste a decisão e fecha o banner", async () => {
    const user = userEvent.setup();

    render(
      <CookieConsentProvider>
        <ConsentProbe />
      </CookieConsentProvider>,
    );

    await user.click(screen.getByRole("button", { name: "accept" }));

    expect(screen.getByText("decision:accepted")).toBeInTheDocument();
    expect(screen.getByText("optional-storage:yes")).toBeInTheDocument();
    expect(screen.getByText("banner:closed")).toBeInTheDocument();
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=`);
  });

  it("rejeita armazenamento opcional, limpa os dados locais e persiste a decisão", async () => {
    const user = userEvent.setup();
    const draftStorageKey = getProfessionalProfileDraftStorageKey(7);
    const legacyDraftStorageKey = "professional_profile_draft:v1:7";

    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(PENDING_AUTH_STORAGE_KEY, "{\"challengeId\":\"abc\"}");
    window.localStorage.setItem(draftStorageKey, "{\"profile\":true}");
    window.localStorage.setItem(legacyDraftStorageKey, "{\"profile\":true}");

    render(
      <CookieConsentProvider>
        <ConsentProbe />
      </CookieConsentProvider>,
    );

    await user.click(screen.getByRole("button", { name: "reject" }));

    expect(screen.getByText("decision:rejected")).toBeInTheDocument();
    expect(screen.getByText("optional-storage:no")).toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(PENDING_AUTH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(draftStorageKey)).toBeNull();
    expect(window.localStorage.getItem(legacyDraftStorageKey)).toBeNull();
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=`);
  });

  it("invalida uma versão antiga do cookie e reabre o banner", () => {
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify({
        decision: "accepted",
        version: "2026-04-01",
        updatedAt: 1714521600000,
      }),
    )}; Path=/`;

    render(
      <CookieConsentProvider>
        <ConsentProbe />
      </CookieConsentProvider>,
    );

    expect(screen.getByText("decision:unset")).toBeInTheDocument();
    expect(screen.getByText("banner:open")).toBeInTheDocument();
  });

  it("permite reabrir as preferências depois de uma escolha anterior", async () => {
    const user = userEvent.setup();

    render(
      <CookieConsentProvider initialDecision="accepted">
        <ConsentProbe />
      </CookieConsentProvider>,
    );

    expect(screen.getByText("banner:closed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "reopen" }));

    expect(screen.getByText("banner:open")).toBeInTheDocument();
  });
});
