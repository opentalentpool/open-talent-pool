import { z } from "zod";

export const PENDING_AUTH_STORAGE_KEY = "otp_pending_auth_session";
export const PENDING_AUTH_TTL_MS = 15 * 60 * 1000;

export type PendingAuthStatus = "missing" | "invalid" | "expired" | "valid";

export interface PendingAuthSession {
  challengeId: string;
  email: string;
  intent: "signin" | "signup";
  expiresAt: number;
  updatedAt: number;
}

const pendingAuthSessionSchema = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{32}$/),
  email: z.string().email(),
  intent: z.enum(["signin", "signup"]),
  expiresAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadPendingAuthSession(now = Date.now()): {
  status: PendingAuthStatus;
  session: PendingAuthSession | null;
} {
  if (!canUseLocalStorage()) {
    return { status: "missing", session: null };
  }

  const rawValue = window.localStorage.getItem(PENDING_AUTH_STORAGE_KEY);

  if (!rawValue) {
    return { status: "missing", session: null };
  }

  try {
    const parsed = pendingAuthSessionSchema.safeParse(JSON.parse(rawValue));

    if (!parsed.success) {
      return { status: "invalid", session: null };
    }

    if (parsed.data.expiresAt <= now) {
      return { status: "expired", session: parsed.data };
    }

    return { status: "valid", session: parsed.data };
  } catch {
    return { status: "invalid", session: null };
  }
}

export function savePendingAuthSession(session: PendingAuthSession) {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(PENDING_AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearPendingAuthSession() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(PENDING_AUTH_STORAGE_KEY);
}
