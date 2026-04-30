import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { URL } from "url";
import {
  ASYNC_EMAIL_PRIORITY,
  ASYNC_EMAIL_SOURCE_TYPE,
} from "./async-email.js";
import {
  SIGNUP_POLICY_ACCEPTANCE_SOURCE,
  SIGNUP_REQUIRED_POLICIES,
} from "../src/lib/legal-policies.js";
import { isPublicAccountRole, normalizeAccountRoleList } from "../src/lib/account-roles.js";
import { isLocalDevelopmentHostname, isLocalDevelopmentOrigin } from "../src/lib/development-hosts.js";
import {
  INTERNAL_ACCOUNT_EMAIL_DOMAIN,
  INTERNAL_OPERATIONS_ADMIN_EMAIL,
  INTERNAL_OPERATIONS_ADMIN_NAME,
  INTERNAL_OPERATIONS_ADMIN_ROLE,
  isEligibleInternalAdministratorEmail,
  isInternalAccountDomainEmail,
  isInternalOperationsAdminEmail,
  isInternalOperationsAdminUser,
} from "../src/lib/internal-accounts.js";
import { EmailDeliveryError } from "./runtime.js";
import { ensureUserRole, resolveUserRoles, loadUserRoles } from "./user-roles.js";

export const AUTH_COOKIE_NAME = "otp_session";
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_FAIL_SECRET = "2x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_DUPLICATE_SECRET = "3x0000000000000000000000000000000AA";
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const CHALLENGE_TTL_MS = 15 * 60 * 1000;
const CHALLENGE_COOLDOWN_MS = 60 * 1000;
const CHALLENGE_MAX_ATTEMPTS = 5;
const CHALLENGE_LOCK_MS = 15 * 60 * 1000;
const VERIFY_LOCK_MS = 15 * 60 * 1000;
const INTERNAL_OPERATIONS_ADMIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const INTERNAL_OPERATIONS_ADMIN_CHALLENGE_MAX_ATTEMPTS = 3;
const INTERNAL_OPERATIONS_ADMIN_SESSION_IDLE_MS = 30 * 60 * 1000;
const INTERNAL_OPERATIONS_ADMIN_SESSION_MAX_MS = 12 * 60 * 60 * 1000;
const GENERIC_CHALLENGE_MESSAGE = "Se o e-mail puder receber um código, ele chegará em instantes.";

const SEND_LIMITS = [
  { scope: "auth_send_email_15m", windowMs: 15 * 60 * 1000, limit: 3, key: "email" },
  { scope: "auth_send_ip_15m", windowMs: 15 * 60 * 1000, limit: 10, key: "ip" },
  { scope: "auth_send_ip_24h", windowMs: 24 * 60 * 60 * 1000, limit: 30, key: "ip" },
];

const INTERNAL_OPERATIONS_ADMIN_SEND_LIMITS = [
  { scope: "auth_send_internal_admin_email_15m", windowMs: 15 * 60 * 1000, limit: 2, key: "email" },
  { scope: "auth_send_internal_admin_ip_15m", windowMs: 15 * 60 * 1000, limit: 5, key: "ip" },
  { scope: "auth_send_internal_admin_ip_24h", windowMs: 24 * 60 * 60 * 1000, limit: 10, key: "ip" },
];

const VERIFY_FAILURE_LIMITS = [
  {
    scope: "auth_verify_email_15m",
    windowMs: 15 * 60 * 1000,
    limit: 10,
    key: "email",
    blockMs: VERIFY_LOCK_MS,
    tripAtOrAbove: true,
  },
  {
    scope: "auth_verify_ip_15m",
    windowMs: 15 * 60 * 1000,
    limit: 20,
    key: "ip",
    blockMs: VERIFY_LOCK_MS,
    tripAtOrAbove: true,
  },
];

const INTERNAL_OPERATIONS_ADMIN_VERIFY_FAILURE_LIMITS = [
  {
    scope: "auth_verify_internal_admin_email_15m",
    windowMs: 15 * 60 * 1000,
    limit: 5,
    key: "email",
    blockMs: VERIFY_LOCK_MS,
    tripAtOrAbove: true,
  },
  {
    scope: "auth_verify_internal_admin_ip_15m",
    windowMs: 15 * 60 * 1000,
    limit: 10,
    key: "ip",
    blockMs: VERIFY_LOCK_MS,
    tripAtOrAbove: true,
  },
];

const PROFILE_CONTACT_EMAIL_MESSAGE = "Enviamos um código para o e-mail da sua conta.";

const PROFILE_CONTACT_EMAIL_SEND_LIMITS = [
  { scope: "profile_contact_email_send_account_15m", windowMs: 15 * 60 * 1000, limit: 3, key: "accountEmail" },
  { scope: "profile_contact_email_send_ip_15m", windowMs: 15 * 60 * 1000, limit: 10, key: "ip" },
  { scope: "profile_contact_email_send_ip_24h", windowMs: 24 * 60 * 60 * 1000, limit: 30, key: "ip" },
];

const PROFILE_CONTACT_EMAIL_VERIFY_FAILURE_LIMITS = [
  {
    scope: "profile_contact_email_verify_account_15m",
    windowMs: 15 * 60 * 1000,
    limit: 10,
    key: "accountEmail",
    blockMs: VERIFY_LOCK_MS,
    tripAtOrAbove: true,
  },
  {
    scope: "profile_contact_email_verify_ip_15m",
    windowMs: 15 * 60 * 1000,
    limit: 20,
    key: "ip",
    blockMs: VERIFY_LOCK_MS,
    tripAtOrAbove: true,
  },
];

function resolveInternalAccountConfig(config = {}) {
  return {
    ...config,
    internalOperationsAdminEmail: config.internalOperationsAdminEmail || INTERNAL_OPERATIONS_ADMIN_EMAIL,
    internalAccountEmailDomain: config.internalAccountEmailDomain || INTERNAL_ACCOUNT_EMAIL_DOMAIN,
  };
}

function noopLogger() {
  return undefined;
}

function normalizeLogger(logger = console) {
  return {
    info: logger.info?.bind(logger) || logger.log?.bind(logger) || noopLogger,
    log: logger.log?.bind(logger) || noopLogger,
    warn: logger.warn?.bind(logger) || logger.log?.bind(logger) || noopLogger,
    error: logger.error?.bind(logger) || logger.log?.bind(logger) || noopLogger,
  };
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function futureDate(base, offsetMs) {
  return new Date(toDate(base).getTime() + offsetMs);
}

function minDate(left, right) {
  return left.getTime() <= right.getTime() ? left : right;
}

export function maskEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();

  if (!normalized.includes("@")) {
    return normalized || "unknown";
  }

  const [localPart, domain] = normalized.split("@");
  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}****@${domain}`;
}

function trimUserAgent(value) {
  return String(value || "").slice(0, 512);
}

function createPublicId(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}

function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hmacValue(pepper, namespace, value) {
  return createHmac("sha256", pepper).update(namespace).update(":").update(value).digest("hex");
}

export function hashChallengeCode(challengeId, code, pepper) {
  return hmacValue(pepper, `challenge:${challengeId}`, code);
}

export function hashSessionToken(token, pepper) {
  return hmacValue(pepper, "session", token);
}

export function hashCsrfToken(sessionId, token, pepper) {
  return hmacValue(pepper, `csrf:${sessionId}`, token);
}

export function hashPrivacyActor(identifier, pepper) {
  return hmacValue(pepper, "privacy-actor", String(identifier || "").trim().toLowerCase());
}

export function hashModerationEmail(email, pepper) {
  return hmacValue(pepper, "moderation-ban-email", String(email || "").trim().toLowerCase());
}

export function parseCookies(headerValue = "") {
  return headerValue
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function createWindowKey(windowMs, now) {
  return `${windowMs}:${Math.floor(toDate(now).getTime() / windowMs)}`;
}

function createAllowedOriginSet(config) {
  const candidates = new Set();

  for (const origin of config.trustedOrigins || []) {
    if (origin) {
      candidates.add(origin);
    }
  }

  if (config.appBaseUrl) {
    try {
      candidates.add(new URL(config.appBaseUrl).origin);
    } catch {
      // Ignore invalid URLs here; startup validation lives in runtime.js.
    }
  }

  return candidates;
}

export function createCorsOptions(config) {
  return {
    credentials: true,
    origin(origin, callback) {
      if (isAllowedOrigin(origin, config)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  };
}

export function isAllowedOrigin(origin, config) {
  if (!origin) {
    return true;
  }

  if (createAllowedOriginSet(config).has(origin)) {
    return true;
  }

  return !config.isProduction && isLocalDevelopmentOrigin(origin, config.appBaseUrl);
}

function getExpectedHostname(config) {
  if (!config.appBaseUrl) {
    return null;
  }

  try {
    return new URL(config.appBaseUrl).hostname;
  } catch {
    return null;
  }
}

async function defaultCaptchaVerifier({ token, secretKey, remoteIp, expectedHostname, allowLocalDevelopmentBypass = false }) {
  if (!token) {
    return {
      success: false,
      errorCodes: ["missing-input-response"],
    };
  }

  if (allowLocalDevelopmentBypass && token === TURNSTILE_DUMMY_TOKEN && isLocalDevelopmentHostname(expectedHostname)) {
    return {
      success: true,
      errorCodes: [],
      hostname: expectedHostname || "localhost",
    };
  }

  if (secretKey === TURNSTILE_TEST_SECRET) {
    return {
      success: token === TURNSTILE_DUMMY_TOKEN,
      errorCodes: token === TURNSTILE_DUMMY_TOKEN ? [] : ["invalid-input-response"],
      hostname: "localhost",
    };
  }

  if (secretKey === TURNSTILE_TEST_FAIL_SECRET) {
    return {
      success: false,
      errorCodes: ["invalid-input-response"],
    };
  }

  if (secretKey === TURNSTILE_TEST_DUPLICATE_SECRET) {
    return {
      success: false,
      errorCodes: ["timeout-or-duplicate"],
    };
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret: secretKey,
      response: token,
      remoteip: remoteIp || undefined,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  const payload = await response.json().catch(() => ({
    success: false,
    "error-codes": ["invalid-json-response"],
  }));

  const hostname = payload.hostname || null;
  const hostnameMatches = !expectedHostname || !hostname || hostname === expectedHostname;

  return {
    success: Boolean(payload.success && hostnameMatches),
    errorCodes: payload["error-codes"] || [],
    hostname,
  };
}

function buildCookieOptions(config, { maxAge = config.authSessionMaxMs } = {}) {
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(config.cookieSecure),
    path: "/",
    maxAge,
  };

  if (config.cookieDomain) {
    options.domain = config.cookieDomain;
  }

  return options;
}

function createCsrfToken() {
  return randomBytes(32).toString("base64url");
}

function createCsrfState(sessionId, config) {
  const token = createCsrfToken();

  return {
    token,
    tokenHash: hashCsrfToken(sessionId, token, config.authCodePepper),
  };
}

function safelyCompareHex(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  } catch {
    return false;
  }
}

function getCurrentWindowReset(now, windowMs) {
  const current = toDate(now).getTime();
  const bucketStart = Math.floor(current / windowMs) * windowMs;
  return new Date(bucketStart + windowMs);
}

async function findActiveRateLimitBlock(executor, scope, subject, now) {
  const result = await executor.query(
    `
      SELECT blocked_until
      FROM auth_rate_limits
      WHERE scope = $1
        AND subject = $2
        AND blocked_until IS NOT NULL
        AND blocked_until > $3
      ORDER BY blocked_until DESC
      LIMIT 1
    `,
    [scope, subject, now],
  );

  return result.rows[0] || null;
}

export async function consumeRateLimit(executor, { scope, subject, windowMs, limit, blockMs = 0, tripAtOrAbove = false, now }) {
  if (!subject) {
    return { allowed: true };
  }

  const existingBlock = await findActiveRateLimitBlock(executor, scope, subject, now);

  if (existingBlock) {
    return {
      allowed: false,
      blockedUntil: toDate(existingBlock.blocked_until),
      retryAfterSeconds: Math.max(1, Math.ceil((toDate(existingBlock.blocked_until).getTime() - toDate(now).getTime()) / 1000)),
    };
  }

  const windowKey = createWindowKey(windowMs, now);
  const result = await executor.query(
    `
      INSERT INTO auth_rate_limits (scope, subject, window_key, count, created_at, updated_at)
      VALUES ($1, $2, $3, 1, $4, $4)
      ON CONFLICT (scope, subject, window_key)
      DO UPDATE
      SET count = auth_rate_limits.count + 1,
          updated_at = $4
      RETURNING count, blocked_until
    `,
    [scope, subject, windowKey, now],
  );

  const currentCount = Number(result.rows[0]?.count || 0);
  const limitTriggered = tripAtOrAbove ? currentCount >= limit : currentCount > limit;

  if (!limitTriggered) {
    return {
      allowed: true,
      count: currentCount,
      retryAfterSeconds: Math.max(1, Math.ceil((getCurrentWindowReset(now, windowMs).getTime() - toDate(now).getTime()) / 1000)),
    };
  }

  if (!blockMs) {
    return {
      allowed: false,
      count: currentCount,
      retryAfterSeconds: Math.max(1, Math.ceil((getCurrentWindowReset(now, windowMs).getTime() - toDate(now).getTime()) / 1000)),
    };
  }

  const blockedUntil = futureDate(now, blockMs);

  await executor.query(
    `
      UPDATE auth_rate_limits
      SET blocked_until = $4,
          updated_at = $5
      WHERE scope = $1
        AND subject = $2
        AND window_key = $3
    `,
    [scope, subject, windowKey, blockedUntil, now],
  );

  return {
    allowed: false,
    count: currentCount,
    blockedUntil,
    retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - toDate(now).getTime()) / 1000)),
  };
}

async function getCurrentWindowCount(executor, { scope, subject, windowMs, now }) {
  if (!subject) {
    return 0;
  }

  const result = await executor.query(
    `
      SELECT count
      FROM auth_rate_limits
      WHERE scope = $1
        AND subject = $2
        AND window_key = $3
      LIMIT 1
    `,
    [scope, subject, createWindowKey(windowMs, now)],
  );

  return Number(result.rows[0]?.count || 0);
}

async function findLatestActiveChallenge(executor, email, now) {
  const result = await executor.query(
    `
      SELECT challenge_id, resend_available_at, expires_at
      FROM auth_code_challenges
      WHERE email = $1
        AND invalidated_at IS NULL
        AND consumed_at IS NULL
        AND expires_at > $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [email, now],
  );

  return result.rows[0] || null;
}

async function invalidateActiveChallenges(executor, email, now) {
  await executor.query(
    `
      UPDATE auth_code_challenges
      SET invalidated_at = COALESCE(invalidated_at, $2),
          updated_at = $2
      WHERE email = $1
        AND invalidated_at IS NULL
        AND consumed_at IS NULL
    `,
    [email, now],
  );
}

async function findLatestActiveProfileContactEmailChallenge(executor, { userId, sessionId, nextContactEmail, now }) {
  const result = await executor.query(
    `
      SELECT challenge_id, resend_available_at, expires_at
      FROM profile_contact_email_challenges
      WHERE user_id = $1
        AND session_id = $2
        AND next_contact_email = $3
        AND invalidated_at IS NULL
        AND consumed_at IS NULL
        AND expires_at > $4
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId, sessionId, nextContactEmail, now],
  );

  return result.rows[0] || null;
}

async function invalidateActiveProfileContactEmailChallenges(executor, { userId, sessionId, now, excludeChallengeId = null }) {
  await executor.query(
    `
      UPDATE profile_contact_email_challenges
      SET invalidated_at = COALESCE(invalidated_at, $3),
          updated_at = $3
      WHERE user_id = $1
        AND session_id = $2
        AND invalidated_at IS NULL
        AND consumed_at IS NULL
        AND ($4::text IS NULL OR challenge_id <> $4)
    `,
    [userId, sessionId, now, excludeChallengeId],
  );
}

async function incrementChallengeFailure(executor, challengeId, now) {
  const result = await executor.query(
    `
      UPDATE auth_code_challenges
      SET attempt_count = attempt_count + 1,
          last_attempt_at = $2,
          locked_until = CASE
            WHEN attempt_count + 1 >= max_attempts THEN $3
            ELSE locked_until
          END,
          updated_at = $2
      WHERE challenge_id = $1
      RETURNING attempt_count, max_attempts, locked_until
    `,
    [challengeId, now, futureDate(now, CHALLENGE_LOCK_MS)],
  );

  return result.rows[0] || null;
}

async function incrementProfileContactEmailChallengeFailure(executor, challengeId, now) {
  const result = await executor.query(
    `
      UPDATE profile_contact_email_challenges
      SET attempt_count = attempt_count + 1,
          last_attempt_at = $2,
          locked_until = CASE
            WHEN attempt_count + 1 >= max_attempts THEN $3
            ELSE locked_until
          END,
          updated_at = $2
      WHERE challenge_id = $1
      RETURNING attempt_count, max_attempts, locked_until
    `,
    [challengeId, now, futureDate(now, CHALLENGE_LOCK_MS)],
  );

  return result.rows[0] || null;
}

export function buildRateLimitedError(scope, result, message = "Muitas tentativas. Aguarde antes de tentar novamente.") {
  return {
    status: 429,
    payload: {
      error: "rate_limited",
      scope,
      message,
      retryAfterSeconds: result.retryAfterSeconds,
      lockoutUntil: result.blockedUntil ? result.blockedUntil.toISOString() : null,
    },
  };
}

function buildCaptchaError(message, errorCodes = []) {
  return {
    status: 400,
    payload: {
      error: "captcha_verification_failed",
      message,
      errorCodes,
    },
  };
}

function buildPublicSignupNotAllowedError() {
  return {
    status: 403,
    payload: {
      error: "public_signup_not_allowed",
      message: "Este e-mail é reservado para operações internas.",
    },
  };
}

function buildInternalAccountRoleLockedError() {
  return {
    status: 403,
    payload: {
      error: "internal_account_role_locked",
      message: "Esta conta interna opera apenas no contexto administrativo.",
    },
  };
}

function buildReservedInternalAdminLockedError() {
  return {
    status: 403,
    payload: {
      error: "reserved_internal_admin_locked",
      message: "A conta administrativa reservada não pode ser alterada por este fluxo.",
    },
  };
}

function buildInternalAdminDomainRequiredError() {
  return {
    status: 403,
    payload: {
      error: "internal_admin_domain_required",
      message: "Somente contas internas do domínio configurado podem receber administração.",
    },
  };
}

function buildVerifiedInternalAccountRequiredError() {
  return {
    status: 403,
    payload: {
      error: "verified_internal_account_required",
      message: "A conta interna precisa estar verificada antes da promoção administrativa.",
    },
  };
}

function buildAdministratorRoleAlreadyGrantedError() {
  return {
    status: 409,
    payload: {
      error: "administrator_role_already_granted",
      message: "A conta já opera com privilégios administrativos.",
    },
  };
}

function buildAdministratorRoleNotGrantedError() {
  return {
    status: 409,
    payload: {
      error: "administrator_role_not_granted",
      message: "A conta não está operando como administradora.",
    },
  };
}

function buildPublicRoleSnapshotRequiredError() {
  return {
    status: 409,
    payload: {
      error: "public_role_snapshot_required",
      message: "A conta precisa ter ao menos um papel público para poder ser restaurada depois.",
    },
  };
}

function buildAdministratorSnapshotMissingError() {
  return {
    status: 409,
    payload: {
      error: "administrator_snapshot_missing",
      message: "Não encontramos um snapshot auditado para restaurar os papéis públicos desta conta.",
    },
  };
}

function isAdministratorRole(value) {
  return value === "administrator" || value === "admin";
}

function getChallengeTtlMs(email, config) {
  return isInternalOperationsAdminEmail(email, config)
    ? INTERNAL_OPERATIONS_ADMIN_CHALLENGE_TTL_MS
    : CHALLENGE_TTL_MS;
}

function getChallengeMaxAttempts(email, config) {
  return isInternalOperationsAdminEmail(email, config)
    ? INTERNAL_OPERATIONS_ADMIN_CHALLENGE_MAX_ATTEMPTS
    : CHALLENGE_MAX_ATTEMPTS;
}

function getSendLimits(email, config) {
  return isInternalOperationsAdminEmail(email, config)
    ? INTERNAL_OPERATIONS_ADMIN_SEND_LIMITS
    : SEND_LIMITS;
}

function getVerifyFailureLimits(email, config) {
  return isInternalOperationsAdminEmail(email, config)
    ? INTERNAL_OPERATIONS_ADMIN_VERIFY_FAILURE_LIMITS
    : VERIFY_FAILURE_LIMITS;
}

function getSessionDurationsForUser(user, config) {
  if (isInternalOperationsAdminUser(user, config)) {
    return {
      idleMs: INTERNAL_OPERATIONS_ADMIN_SESSION_IDLE_MS,
      absoluteMs: INTERNAL_OPERATIONS_ADMIN_SESSION_MAX_MS,
    };
  }

  return {
    idleMs: config.authSessionIdleMs,
    absoluteMs: config.authSessionMaxMs,
  };
}

function buildAuthCookieState(res, sessionToken, config, { maxAge = config.authSessionMaxMs } = {}) {
  res.cookie(AUTH_COOKIE_NAME, sessionToken, buildCookieOptions(config, { maxAge }));
}

function clearAuthCookieState(res, config) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...buildCookieOptions(config),
    maxAge: 0,
  });
}

function getSessionTokenFromRequest(req) {
  return parseCookies(req.headers.cookie || "")[AUTH_COOKIE_NAME] || null;
}

export function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function fetchUserByEmail(executor, email) {
  const result = await executor.query(
    "SELECT id, name, email, role, account_status, reporting_restricted_until, reporting_restriction_reason, is_verified, created_at FROM users WHERE email = $1 LIMIT 1",
    [email],
  );

  return result.rows[0] || null;
}

async function isEmailModerationBanned(executor, email, pepper) {
  const emailHash = hashModerationEmail(email, pepper);
  const result = await executor.query(
    `
      SELECT id
      FROM moderation_banned_email_hashes
      WHERE email_hash = $1
      LIMIT 1
    `,
    [emailHash],
  );

  return Boolean(result.rows[0]?.id);
}

async function fetchUserById(executor, userId) {
  const result = await executor.query(
    "SELECT id, name, email, role, account_status, reporting_restricted_until, reporting_restriction_reason, is_verified, created_at FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );

  return result.rows[0] || null;
}

async function ensureInternalOperationsAdminAccount(executor, email, config, now = new Date()) {
  if (!isInternalOperationsAdminEmail(email, config)) {
    return fetchUserByEmail(executor, email);
  }

  const existing = await fetchUserByEmail(executor, email);
  let user = existing;

  if (!existing) {
    const inserted = await executor.query(
      `
        INSERT INTO users (name, email, role, is_verified)
        VALUES ($1, $2, $3, true)
        RETURNING id, name, email, role, account_status, reporting_restricted_until, reporting_restriction_reason, is_verified, created_at
      `,
      [INTERNAL_OPERATIONS_ADMIN_NAME, email, INTERNAL_OPERATIONS_ADMIN_ROLE],
    );

    user = inserted.rows[0] || null;
  } else {
    const updated = await executor.query(
      `
        UPDATE users
        SET name = $1,
            role = $2,
            is_verified = true
        WHERE id = $3
        RETURNING id, name, email, role, account_status, reporting_restricted_until, reporting_restriction_reason, is_verified, created_at
      `,
      [INTERNAL_OPERATIONS_ADMIN_NAME, INTERNAL_OPERATIONS_ADMIN_ROLE, existing.id],
    );

    user = updated.rows[0] || null;
  }

  if (!user) {
    return null;
  }

  await executor.query(
    `
      DELETE FROM user_roles
      WHERE user_id = $1
        AND role <> $2
    `,
    [user.id, INTERNAL_OPERATIONS_ADMIN_ROLE],
  );
  await ensureUserRole(executor, user.id, INTERNAL_OPERATIONS_ADMIN_ROLE, now);

  await executor.query(
    `
      UPDATE auth_sessions
      SET active_role = $2
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [user.id, INTERNAL_OPERATIONS_ADMIN_ROLE],
  );

  await executor.query(
    `
      UPDATE user_profiles
      SET is_published = false,
          published_at = NULL,
          updated_at = $2,
          expired_at = CASE
            WHEN is_published = true AND (expired_at IS NULL OR expired_at > $2) THEN $2
            ELSE expired_at
          END
      WHERE user_id = $1
    `,
    [user.id, now],
  );

  return fetchUserById(executor, user.id);
}

async function revokeUserSessions(executor, userId, reason, now = new Date()) {
  await executor.query(
    `
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, $2),
          revoked_reason = COALESCE(revoked_reason, $3)
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId, now, reason],
  );
}

async function loadUserProfileAdminState(executor, userId) {
  const result = await executor.query(
    `
      SELECT is_published, public_slug
      FROM user_profiles
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

async function unpublishUserProfileForAdministrativeRole(executor, userId, now = new Date()) {
  await executor.query(
    `
      UPDATE user_profiles
      SET is_published = false,
          published_at = NULL,
          updated_at = $2,
          expired_at = CASE
            WHEN is_published = true AND (expired_at IS NULL OR expired_at > $2) THEN $2
            ELSE expired_at
          END
      WHERE user_id = $1
    `,
    [userId, now],
  );
}

async function recordAdminRoleAction(
  executor,
  { actionType, targetUserId, createdByAdminUserId = null, reason, metadata = {}, now = new Date() },
) {
  const result = await executor.query(
    `
      INSERT INTO admin_role_actions (
        action_type,
        target_user_id,
        created_by_admin_user_id,
        reason,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      RETURNING id
    `,
    [actionType, targetUserId, createdByAdminUserId, reason, JSON.stringify(metadata || {}), now],
  );

  return result.rows[0] || null;
}

async function loadLatestGrantAdministratorAction(executor, targetUserId) {
  const result = await executor.query(
    `
      SELECT id, action_type, reason, metadata_json, created_at
      FROM admin_role_actions
      WHERE target_user_id = $1
        AND action_type = 'grant_administrator'
      ORDER BY id DESC
      LIMIT 1
    `,
    [targetUserId],
  );

  return result.rows[0] || null;
}

function normalizePublicRoleSnapshot(metadata) {
  return normalizeAccountRoleList(
    Array.isArray(metadata?.publicRoles)
      ? metadata.publicRoles.filter(isPublicAccountRole)
      : [],
  );
}

function mapAdminManagedUser(row, config) {
  const isReservedInternalAdmin = isInternalOperationsAdminEmail(row.email, config);
  const isAdministrator = isAdministratorRole(row.role);
  const latestGrantMetadata = row.latest_grant_metadata_json || {};
  const restorablePublicRoles = normalizePublicRoleSnapshot(latestGrantMetadata);

  return {
    id: Number(row.id),
    name: row.name || "Conta interna",
    email: row.email,
    isVerified: Boolean(row.is_verified),
    isAdministrator,
    isReservedInternalAdmin,
    canPromote: Boolean(
      !isReservedInternalAdmin &&
      !isAdministrator &&
      row.is_verified &&
      isEligibleInternalAdministratorEmail(row.email, config),
    ),
    canRevoke: Boolean(
      !isReservedInternalAdmin &&
      isAdministrator &&
      restorablePublicRoles.length > 0,
    ),
    lastAdminAction: row.last_action_type
      ? {
          actionType: row.last_action_type,
          reason: row.last_action_reason,
          createdAt: row.last_action_created_at ? new Date(row.last_action_created_at).toISOString() : null,
          createdByName: row.last_action_created_by_name || null,
        }
      : null,
  };
}

async function listManagedInternalAdminUsers(executor, config) {
  const result = await executor.query(
    `
      SELECT
        id,
        name,
        email,
        role,
        is_verified
      FROM users
      WHERE LOWER(email) <> $1
        AND LOWER(email) LIKE $2
        AND (is_verified = true OR role IN ('administrator', 'admin'))
      ORDER BY
        CASE WHEN role IN ('administrator', 'admin') THEN 0 ELSE 1 END,
        LOWER(COALESCE(name, '')),
        id DESC
    `,
    [config.internalOperationsAdminEmail, `%@${config.internalAccountEmailDomain}`],
  );

  if (result.rows.length === 0) {
    return [];
  }

  const actionResult = await executor.query(
    `
      SELECT
        ara.id,
        ara.target_user_id,
        ara.action_type,
        ara.reason,
        ara.created_at,
        ara.metadata_json,
        action_actor.name AS created_by_name
      FROM admin_role_actions ara
      LEFT JOIN users action_actor ON action_actor.id = ara.created_by_admin_user_id
      ORDER BY ara.target_user_id ASC, ara.id DESC
    `,
  );

  const latestActionByUserId = new Map();
  const latestGrantByUserId = new Map();

  for (const action of actionResult.rows) {
    const targetUserId = Number(action.target_user_id);

    if (!latestActionByUserId.has(targetUserId)) {
      latestActionByUserId.set(targetUserId, action);
    }

    if (action.action_type === "grant_administrator" && !latestGrantByUserId.has(targetUserId)) {
      latestGrantByUserId.set(targetUserId, action);
    }
  }

  return result.rows.map((row) => {
    const latestAction = latestActionByUserId.get(Number(row.id)) || null;
    const latestGrant = latestGrantByUserId.get(Number(row.id)) || null;

    return mapAdminManagedUser({
      ...row,
      last_action_type: latestAction?.action_type || null,
      last_action_reason: latestAction?.reason || null,
      last_action_created_at: latestAction?.created_at || null,
      last_action_created_by_name: latestAction?.created_by_name || null,
      latest_grant_metadata_json: latestGrant?.metadata_json || null,
    }, config);
  });
}

function buildAuthenticatedUser(user, activeRole, availableRoles = []) {
  const normalizedRoles = normalizeAccountRoleList(availableRoles);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: activeRole,
    activeRole,
    availableRoles: normalizedRoles,
    legacyRole: user.role,
    is_verified: user.is_verified,
    created_at: user.created_at,
  };
}

async function upsertSignupUser(executor, { email, name, role }) {
  const existing = await fetchUserByEmail(executor, email);

  if (!existing) {
      const inserted = await executor.query(
      `
        INSERT INTO users (name, email, role, is_verified)
        VALUES ($1, $2, $3, false)
        RETURNING id, name, email, role, account_status, reporting_restricted_until, reporting_restriction_reason, is_verified, created_at
      `,
      [name, email, role],
    );

    await ensureUserRole(executor, inserted.rows[0].id, role);

    return inserted.rows[0];
  }

  if (!existing.is_verified) {
    const updated = await executor.query(
      `
        UPDATE users
        SET name = $1,
            role = $2
        WHERE id = $3
        RETURNING id, name, email, role, account_status, reporting_restricted_until, reporting_restriction_reason, is_verified, created_at
      `,
      [name, role, existing.id],
    );

    await ensureUserRole(executor, existing.id, role);

    return updated.rows[0];
  }

  await ensureUserRole(executor, existing.id, existing.role);

  return existing;
}

async function recordLegalAuditPolicyAcceptance(
  executor,
  {
    actorHash,
    accountRole,
    policyKey,
    policyVersion,
    policyHash,
    source,
    occurredAt,
  },
) {
  await executor.query(
    `
      INSERT INTO legal_audit_ledger (
        event_type,
        actor_hash,
        account_role,
        policy_key,
        policy_version,
        policy_hash,
        source,
        occurred_at,
        created_at
      )
      VALUES ('policy_acceptance', $1, $2, $3, $4, $5, $6, $7, $7)
    `,
    [actorHash, accountRole, policyKey, policyVersion, policyHash, source, occurredAt],
  );
}

async function recordSignupPolicyAcceptances(executor, { userId, actorHash, accountRole, now }) {
  for (const policy of SIGNUP_REQUIRED_POLICIES) {
    const insertedAcceptance = await executor.query(
      `
        INSERT INTO user_policy_acceptances (
          user_id,
          policy_key,
          policy_version,
          policy_hash,
          acceptance_source,
          accepted_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (user_id, policy_key, policy_version) DO NOTHING
        RETURNING id
      `,
      [userId, policy.key, policy.version, policy.hash, SIGNUP_POLICY_ACCEPTANCE_SOURCE, now],
    );

    if (insertedAcceptance.rows.length) {
      await recordLegalAuditPolicyAcceptance(executor, {
        actorHash,
        accountRole,
        policyKey: policy.key,
        policyVersion: policy.version,
        policyHash: policy.hash,
        source: SIGNUP_POLICY_ACCEPTANCE_SOURCE,
        occurredAt: now,
      });
    }
  }
}

export function createAuthService({
  pool,
  config,
  sendCodeEmail = async () => {},
  logger = console,
  captchaVerifier = defaultCaptchaVerifier,
}) {
  config = resolveInternalAccountConfig(config);
  const safeLogger = normalizeLogger(logger);
  const expectedHostname = getExpectedHostname(config);

  function resolveAuthEmailAppBaseUrl(requestOrigin) {
    if (config.isProduction || !requestOrigin) {
      return config.appBaseUrl;
    }

    if (!isLocalDevelopmentOrigin(requestOrigin, config.appBaseUrl)) {
      return config.appBaseUrl;
    }

    try {
      return new URL(requestOrigin).origin;
    } catch {
      return config.appBaseUrl;
    }
  }

  async function verifyCaptchaOrThrow(captchaToken, remoteIp) {
    if (!captchaToken) {
      throw {
        status: 400,
        payload: {
          error: "captcha_required",
          message: "Conclua a validação anti-bot antes de continuar.",
        },
      };
    }

    const result = await captchaVerifier({
      token: captchaToken,
      secretKey: config.turnstileSecretKey,
      remoteIp,
      expectedHostname,
      allowLocalDevelopmentBypass: !config.isProduction,
    }).catch((error) => {
      safeLogger.warn("[AUTH][captcha_unavailable]", error);
      return {
        success: false,
        errorCodes: ["internal-error"],
      };
    });

    if (!result.success) {
      throw buildCaptchaError("Não foi possível validar a proteção anti-bot.", result.errorCodes);
    }
  }

  async function enforceSendLimits(executor, email, remoteIp, now) {
    for (const limit of getSendLimits(email, config)) {
      const subject = limit.key === "email" ? email : remoteIp;
      const rateLimit = await consumeRateLimit(executor, {
        ...limit,
        subject,
        now,
      });

      if (!rateLimit.allowed) {
        safeLogger.warn("[AUTH][send_rate_limited]", {
          scope: limit.scope,
          email: maskEmail(email),
          ip: remoteIp,
        });
        throw buildRateLimitedError(limit.scope, rateLimit, "Muitos pedidos de código. Aguarde antes de tentar novamente.");
      }
    }
  }

  async function enforceVerifyBlocks(executor, { email, remoteIp, now }) {
    for (const limit of getVerifyFailureLimits(email, config)) {
      const subject = limit.key === "email" ? email : remoteIp;

      if (!subject) {
        continue;
      }

      const activeBlock = await findActiveRateLimitBlock(executor, limit.scope, subject, now);

      if (activeBlock) {
        const blockedUntil = toDate(activeBlock.blocked_until);
        throw buildRateLimitedError(limit.scope, {
          blockedUntil,
          retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - toDate(now).getTime()) / 1000)),
        });
      }
    }
  }

  async function recordVerifyFailure(executor, { email, remoteIp, now }) {
    const results = [];

    for (const limit of getVerifyFailureLimits(email, config)) {
      const subject = limit.key === "email" ? email : remoteIp;

      if (!subject) {
        continue;
      }

      const rateLimit = await consumeRateLimit(executor, {
        ...limit,
        subject,
        now,
      });

      results.push({ scope: limit.scope, result: rateLimit });
    }

    const triggered = results.find(({ result }) => !result.allowed);

    if (triggered) {
      safeLogger.warn("[AUTH][verify_rate_limited]", {
        scope: triggered.scope,
        email: email ? maskEmail(email) : null,
        ip: remoteIp,
      });
      throw buildRateLimitedError(triggered.scope, triggered.result);
    }
  }

  async function enforceProfileContactEmailSendLimits(executor, accountEmail, remoteIp, now) {
    for (const limit of PROFILE_CONTACT_EMAIL_SEND_LIMITS) {
      const subject = limit.key === "accountEmail" ? accountEmail : remoteIp;
      const rateLimit = await consumeRateLimit(executor, {
        ...limit,
        subject,
        now,
      });

      if (!rateLimit.allowed) {
        safeLogger.warn("[AUTH][profile_contact_email_send_rate_limited]", {
          scope: limit.scope,
          email: maskEmail(accountEmail),
          ip: remoteIp,
        });
        throw buildRateLimitedError(limit.scope, rateLimit, "Muitos pedidos de código. Aguarde antes de tentar novamente.");
      }
    }
  }

  async function enforceProfileContactEmailVerifyBlocks(executor, { accountEmail, remoteIp, now }) {
    for (const limit of PROFILE_CONTACT_EMAIL_VERIFY_FAILURE_LIMITS) {
      const subject = limit.key === "accountEmail" ? accountEmail : remoteIp;

      if (!subject) {
        continue;
      }

      const activeBlock = await findActiveRateLimitBlock(executor, limit.scope, subject, now);

      if (activeBlock) {
        const blockedUntil = toDate(activeBlock.blocked_until);
        throw buildRateLimitedError(limit.scope, {
          blockedUntil,
          retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - toDate(now).getTime()) / 1000)),
        });
      }
    }
  }

  async function recordProfileContactEmailVerifyFailure(executor, { accountEmail, remoteIp, now }) {
    const results = [];

    for (const limit of PROFILE_CONTACT_EMAIL_VERIFY_FAILURE_LIMITS) {
      const subject = limit.key === "accountEmail" ? accountEmail : remoteIp;

      if (!subject) {
        continue;
      }

      const rateLimit = await consumeRateLimit(executor, {
        ...limit,
        subject,
        now,
      });

      results.push({ scope: limit.scope, result: rateLimit });
    }

    const triggered = results.find(({ result }) => !result.allowed);

    if (triggered) {
      safeLogger.warn("[AUTH][profile_contact_email_verify_rate_limited]", {
        scope: triggered.scope,
        email: accountEmail ? maskEmail(accountEmail) : null,
        ip: remoteIp,
      });
      throw buildRateLimitedError(triggered.scope, triggered.result);
    }
  }

  async function createSession(executor, user, activeRole, remoteIp, userAgent, now) {
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionId = createPublicId(16);
    const tokenHash = hashSessionToken(sessionToken, config.authCodePepper);
    const csrfState = createCsrfState(sessionId, config);
    const sessionDurations = getSessionDurationsForUser(user, config);
    const absoluteExpiresAt = futureDate(now, sessionDurations.absoluteMs);
    const idleExpiresAt = futureDate(now, sessionDurations.idleMs);

    await executor.query(
      `
        UPDATE auth_sessions
        SET revoked_at = COALESCE(revoked_at, $2),
            revoked_reason = COALESCE(revoked_reason, 'rotated')
        WHERE user_id = $1
          AND revoked_at IS NULL
      `,
      [user.id, now],
    );

    await executor.query(
      `
        INSERT INTO auth_sessions (
          session_id,
          user_id,
          token_hash,
          active_role,
          created_at,
          last_seen_at,
          idle_expires_at,
          absolute_expires_at,
          csrf_token_hash,
          created_ip,
          created_user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10)
      `,
      [
        sessionId,
        user.id,
        tokenHash,
        activeRole,
        now,
        idleExpiresAt,
        absoluteExpiresAt,
        csrfState.tokenHash,
        remoteIp,
        trimUserAgent(userAgent),
      ],
    );

    return {
      sessionToken,
      csrfToken: csrfState.token,
      sessionDurations,
    };
  }

  async function issueChallenge({
    flow,
    email,
    name = null,
    role = null,
    acceptedLegalPolicies = false,
    captchaToken,
    remoteIp,
    userAgent,
    requestOrigin = "",
  }) {
    const now = new Date();
    await verifyCaptchaOrThrow(captchaToken, remoteIp);

    if (flow === "signup" && isInternalOperationsAdminEmail(email, config)) {
      throw buildPublicSignupNotAllowedError();
    }

    const existingChallenge = await findLatestActiveChallenge(pool, email, now);

    if (existingChallenge && toDate(existingChallenge.resend_available_at) > now) {
      return {
        ok: true,
        message: GENERIC_CHALLENGE_MESSAGE,
        challengeId: existingChallenge.challenge_id,
      };
    }

    await enforceSendLimits(pool, email, remoteIp, now);

    const client = await pool.connect();
    let challengeIdToCleanup = null;
    let challengeRowIdToCleanup = null;

    try {
      await client.query("BEGIN");

      let user = null;
      let challengePurpose = "login";
      let shouldSendEmail = false;
      const moderationBanned = await isEmailModerationBanned(client, email, config.authCodePepper);

      if (moderationBanned) {
        challengePurpose = flow === "signup" ? "signup" : "login";
      } else if (flow === "signup") {
        user = await upsertSignupUser(client, {
          email,
          name,
          role,
        });

        if (user?.id && acceptedLegalPolicies) {
          await recordSignupPolicyAcceptances(client, {
            userId: user.id,
            actorHash: hashPrivacyActor(email, config.authCodePepper),
            accountRole: role,
            now,
          });
        }

        if (user.is_verified) {
          challengePurpose = "login";
          shouldSendEmail = true;
        } else {
          challengePurpose = "signup";
          shouldSendEmail = true;
        }
      } else {
        if (isInternalOperationsAdminEmail(email, config)) {
          user = await ensureInternalOperationsAdminAccount(client, email, config, now);
          challengePurpose = "login";
          shouldSendEmail = true;
        } else {
          user = await fetchUserByEmail(client, email);

          if (user?.is_verified) {
            challengePurpose = "login";
            shouldSendEmail = true;
          } else if (user) {
            challengePurpose = "signup";
            shouldSendEmail = true;
          }
        }
      }

      await invalidateActiveChallenges(client, email, now);

      const challengeId = createPublicId(16);
      challengeIdToCleanup = challengeId;
      const code = generateCode();
      const codeHash = hashChallengeCode(challengeId, code, config.authCodePepper);
      const expiresAt = futureDate(now, getChallengeTtlMs(email, config));
      const resendAvailableAt = futureDate(now, CHALLENGE_COOLDOWN_MS);
      const maxAttempts = getChallengeMaxAttempts(email, config);

      const challengeInsert = await client.query(
        `
          INSERT INTO auth_code_challenges (
            challenge_id,
            email,
            user_id,
            purpose,
            code_hash,
            expires_at,
            resend_available_at,
            max_attempts,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
          RETURNING id
        `,
        [challengeId, email, user?.id || null, challengePurpose, codeHash, expiresAt, resendAvailableAt, maxAttempts, now],
      );
      const challengeRowId = Number(challengeInsert.rows[0]?.id || 0) || null;
      challengeRowIdToCleanup = challengeRowId;

      if (shouldSendEmail) {
        await sendCodeEmail(email, code, challengePurpose === "login" ? "login" : "verification", {
          executor: client,
          challengeId,
          email,
          appBaseUrl: resolveAuthEmailAppBaseUrl(requestOrigin),
          sourceType: ASYNC_EMAIL_SOURCE_TYPE.authCodeChallenge,
          sourceId: challengeRowId,
          priority: ASYNC_EMAIL_PRIORITY.authCode,
        });
      }

      if (!shouldSendEmail) {
        safeLogger.info("[AUTH][challenge_suppressed]", {
          flow,
          email: maskEmail(email),
          moderationBanned,
          ip: remoteIp,
          userAgent: trimUserAgent(userAgent),
        });
      }

      await client.query("COMMIT");

      return {
        ok: true,
        message: GENERIC_CHALLENGE_MESSAGE,
        challengeId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (challengeRowIdToCleanup) {
        await pool.query(
          "DELETE FROM email_outbox WHERE source_type = $1 AND source_id = $2",
          [ASYNC_EMAIL_SOURCE_TYPE.authCodeChallenge, challengeRowIdToCleanup],
        ).catch(() => undefined);
      }
      if (challengeIdToCleanup) {
        await pool.query("DELETE FROM auth_code_challenges WHERE challenge_id = $1", [challengeIdToCleanup]).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function issueProfileContactEmailChallenge({
    userId,
    sessionId,
    accountEmail,
    nextContactEmail,
    remoteIp,
    userAgent,
    requestOrigin = "",
  }) {
    const now = new Date();
    const existingChallenge = await findLatestActiveProfileContactEmailChallenge(pool, {
      userId,
      sessionId,
      nextContactEmail,
      now,
    });

    if (existingChallenge && toDate(existingChallenge.resend_available_at) > now) {
      return {
        ok: true,
        message: PROFILE_CONTACT_EMAIL_MESSAGE,
        challengeId: existingChallenge.challenge_id,
      };
    }

    await enforceProfileContactEmailSendLimits(pool, accountEmail, remoteIp, now);

    const client = await pool.connect();
    let challengeIdToCleanup = null;
    let challengeRowIdToCleanup = null;

    try {
      await client.query("BEGIN");

      await invalidateActiveProfileContactEmailChallenges(client, {
        userId,
        sessionId,
        now,
      });

      const challengeId = createPublicId(16);
      challengeIdToCleanup = challengeId;
      const code = generateCode();
      const codeHash = hashChallengeCode(challengeId, code, config.authCodePepper);
      const expiresAt = futureDate(now, CHALLENGE_TTL_MS);
      const resendAvailableAt = futureDate(now, CHALLENGE_COOLDOWN_MS);

      const challengeInsert = await client.query(
        `
          INSERT INTO profile_contact_email_challenges (
            challenge_id,
            user_id,
            session_id,
            account_email,
            next_contact_email,
            code_hash,
            expires_at,
            resend_available_at,
            max_attempts,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
          RETURNING id
        `,
        [
          challengeId,
          userId,
          sessionId,
          accountEmail,
          nextContactEmail,
          codeHash,
          expiresAt,
          resendAvailableAt,
          CHALLENGE_MAX_ATTEMPTS,
          now,
        ],
      );
      const challengeRowId = Number(challengeInsert.rows[0]?.id || 0) || null;
      challengeRowIdToCleanup = challengeRowId;

      await sendCodeEmail(accountEmail, code, "profile_contact_email", {
        executor: client,
        challengeId,
        email: accountEmail,
        appBaseUrl: resolveAuthEmailAppBaseUrl(requestOrigin),
        sourceType: ASYNC_EMAIL_SOURCE_TYPE.profileContactEmailChallenge,
        sourceId: challengeRowId,
        priority: ASYNC_EMAIL_PRIORITY.authCode,
      });

      await client.query("COMMIT");

      return {
        ok: true,
        message: PROFILE_CONTACT_EMAIL_MESSAGE,
        challengeId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (challengeRowIdToCleanup) {
        await pool.query(
          "DELETE FROM email_outbox WHERE source_type = $1 AND source_id = $2",
          [ASYNC_EMAIL_SOURCE_TYPE.profileContactEmailChallenge, challengeRowIdToCleanup],
        ).catch(() => undefined);
      }
      if (challengeIdToCleanup) {
        await pool.query("DELETE FROM profile_contact_email_challenges WHERE challenge_id = $1", [challengeIdToCleanup]).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function verifyProfileContactEmailChallenge({ challengeId, code, userId, sessionId, remoteIp }) {
    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const challengeResult = await client.query(
        `
          SELECT
            challenge_id,
            user_id,
            session_id,
            account_email,
            next_contact_email,
            code_hash,
            expires_at,
            verified_at,
            consumed_at,
            invalidated_at,
            locked_until
          FROM profile_contact_email_challenges
          WHERE challenge_id = $1
          LIMIT 1
        `,
        [challengeId],
      );

      const challenge = challengeResult.rows[0] || null;

      await enforceProfileContactEmailVerifyBlocks(client, {
        accountEmail: challenge?.account_email || null,
        remoteIp,
        now,
      });

      if (!challenge || Number(challenge.user_id) !== Number(userId) || challenge.session_id !== sessionId) {
        await recordProfileContactEmailVerifyFailure(client, {
          accountEmail: challenge?.account_email || null,
          remoteIp,
          now,
        });
        throw {
          status: 400,
          payload: {
            error: "invalid_or_expired_code",
            message: "Código inválido ou expirado.",
          },
        };
      }

      if (
        challenge.consumed_at ||
        challenge.invalidated_at ||
        toDate(challenge.expires_at) <= now ||
        (challenge.locked_until && toDate(challenge.locked_until) > now)
      ) {
        if (challenge.locked_until && toDate(challenge.locked_until) > now) {
          throw buildRateLimitedError("profile_contact_email_verify_challenge", {
            blockedUntil: toDate(challenge.locked_until),
            retryAfterSeconds: Math.max(1, Math.ceil((toDate(challenge.locked_until).getTime() - now.getTime()) / 1000)),
          });
        }

        throw {
          status: 400,
          payload: {
            error: "invalid_or_expired_code",
            message: "Código inválido ou expirado.",
          },
        };
      }

      const expectedHash = hashChallengeCode(challenge.challenge_id, code, config.authCodePepper);

      if (expectedHash !== challenge.code_hash) {
        const challengeState = await incrementProfileContactEmailChallengeFailure(client, challenge.challenge_id, now);

        if (challengeState?.locked_until && toDate(challengeState.locked_until) > now) {
          safeLogger.warn("[AUTH][profile_contact_email_challenge_locked]", {
            email: maskEmail(challenge.account_email),
            ip: remoteIp,
          });
        }

        await recordProfileContactEmailVerifyFailure(client, {
          accountEmail: challenge.account_email,
          remoteIp,
          now,
        });

        throw {
          status: 400,
          payload: {
            error: "invalid_or_expired_code",
            message: "Código inválido ou expirado.",
          },
        };
      }

      await client.query(
        `
          UPDATE profile_contact_email_challenges
          SET verified_at = COALESCE(verified_at, $2),
              updated_at = $2
          WHERE challenge_id = $1
        `,
        [challenge.challenge_id, now],
      );

      await invalidateActiveProfileContactEmailChallenges(client, {
        userId,
        sessionId,
        now,
        excludeChallengeId: challenge.challenge_id,
      });

      await client.query("COMMIT");

      return {
        ok: true,
        email: challenge.next_contact_email,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function consumeVerifiedProfileContactEmailChallenge(executor, { userId, sessionId, nextContactEmail, now = new Date() }) {
    const challengeResult = await executor.query(
      `
        SELECT challenge_id
        FROM profile_contact_email_challenges
        WHERE user_id = $1
          AND session_id = $2
          AND next_contact_email = $3
          AND verified_at IS NOT NULL
          AND invalidated_at IS NULL
          AND consumed_at IS NULL
          AND expires_at > $4
        ORDER BY verified_at DESC, created_at DESC
        LIMIT 1
      `,
      [userId, sessionId, nextContactEmail, now],
    );

    const challengeIdToConsume = challengeResult.rows[0]?.challenge_id || null;

    if (!challengeIdToConsume) {
      return false;
    }

    await executor.query(
      `
        UPDATE profile_contact_email_challenges
        SET consumed_at = $2,
            updated_at = $2
        WHERE challenge_id = $1
      `,
      [challengeIdToConsume, now],
    );

    return true;
  }

  async function verifyChallenge({ challengeId, code, remoteIp, userAgent, res }) {
    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const challengeResult = await client.query(
        `
          SELECT challenge_id, email, user_id, purpose, code_hash, expires_at, consumed_at, invalidated_at, locked_until
          FROM auth_code_challenges
          WHERE challenge_id = $1
          LIMIT 1
        `,
        [challengeId],
      );

      const challenge = challengeResult.rows[0] || null;

      await enforceVerifyBlocks(client, {
        email: challenge?.email || null,
        remoteIp,
        now,
      });

      if (!challenge) {
        await recordVerifyFailure(client, { email: null, remoteIp, now });
        throw {
          status: 400,
          payload: {
            error: "invalid_or_expired_code",
            message: "Código inválido ou expirado.",
          },
        };
      }

      if (
        challenge.consumed_at ||
        challenge.invalidated_at ||
        toDate(challenge.expires_at) <= now ||
        (challenge.locked_until && toDate(challenge.locked_until) > now)
      ) {
        if (challenge.locked_until && toDate(challenge.locked_until) > now) {
          throw buildRateLimitedError("auth_verify_challenge", {
            blockedUntil: toDate(challenge.locked_until),
            retryAfterSeconds: Math.max(1, Math.ceil((toDate(challenge.locked_until).getTime() - now.getTime()) / 1000)),
          });
        }

        throw {
          status: 400,
          payload: {
            error: "invalid_or_expired_code",
            message: "Código inválido ou expirado.",
          },
        };
      }

      const expectedHash = hashChallengeCode(challenge.challenge_id, code, config.authCodePepper);

      if (expectedHash !== challenge.code_hash) {
        const challengeState = await incrementChallengeFailure(client, challenge.challenge_id, now);

        if (challengeState?.locked_until && toDate(challengeState.locked_until) > now) {
          safeLogger.warn("[AUTH][challenge_locked]", {
            email: maskEmail(challenge.email),
            ip: remoteIp,
          });
        }

        await recordVerifyFailure(client, {
          email: challenge.email,
          remoteIp,
          now,
        });

        throw {
          status: 400,
          payload: {
            error: "invalid_or_expired_code",
            message: "Código inválido ou expirado.",
          },
        };
      }

      const userResult = await client.query(
        `
          UPDATE users
          SET is_verified = CASE WHEN $2 = 'signup' THEN true ELSE is_verified END
          WHERE id = $1
          RETURNING id, name, email, role, account_status, reporting_restricted_until, reporting_restriction_reason, is_verified, created_at
        `,
        [challenge.user_id, challenge.purpose],
      );

      let user = userResult.rows[0] || null;

      if (user && isInternalOperationsAdminUser(user, config)) {
        user = await ensureInternalOperationsAdminAccount(client, user.email, config, now);
      }

      if (!user) {
        throw {
          status: 400,
          payload: {
            error: "invalid_or_expired_code",
            message: "Código inválido ou expirado.",
          },
        };
      }

      if (user.account_status === "suspended") {
        throw {
          status: 403,
          payload: {
            error: "account_suspended",
            message: "Sua conta está suspensa no momento.",
          },
        };
      }

      await client.query(
        `
          UPDATE auth_code_challenges
          SET consumed_at = $2,
              updated_at = $2
          WHERE challenge_id = $1
        `,
        [challenge.challenge_id, now],
      );

      await client.query(
        `
          UPDATE auth_code_challenges
          SET invalidated_at = COALESCE(invalidated_at, $2),
              updated_at = $2
          WHERE email = $1
            AND challenge_id <> $3
            AND invalidated_at IS NULL
            AND consumed_at IS NULL
        `,
        [challenge.email, now, challenge.challenge_id],
      );

      const { availableRoles, defaultActiveRole } = await resolveUserRoles(client, user.id, user.role, now);
      const session = await createSession(client, user, defaultActiveRole, remoteIp, userAgent, now);

      await client.query("COMMIT");
      buildAuthCookieState(res, session.sessionToken, config, {
        maxAge: session.sessionDurations.absoluteMs,
      });

      return {
        user: buildAuthenticatedUser(user, defaultActiveRole, availableRoles),
        csrfToken: session.csrfToken,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function authenticateRequest(req, res) {
    const sessionToken = getSessionTokenFromRequest(req);

    if (!sessionToken) {
      clearAuthCookieState(res, config);
      throw {
        status: 401,
        payload: {
          error: "missing_session",
        },
      };
    }

    const now = new Date();
    const sessionResult = await pool.query(
      `
        SELECT
          session_id,
          user_id,
          active_role,
          idle_expires_at,
          absolute_expires_at,
          csrf_token_hash,
          revoked_at,
          revoked_reason
        FROM auth_sessions
        WHERE token_hash = $1
        LIMIT 1
      `,
      [hashSessionToken(sessionToken, config.authCodePepper)],
    );

    const session = sessionResult.rows[0] || null;

    if (!session) {
      clearAuthCookieState(res, config);
      throw {
        status: 401,
        payload: {
          error: "invalid_session",
        },
      };
    }

    if (
      session.revoked_at ||
      toDate(session.idle_expires_at) <= now ||
      toDate(session.absolute_expires_at) <= now
    ) {
      if (session.revoked_reason === "account_suspended") {
        clearAuthCookieState(res, config);
        throw {
          status: 403,
          payload: {
            error: "account_suspended",
            message: "Sua conta está suspensa no momento.",
          },
        };
      }

      await pool.query(
        `
          UPDATE auth_sessions
          SET revoked_at = COALESCE(revoked_at, $2),
              revoked_reason = COALESCE(revoked_reason, 'expired')
          WHERE session_id = $1
        `,
        [session.session_id, now],
      );
      clearAuthCookieState(res, config);
      throw {
        status: 401,
        payload: {
          error: "invalid_session",
        },
      };
    }

    const userResult = await pool.query(
      "SELECT id, name, email, role, account_status, is_verified, created_at FROM users WHERE id = $1 LIMIT 1",
      [session.user_id],
    );

    let user = userResult.rows[0] || null;

    if (!user) {
      clearAuthCookieState(res, config);
      throw {
        status: 401,
        payload: {
          error: "invalid_session",
        },
      };
    }

    if (user && isInternalOperationsAdminUser(user, config)) {
      user = await ensureInternalOperationsAdminAccount(pool, user.email, config, now);
    }

    if (user.account_status === "suspended") {
      await pool.query(
        `
          UPDATE auth_sessions
          SET revoked_at = COALESCE(revoked_at, $2),
              revoked_reason = COALESCE(revoked_reason, 'account_suspended')
          WHERE user_id = $1
            AND revoked_at IS NULL
        `,
        [user.id, now],
      );
      clearAuthCookieState(res, config);
      throw {
        status: 403,
        payload: {
          error: "account_suspended",
          message: "Sua conta está suspensa no momento.",
        },
      };
    }

    const { availableRoles, defaultActiveRole } = await resolveUserRoles(pool, user.id, user.role, now);
    const forcedInternalRole = isInternalOperationsAdminUser(user, config) ? INTERNAL_OPERATIONS_ADMIN_ROLE : null;
    const activeRole = forcedInternalRole
      || (session.active_role && availableRoles.includes(session.active_role)
        ? session.active_role
        : defaultActiveRole);

    if (!activeRole) {
      await pool.query(
        `
          UPDATE auth_sessions
          SET revoked_at = COALESCE(revoked_at, $2),
              revoked_reason = COALESCE(revoked_reason, 'invalid_role_state')
          WHERE session_id = $1
        `,
        [session.session_id, now],
      );
      clearAuthCookieState(res, config);
      throw {
        status: 401,
        payload: {
          error: "invalid_session",
        },
      };
    }

    const sessionDurations = getSessionDurationsForUser(user, config);
    const nextAbsoluteExpiry = forcedInternalRole
      ? minDate(toDate(session.absolute_expires_at), futureDate(now, sessionDurations.absoluteMs))
      : toDate(session.absolute_expires_at);
    const nextIdleExpiry = minDate(futureDate(now, sessionDurations.idleMs), nextAbsoluteExpiry);

    await pool.query(
      `
        UPDATE auth_sessions
        SET last_seen_at = $2,
            idle_expires_at = $3,
            absolute_expires_at = $4,
            active_role = $5
        WHERE session_id = $1
      `,
      [session.session_id, now, nextIdleExpiry, nextAbsoluteExpiry, activeRole],
    );

    return {
      sessionId: session.session_id,
      csrfTokenHash: session.csrf_token_hash || null,
      userId: user.id,
      name: user.name,
      email: user.email,
      legacyRole: user.role,
      role: activeRole,
      activeRole,
      availableRoles,
      hasRole(requiredRole) {
        return availableRoles.includes(requiredRole);
      },
      isAdmin: user.role === "administrator" || user.role === "admin",
    };
  }

  async function setActiveRole({ sessionId, userId, role }) {
    const user = await fetchUserById(pool, userId);

    if (!user) {
      throw {
        status: 404,
        payload: {
          error: "user_not_found",
        },
      };
    }

    if (isInternalOperationsAdminUser(user, config)) {
      throw buildInternalAccountRoleLockedError();
    }

    const availableRoles = await loadUserRoles(pool, userId);

    if (!availableRoles.includes(role)) {
      throw {
        status: 403,
        payload: {
          error: "role_not_enabled",
          requiredRole: role,
          availableRoles,
        },
      };
    }

    await pool.query(
      `
        UPDATE auth_sessions
        SET active_role = $2
        WHERE session_id = $1
      `,
      [sessionId, role],
    );

    return {
      user: buildAuthenticatedUser(user, role, availableRoles),
    };
  }

  async function enableRole({ sessionId, userId, role, makeActive = false, currentActiveRole = null }) {
    const user = await fetchUserById(pool, userId);

    if (!user) {
      throw {
        status: 404,
        payload: {
          error: "user_not_found",
        },
      };
    }

    if (isInternalOperationsAdminUser(user, config)) {
      throw buildInternalAccountRoleLockedError();
    }

    await ensureUserRole(pool, userId, role, new Date());

    const availableRoles = await loadUserRoles(pool, userId);
    const nextActiveRole = makeActive ? role : currentActiveRole || role;

    await pool.query(
      `
        UPDATE auth_sessions
        SET active_role = $2
        WHERE session_id = $1
      `,
      [sessionId, nextActiveRole],
    );

    return {
      user: buildAuthenticatedUser(user, nextActiveRole, availableRoles),
    };
  }

  async function listAdminUsers({ query = "" } = {}) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const users = await listManagedInternalAdminUsers(pool, config);

    if (!normalizedQuery) {
      return { users };
    }

    return {
      users: users.filter((user) => {
        const haystack = `${user.name} ${user.email}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    };
  }

  async function promoteUserToAdministrator({ targetUserId, createdByAdminUserId = null, reason }) {
    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const user = await fetchUserById(client, targetUserId);

      if (!user) {
        throw {
          status: 404,
          payload: {
            error: "user_not_found",
          },
        };
      }

      if (isInternalOperationsAdminUser(user, config)) {
        throw buildReservedInternalAdminLockedError();
      }

      if (!isInternalAccountDomainEmail(user.email, config)) {
        throw buildInternalAdminDomainRequiredError();
      }

      if (!user.is_verified) {
        throw buildVerifiedInternalAccountRequiredError();
      }

      if (isAdministratorRole(user.role)) {
        throw buildAdministratorRoleAlreadyGrantedError();
      }

      const currentRoles = await loadUserRoles(client, user.id);
      const publicRoles = normalizeAccountRoleList(currentRoles.filter(isPublicAccountRole));

      if (publicRoles.length === 0) {
        throw buildPublicRoleSnapshotRequiredError();
      }

      const profileState = await loadUserProfileAdminState(client, user.id);

      await client.query("UPDATE users SET role = 'administrator' WHERE id = $1", [user.id]);
      await client.query("DELETE FROM user_roles WHERE user_id = $1", [user.id]);
      await ensureUserRole(client, user.id, "administrator", now);
      await unpublishUserProfileForAdministrativeRole(client, user.id, now);
      await revokeUserSessions(client, user.id, "administrator_granted", now);

      await recordAdminRoleAction(client, {
        actionType: "grant_administrator",
        targetUserId: user.id,
        createdByAdminUserId,
        reason,
        metadata: {
          publicRoles,
          legacyRole: user.role,
          profileWasPublished: Boolean(profileState?.is_published),
          profilePublicSlug: profileState?.public_slug || null,
        },
        now,
      });

      const managedUsers = await listManagedInternalAdminUsers(client, config);
      const managedUser = managedUsers.find((candidate) => candidate.id === Number(user.id)) || null;

      await client.query("COMMIT");

      return {
        user: managedUser,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function revokeAdministratorFromUser({ targetUserId, createdByAdminUserId = null, reason }) {
    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const user = await fetchUserById(client, targetUserId);

      if (!user) {
        throw {
          status: 404,
          payload: {
            error: "user_not_found",
          },
        };
      }

      if (isInternalOperationsAdminUser(user, config)) {
        throw buildReservedInternalAdminLockedError();
      }

      if (!isAdministratorRole(user.role)) {
        throw buildAdministratorRoleNotGrantedError();
      }

      const latestGrantAction = await loadLatestGrantAdministratorAction(client, user.id);
      const restoredPublicRoles = normalizePublicRoleSnapshot(latestGrantAction?.metadata_json);
      const restoredLegacyRole = isPublicAccountRole(latestGrantAction?.metadata_json?.legacyRole)
        ? latestGrantAction.metadata_json.legacyRole
        : restoredPublicRoles[0] || null;

      if (!latestGrantAction || restoredPublicRoles.length === 0 || !restoredLegacyRole) {
        throw buildAdministratorSnapshotMissingError();
      }

      await client.query("UPDATE users SET role = $2 WHERE id = $1", [user.id, restoredLegacyRole]);
      await client.query("DELETE FROM user_roles WHERE user_id = $1", [user.id]);

      for (const restoredRole of restoredPublicRoles) {
        await ensureUserRole(client, user.id, restoredRole, now);
      }

      await unpublishUserProfileForAdministrativeRole(client, user.id, now);
      await revokeUserSessions(client, user.id, "administrator_revoked", now);

      await recordAdminRoleAction(client, {
        actionType: "revoke_administrator",
        targetUserId: user.id,
        createdByAdminUserId,
        reason,
        metadata: {
          restoredPublicRoles,
          restoredLegacyRole,
          sourceGrantActionId: Number(latestGrantAction.id),
        },
        now,
      });

      const managedUsers = await listManagedInternalAdminUsers(client, config);
      const managedUser = managedUsers.find((candidate) => candidate.id === Number(user.id)) || null;

      await client.query("COMMIT");

      return {
        user: managedUser,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function signOut(req, res) {
    const sessionToken = getSessionTokenFromRequest(req);

    if (sessionToken) {
      await pool.query(
        `
          UPDATE auth_sessions
          SET revoked_at = COALESCE(revoked_at, $2),
              revoked_reason = COALESCE(revoked_reason, 'signout')
          WHERE token_hash = $1
        `,
        [hashSessionToken(sessionToken, config.authCodePepper), new Date()],
      );
    }

    clearAuthCookieState(res, config);

    return {
      ok: true,
    };
  }

  async function issueCsrfToken(sessionId) {
    const csrfState = createCsrfState(sessionId, config);

    await pool.query(
      `
        UPDATE auth_sessions
        SET csrf_token_hash = $2,
            last_seen_at = NOW()
        WHERE session_id = $1
          AND revoked_at IS NULL
      `,
      [sessionId, csrfState.tokenHash],
    );

    return csrfState.token;
  }

  function isValidCsrfToken(user, token) {
    const normalizedToken = String(token || "").trim();

    if (!user?.sessionId || !user?.csrfTokenHash || !normalizedToken) {
      return false;
    }

    const providedHash = hashCsrfToken(user.sessionId, normalizedToken, config.authCodePepper);
    return safelyCompareHex(providedHash, user.csrfTokenHash);
  }

  return {
    authenticateRequest,
    issueSignUpChallenge(input) {
      return issueChallenge({ ...input, flow: "signup" });
    },
    issueLoginChallenge(input) {
      return issueChallenge({ ...input, flow: "login" });
    },
    issueProfileContactEmailChallenge,
    verifyProfileContactEmailChallenge,
    consumeVerifiedProfileContactEmailChallenge,
    verifyChallenge,
    setActiveRole,
    enableRole,
    listAdminUsers,
    promoteUserToAdministrator,
    revokeAdministratorFromUser,
    issueCsrfToken,
    isValidCsrfToken,
    signOut,
    setAuthCookie: (res, sessionToken) => buildAuthCookieState(res, sessionToken, config),
    clearAuthCookie: (res) => clearAuthCookieState(res, config),
    getGenericChallengeMessage() {
      return GENERIC_CHALLENGE_MESSAGE;
    },
    async getTestVerificationCode(email) {
      const latestCode = await findLatestActiveChallenge(pool, email, new Date());
      return latestCode;
    },
    async getAuthRateLimitSnapshot(email, remoteIp, now = new Date()) {
      const snapshot = {};

      for (const limit of [...SEND_LIMITS, ...VERIFY_FAILURE_LIMITS]) {
        const subject = limit.key === "email" ? email : remoteIp;
        snapshot[limit.scope] = await getCurrentWindowCount(pool, {
          scope: limit.scope,
          subject,
          windowMs: limit.windowMs,
          now,
        });
      }

      return snapshot;
    },
  };
}

export function handleAuthError(res, error, logger = console) {
  const safeLogger = normalizeLogger(logger);

  if (error?.status && error?.payload) {
    return res.status(error.status).json(error.payload);
  }

  if (error instanceof EmailDeliveryError || error?.code === "email_delivery_failed") {
    return res.status(503).json({
      error: "email_delivery_failed",
      message: "Não conseguimos enviar o código por e-mail agora. Tente novamente em instantes.",
    });
  }

  safeLogger.error(error);
  return res.status(500).json({ error: "server_error" });
}
