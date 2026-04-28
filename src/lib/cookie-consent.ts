import { clearPendingAuthSession, PENDING_AUTH_STORAGE_KEY } from "@/lib/pending-auth-session";
import {
  clearAllProfessionalProfileDrafts,
  PROFESSIONAL_PROFILE_DRAFT_STORAGE_PREFIX,
} from "@/lib/professional-profile-draft";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const COOKIE_CONSENT_COOKIE_NAME = "open-talent-pool-cookie-consent";
export const COOKIE_CONSENT_VERSION = "2026-04-27.v1";
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type CookieConsentDecision = "accepted" | "rejected" | "unset";

export interface CookieConsentRecord {
  decision: Exclude<CookieConsentDecision, "unset">;
  version: string;
  updatedAt: number;
}

function isCookieConsentDecision(value: unknown): value is Exclude<CookieConsentDecision, "unset"> {
  return value === "accepted" || value === "rejected";
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readCookieConsentRecord(): CookieConsentRecord | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookieEntry = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${COOKIE_CONSENT_COOKIE_NAME}=`));

  if (!cookieEntry) {
    return null;
  }

  const rawValue = cookieEntry.slice(COOKIE_CONSENT_COOKIE_NAME.length + 1);

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<CookieConsentRecord>;

    if (
      !isCookieConsentDecision(parsed.decision) ||
      typeof parsed.version !== "string" ||
      typeof parsed.updatedAt !== "number" ||
      !Number.isFinite(parsed.updatedAt)
    ) {
      return null;
    }

    return {
      decision: parsed.decision,
      version: parsed.version,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function getCookieConsentDecision(): CookieConsentDecision {
  const record = readCookieConsentRecord();

  if (!record || record.version !== COOKIE_CONSENT_VERSION) {
    return "unset";
  }

  return record.decision;
}

export function persistCookieConsentDecision(decision: Exclude<CookieConsentDecision, "unset">) {
  if (typeof document === "undefined") {
    return;
  }

  const record: CookieConsentRecord = {
    decision,
    version: COOKIE_CONSENT_VERSION,
    updatedAt: Date.now(),
  };

  const cookieParts = [
    `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(record))}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}`,
  ];

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    cookieParts.push("Secure");
  }

  document.cookie = cookieParts.join("; ");
}

export function clearOptionalBrowserStorage() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(THEME_STORAGE_KEY);
  clearPendingAuthSession();
  clearAllProfessionalProfileDrafts();
}

export const OPTIONAL_STORAGE_KEYS = {
  theme: THEME_STORAGE_KEY,
  pendingAuth: PENDING_AUTH_STORAGE_KEY,
  professionalProfileDraftPrefix: PROFESSIONAL_PROFILE_DRAFT_STORAGE_PREFIX,
};
