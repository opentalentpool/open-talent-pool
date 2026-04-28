export type PublicAccountRole = "professional" | "recruiter";
export type AccountRole = PublicAccountRole | "administrator" | "admin";

export interface AuthUser {
  id: number;
  name: string | null;
  email: string;
  role: AccountRole;
  activeRole: AccountRole;
  availableRoles: AccountRole[];
  legacyRole?: AccountRole;
  is_verified: boolean;
  created_at?: string;
}

export interface AuthSession {
  method: "cookie";
}

export interface ApiError {
  error?: string;
  message?: string;
  scope?: string;
  retryAfterSeconds?: number;
  lockoutUntil?: string | null;
  errorCodes?: string[];
  issues?: Array<{
    path: string;
    message: string;
  }>;
}

export interface AuthActionResponse {
  ok: boolean;
  message: string;
  challengeId: string;
}

export interface AuthMeResponse {
  user: AuthUser;
}

export interface AuthVerifyResponse {
  user: AuthUser;
}
