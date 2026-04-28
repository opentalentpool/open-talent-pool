import fs from "fs";
import path from "path";
import request from "supertest";
import { newDb } from "pg-mem";
import { fileURLToPath } from "url";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import {
  createDirectAsyncEmailSenderRegistry,
  createQueuedCodeEmailSender,
  createQueuedModerationDecisionEmailSender,
  createQueuedModerationReportReceiptEmailSender,
  EmailDeliveryError,
} from "./runtime.js";
import { TURNSTILE_DUMMY_TOKEN, TURNSTILE_TEST_SECRET, hashModerationEmail } from "./auth.js";
import {
  AFFIRMATIVE_POLICY_KEY,
  AFFIRMATIVE_POLICY_VERSION,
} from "../src/lib/affirmative-config.js";
import { LEGAL_POLICY_HASH, LEGAL_POLICY_VERSION } from "../src/lib/legal-policies.js";
import { INTERNAL_OPERATIONS_ADMIN_EMAIL } from "../src/lib/internal-accounts.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(currentDir, "db", "schema.sql");

const TEST_CONFIG = {
  isProduction: false,
  appBaseUrl: "http://localhost:8080",
  trustedOrigins: ["http://localhost:8080"],
  cookieDomain: "",
  cookieSecure: false,
  authSessionIdleMs: 24 * 60 * 60 * 1000,
  authSessionMaxMs: 7 * 24 * 60 * 60 * 1000,
  authCodePepper: "test-auth-pepper",
  turnstileSecretKey: TURNSTILE_TEST_SECRET,
};

function loadTestSchema() {
  return fs
    .readFileSync(schemaPath, "utf8")
    .replace("CREATE INDEX IF NOT EXISTS user_profiles_profile_data_gin_idx ON user_profiles USING GIN (profile_data);", "");
}

function getLatestCode(sendCodeEmail) {
  return sendCodeEmail.mock.calls.at(-1)?.[1] || null;
}

function getLatestChallengeId(sendCodeEmail) {
  return sendCodeEmail.mock.calls.at(-1)?.[3]?.challengeId || null;
}

function getLatestEmailByPurpose(sendCodeEmail, purpose) {
  const call = [...sendCodeEmail.mock.calls]
    .reverse()
    .find((entry) => entry?.[2] === purpose);

  if (!call) {
    return null;
  }

  return {
    to: call[0],
    code: call[1],
    purpose: call[2],
    challengeId: call[3]?.challengeId || null,
  };
}

function extractCookie(response) {
  return response.headers["set-cookie"]?.map((value) => value.split(";")[0]).join("; ") || "";
}

async function createTestContext(configOverrides = {}) {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();
  const config = {
    ...TEST_CONFIG,
    ...configOverrides,
  };
  const emailClient = {
    sendMail: vi.fn().mockImplementation(async () => ({
      messageId: `test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    })),
  };

  await pool.query(loadTestSchema());

  const { senderRegistry } = createDirectAsyncEmailSenderRegistry(config, emailClient);
  const sendCodeEmail = vi.fn(createQueuedCodeEmailSender({
    pool,
    config,
    senderRegistry,
  }));
  const sendModerationReportReceiptEmail = vi.fn(createQueuedModerationReportReceiptEmailSender({
    pool,
    config,
    senderRegistry,
  }));
  const sendModerationDecisionEmail = vi.fn(createQueuedModerationDecisionEmailSender({
    pool,
    config,
    senderRegistry,
  }));

  const app = createApp({
    pool,
    config,
    sendCodeEmail,
    sendModerationReportReceiptEmail,
    sendModerationDecisionEmail,
  });

  return {
    app,
    pool,
    sendCodeEmail,
    sendModerationReportReceiptEmail,
    sendModerationDecisionEmail,
    emailClient,
  };
}

async function expireResendCooldown(pool, email) {
  await pool.query(
    `
      UPDATE auth_code_challenges
      SET resend_available_at = NOW() - INTERVAL '2 minutes',
          updated_at = NOW()
      WHERE email = $1
        AND invalidated_at IS NULL
        AND consumed_at IS NULL
    `,
    [email.toLowerCase()],
  );
}

async function loadOutboxByAuthChallenge(pool, challengeId) {
  const result = await pool.query(
    `
      SELECT o.template_key, o.status, o.priority, o.source_type, o.source_id
      FROM email_outbox o
      INNER JOIN auth_code_challenges c ON c.id = o.source_id
      WHERE c.challenge_id = $1
        AND o.source_type = 'auth_code_challenge'
      LIMIT 1
    `,
    [challengeId],
  );

  return result.rows[0] || null;
}

async function loadOutboxByProfileContactChallenge(pool, challengeId) {
  const result = await pool.query(
    `
      SELECT o.template_key, o.status, o.priority, o.source_type, o.source_id
      FROM email_outbox o
      INNER JOIN profile_contact_email_challenges c ON c.id = o.source_id
      WHERE c.challenge_id = $1
        AND o.source_type = 'profile_contact_email_challenge'
      LIMIT 1
    `,
    [challengeId],
  );

  return result.rows[0] || null;
}

async function signUp(app, payload) {
  return request(app)
    .post("/api/auth/signup")
    .send({
      ...payload,
      acceptedLegalPolicies: payload.acceptedLegalPolicies ?? true,
      captchaToken: TURNSTILE_DUMMY_TOKEN,
    });
}

async function requestCode(app, email) {
  return request(app)
    .post("/api/auth/request-code")
    .send({
      email,
      captchaToken: TURNSTILE_DUMMY_TOKEN,
    });
}

async function verifyChallenge(app, challengeId, code) {
  return request(app).post("/api/auth/verify").send({ challengeId, code });
}

async function createAndVerifyUser(app, sendCodeEmail, { name, email, role }) {
  const signup = await signUp(app, { name, email, role });
  expect(signup.status).toBe(200);

  const challengeId = signup.body.challengeId || getLatestChallengeId(sendCodeEmail);
  const code = getLatestCode(sendCodeEmail);

  expect(challengeId).toEqual(expect.stringMatching(/^[a-f0-9]{32}$/));
  expect(code).toEqual(expect.stringMatching(/^\d{6}$/));

  const verification = await verifyChallenge(app, challengeId, code);
  const cookie = extractCookie(verification);

  expect(cookie).toContain("otp_session=");

  return {
    ...verification.body,
    challengeId,
    code,
    cookie,
    verification,
  };
}

async function publishProfessional(app, cookie, overrides = {}) {
  const { workModel, workModels, ...restOverrides } = overrides;
  const profilePayload = {
    name: "Ada Lovelace",
    city: "São Paulo",
    state: "SP",
    bio: "Especialista em plataformas e produto.",
    headline: "Staff Engineer | React e Node.js",
    linkedin: "https://linkedin.com/in/ada",
    github: "https://github.com/ada",
    portfolio: "https://ada.dev",
    skills: ["React", "Node.js", "TypeScript"],
    experiences: [
      {
        id: "exp-1",
        role_title: "Staff Engineer",
        company_name: "Open Talent",
        start_date: "2020-01-01",
        end_date: "",
        is_current: true,
        description: "Liderança técnica de produto e plataforma.",
      },
    ],
    seniority: "senior",
    workModels: Array.isArray(workModels) ? workModels : workModel ? [workModel] : ["remoto"],
    openToOpportunities: true,
    isPublished: true,
    ...restOverrides,
  };

  return request(app).put("/api/auth/profile").set("Cookie", cookie).send(profilePayload);
}

async function promoteUserToAdministrator(pool, userId) {
  await pool.query("UPDATE users SET role = 'administrator' WHERE id = $1", [userId]);
  await pool.query(
    `
      INSERT INTO user_roles (user_id, role, created_at)
      VALUES ($1, 'administrator', NOW())
      ON CONFLICT (user_id, role) DO NOTHING
    `,
    [userId],
  );
  await pool.query(
    `
      UPDATE auth_sessions
      SET active_role = 'administrator'
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId],
  );
}

async function signInWithCode(app, sendCodeEmail, email) {
  const login = await requestCode(app, email);
  expect(login.status).toBe(200);

  const challengeId = login.body.challengeId || getLatestChallengeId(sendCodeEmail);
  const code = getLatestCode(sendCodeEmail);
  const verification = await verifyChallenge(app, challengeId, code);

  expect(verification.status).toBe(200);

  return {
    challengeId,
    code,
    cookie: extractCookie(verification),
    verification,
  };
}

function expectDurationBetween(dateLikeStart, dateLikeEnd, minimumMs, maximumMs) {
  const elapsedMs = new Date(dateLikeEnd).getTime() - new Date(dateLikeStart).getTime();
  expect(elapsedMs).toBeGreaterThanOrEqual(minimumMs);
  expect(elapsedMs).toBeLessThanOrEqual(maximumMs);
}

describe("createApp", () => {
  it("expõe um healthcheck operacional", async () => {
    const { app } = await createTestContext();

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["content-security-policy"]).toContain("https://challenges.cloudflare.com");
  });

  it("exige captcha no signup e emite desafio genérico com challengeId seguro", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const missingCaptcha = await request(app).post("/api/auth/signup").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    expect(missingCaptcha.status).toBe(400);
    expect(missingCaptcha.body.error).toBe("validation_error");
    expect(missingCaptcha.body.issues).toContainEqual(
      expect.objectContaining({
        path: "captchaToken",
      }),
    );

    const signup = await signUp(app, {
      name: "Ada Lovelace",
      email: "ADA@EXAMPLE.COM",
      role: "professional",
    });

    expect(signup.status).toBe(200);
    expect(signup.body).toEqual({
      ok: true,
      message: "Se o e-mail puder receber um código, ele chegará em instantes.",
      challengeId: expect.stringMatching(/^[a-f0-9]{32}$/),
    });

    const users = await pool.query("SELECT name, email, role, is_verified FROM users");

    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
      is_verified: false,
    });
    expect(sendCodeEmail).toHaveBeenCalledTimes(1);
    expect(sendCodeEmail).toHaveBeenCalledWith(
      "ada@example.com",
      expect.stringMatching(/^\d{6}$/),
      "verification",
      expect.objectContaining({
        challengeId: signup.body.challengeId,
      }),
    );

    const outbox = await loadOutboxByAuthChallenge(pool, signup.body.challengeId);

    expect(outbox).toMatchObject({
      template_key: "auth_code",
      status: "sent",
      priority: 1000,
      source_type: "auth_code_challenge",
    });
  });

  it("exige o aceite combinado de termos de uso e política de privacidade no signup", async () => {
    const { app } = await createTestContext();

    const signup = await request(app).post("/api/auth/signup").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
      captchaToken: TURNSTILE_DUMMY_TOKEN,
    });

    expect(signup.status).toBe(400);
    expect(signup.body.error).toBe("validation_error");
    expect(signup.body.issues).toContainEqual(
      expect.objectContaining({
        path: "acceptedLegalPolicies",
      }),
    );
  });

  it("usa a origem RFC1918 do request para o link do e-mail de auth em desenvolvimento", async () => {
    const { app, sendCodeEmail } = await createTestContext();

    const signup = await request(app)
      .post("/api/auth/signup")
      .set("Origin", "http://192.168.0.5:8080")
      .send({
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
        acceptedLegalPolicies: true,
        captchaToken: TURNSTILE_DUMMY_TOKEN,
      });

    expect(signup.status).toBe(200);
    expect(sendCodeEmail).toHaveBeenCalledWith(
      "ada@example.com",
      expect.stringMatching(/^\d{6}$/),
      "verification",
      expect.objectContaining({
        appBaseUrl: "http://192.168.0.5:8080",
      }),
    );
  });

  it("mantém o APP_BASE_URL configurado quando a mesma origem local aparece em produção", async () => {
    const { app, sendCodeEmail } = await createTestContext({
      isProduction: true,
      appBaseUrl: "https://opentalentpool.org",
      trustedOrigins: ["https://opentalentpool.org", "http://192.168.0.5:8080"],
      cookieSecure: true,
    });

    const signup = await request(app)
      .post("/api/auth/signup")
      .set("Origin", "http://192.168.0.5:8080")
      .send({
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
        acceptedLegalPolicies: true,
        captchaToken: TURNSTILE_DUMMY_TOKEN,
      });

    expect(signup.status).toBe(200);
    expect(sendCodeEmail).toHaveBeenCalledWith(
      "ada@example.com",
      expect.stringMatching(/^\d{6}$/),
      "verification",
      expect.objectContaining({
        appBaseUrl: "https://opentalentpool.org",
      }),
    );
  });

  it("persiste aceites versionados de termos e privacidade durante o signup", async () => {
    const { app, pool } = await createTestContext();

    const signup = await signUp(app, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    expect(signup.status).toBe(200);

    const acceptances = await pool.query(
      `
        SELECT policy_key, policy_version, policy_hash, acceptance_source
        FROM user_policy_acceptances
        ORDER BY policy_key ASC
      `,
    );

    expect(acceptances.rows).toEqual([
      {
        policy_key: "privacy-policy",
        policy_version: LEGAL_POLICY_VERSION.privacyPolicy,
        policy_hash: LEGAL_POLICY_HASH.privacyPolicy,
        acceptance_source: "signup",
      },
      {
        policy_key: "terms-of-use",
        policy_version: LEGAL_POLICY_VERSION.termsOfUse,
        policy_hash: LEGAL_POLICY_HASH.termsOfUse,
        acceptance_source: "signup",
      },
    ]);
  });

  it("não duplica aceites na mesma versão quando o signup é reenviado", async () => {
    const { app, pool } = await createTestContext();

    const firstSignup = await signUp(app, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    expect(firstSignup.status).toBe(200);

    await expireResendCooldown(pool, "ada@example.com");

    const secondSignup = await signUp(app, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    expect(secondSignup.status).toBe(200);

    const acceptanceCount = await pool.query("SELECT COUNT(*)::int AS count FROM user_policy_acceptances");

    expect(acceptanceCount.rows[0]?.count).toBe(2);
  });

  it("reserva a conta administrativa interna para login, endurece desafio e cria sessão administrativa curta", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const publicSignup = await signUp(app, {
      name: "Administrador interno",
      email: INTERNAL_OPERATIONS_ADMIN_EMAIL,
      role: "professional",
    });

    expect(publicSignup.status).toBe(403);
    expect(publicSignup.body.error).toBe("public_signup_not_allowed");

    const login = await requestCode(app, INTERNAL_OPERATIONS_ADMIN_EMAIL);

    expect(login.status).toBe(200);
    expect(login.body.challengeId).toEqual(expect.stringMatching(/^[a-f0-9]{32}$/));

    const createdUser = await pool.query(
      "SELECT id, name, email, role, is_verified FROM users WHERE email = $1 LIMIT 1",
      [INTERNAL_OPERATIONS_ADMIN_EMAIL],
    );

    expect(createdUser.rows).toHaveLength(1);
    expect(createdUser.rows[0]).toMatchObject({
      name: "Operações internas",
      email: INTERNAL_OPERATIONS_ADMIN_EMAIL,
      role: "administrator",
      is_verified: true,
    });

    const roleRows = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role ASC",
      [createdUser.rows[0].id],
    );
    expect(roleRows.rows.map((row) => row.role)).toEqual(["administrator"]);

    const challengeRow = await pool.query(
      `
        SELECT challenge_id, user_id, purpose, max_attempts, created_at, expires_at
        FROM auth_code_challenges
        WHERE challenge_id = $1
        LIMIT 1
      `,
      [login.body.challengeId],
    );

    expect(challengeRow.rows).toHaveLength(1);
    expect(challengeRow.rows[0]).toMatchObject({
      user_id: createdUser.rows[0].id,
      purpose: "login",
      max_attempts: 3,
    });
    expectDurationBetween(
      challengeRow.rows[0].created_at,
      challengeRow.rows[0].expires_at,
      4.5 * 60 * 1000,
      5.5 * 60 * 1000,
    );

    const code = getLatestCode(sendCodeEmail);
    const verification = await verifyChallenge(app, login.body.challengeId, code);

    expect(verification.status).toBe(200);
    expect(verification.body.user).toMatchObject({
      email: INTERNAL_OPERATIONS_ADMIN_EMAIL,
      role: "administrator",
      activeRole: "administrator",
      availableRoles: ["administrator"],
    });

    const sessionRow = await pool.query(
      `
        SELECT active_role, created_at, idle_expires_at, absolute_expires_at
        FROM auth_sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
        LIMIT 1
      `,
      [createdUser.rows[0].id],
    );

    expect(sessionRow.rows).toHaveLength(1);
    expect(sessionRow.rows[0].active_role).toBe("administrator");
    expectDurationBetween(
      sessionRow.rows[0].created_at,
      sessionRow.rows[0].idle_expires_at,
      29 * 60 * 1000,
      31 * 60 * 1000,
    );
    expectDurationBetween(
      sessionRow.rows[0].created_at,
      sessionRow.rows[0].absolute_expires_at,
      11.5 * 60 * 60 * 1000,
      12.5 * 60 * 60 * 1000,
    );
  });

  it("oculta a conta administrativa interna das listagens administrativas e bloqueia habilitação de papéis públicos", async () => {
    const { app, sendCodeEmail } = await createTestContext();

    const signIn = await signInWithCode(app, sendCodeEmail, INTERNAL_OPERATIONS_ADMIN_EMAIL);

    const enableRecruiterRole = await request(app)
      .post("/api/auth/roles/enable")
      .set("Cookie", signIn.cookie)
      .send({
        role: "recruiter",
        makeActive: true,
      });

    expect(enableRecruiterRole.status).toBe(403);
    expect(enableRecruiterRole.body.error).toBe("internal_account_role_locked");

    const listUsers = await request(app)
      .get("/api/admin/users")
      .set("Cookie", signIn.cookie);

    expect(listUsers.status).toBe(200);
    expect(listUsers.body.users).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          email: INTERNAL_OPERATIONS_ADMIN_EMAIL,
        }),
      ]),
    );
  });

  it("lista contas internas elegíveis e promove uma conta verificada para administrador com snapshot auditado e revogação de sessão", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const candidate = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Teammate Internal",
      email: "teammate@opentalentpool.local",
      role: "professional",
    });

    const publish = await publishProfessional(app, candidate.cookie, {
      name: "Teammate Internal",
    });
    expect(publish.status).toBe(200);

    const actingAdmin = await signInWithCode(app, sendCodeEmail, INTERNAL_OPERATIONS_ADMIN_EMAIL);

    const listBeforePromotion = await request(app)
      .get("/api/admin/users")
      .query({ query: "teammate" })
      .set("Cookie", actingAdmin.cookie);

    expect(listBeforePromotion.status).toBe(200);
    expect(listBeforePromotion.body.users).toEqual([
      expect.objectContaining({
        id: candidate.user.id,
        email: "teammate@opentalentpool.local",
        isVerified: true,
        isAdministrator: false,
        isReservedInternalAdmin: false,
        canPromote: true,
        canRevoke: false,
      }),
    ]);

    const promote = await request(app)
      .post(`/api/admin/users/${candidate.user.id}/promote-admin`)
      .set("Cookie", actingAdmin.cookie)
      .send({
        reason: "Conta movida para operações administrativas internas.",
      });

    expect(promote.status).toBe(200);
    expect(promote.body.user).toMatchObject({
      id: candidate.user.id,
      email: "teammate@opentalentpool.local",
      isVerified: true,
      isAdministrator: true,
      isReservedInternalAdmin: false,
      canPromote: false,
      canRevoke: true,
      lastAdminAction: expect.objectContaining({
        actionType: "grant_administrator",
        reason: "Conta movida para operações administrativas internas.",
      }),
    });

    const promotedUser = await pool.query(
      "SELECT role FROM users WHERE id = $1 LIMIT 1",
      [candidate.user.id],
    );
    expect(promotedUser.rows[0]?.role).toBe("administrator");

    const roleRows = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role ASC",
      [candidate.user.id],
    );
    expect(roleRows.rows.map((row) => row.role)).toEqual(["administrator"]);

    const profileRow = await pool.query(
      "SELECT is_published, published_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
      [candidate.user.id],
    );
    expect(profileRow.rows[0]?.is_published).toBe(false);
    expect(profileRow.rows[0]?.published_at).toBeNull();

    const revokedCurrentSession = await request(app)
      .get("/api/auth/me")
      .set("Cookie", candidate.cookie);
    expect(revokedCurrentSession.status).toBe(401);
    expect(revokedCurrentSession.body.error).toBe("invalid_session");

    const auditRow = await pool.query(
      `
        SELECT action_type, reason, created_by_admin_user_id, metadata_json
        FROM admin_role_actions
        WHERE target_user_id = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [candidate.user.id],
    );
    expect(auditRow.rows[0]).toMatchObject({
      action_type: "grant_administrator",
      reason: "Conta movida para operações administrativas internas.",
      created_by_admin_user_id: expect.any(Number),
    });
    expect(auditRow.rows[0]?.metadata_json).toMatchObject({
      publicRoles: ["professional"],
      legacyRole: "professional",
      profileWasPublished: true,
    });

    const loginAsPromotedAdmin = await signInWithCode(app, sendCodeEmail, "teammate@opentalentpool.local");
    expect(loginAsPromotedAdmin.verification.body.user).toMatchObject({
      role: "administrator",
      activeRole: "administrator",
      availableRoles: ["administrator"],
    });
  });

  it("rejeita promoção administrativa para conta externa, conta não verificada e conta reservada", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const external = await createAndVerifyUser(app, sendCodeEmail, {
      name: "External Member",
      email: "external@example.com",
      role: "professional",
    });

    const pendingInternalSignup = await signUp(app, {
      name: "Pending Internal",
      email: "pending@opentalentpool.local",
      role: "professional",
    });
    expect(pendingInternalSignup.status).toBe(200);

    const pendingInternalUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      ["pending@opentalentpool.local"],
    );

    const actingAdmin = await signInWithCode(app, sendCodeEmail, INTERNAL_OPERATIONS_ADMIN_EMAIL);
    const reservedUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [INTERNAL_OPERATIONS_ADMIN_EMAIL],
    );

    const externalPromotion = await request(app)
      .post(`/api/admin/users/${external.user.id}/promote-admin`)
      .set("Cookie", actingAdmin.cookie)
      .send({ reason: "Tentativa externa." });
    expect(externalPromotion.status).toBe(403);
    expect(externalPromotion.body.error).toBe("internal_admin_domain_required");

    const pendingPromotion = await request(app)
      .post(`/api/admin/users/${pendingInternalUser.rows[0].id}/promote-admin`)
      .set("Cookie", actingAdmin.cookie)
      .send({ reason: "Tentativa não verificada." });
    expect(pendingPromotion.status).toBe(403);
    expect(pendingPromotion.body.error).toBe("verified_internal_account_required");

    const reservedPromotion = await request(app)
      .post(`/api/admin/users/${reservedUser.rows[0].id}/promote-admin`)
      .set("Cookie", actingAdmin.cookie)
      .send({ reason: "Tentativa reservada." });
    expect(reservedPromotion.status).toBe(403);
    expect(reservedPromotion.body.error).toBe("reserved_internal_admin_locked");
  });

  it("revoga um administrador restaurando os papéis públicos do snapshot sem republicar o perfil", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const candidate = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Dual Internal",
      email: "dual-internal@opentalentpool.local",
      role: "professional",
    });

    const enableRecruiter = await request(app)
      .post("/api/auth/roles/enable")
      .set("Cookie", candidate.cookie)
      .send({
        role: "recruiter",
        makeActive: false,
      });
    expect(enableRecruiter.status).toBe(200);

    const publish = await publishProfessional(app, candidate.cookie, {
      name: "Dual Internal",
    });
    expect(publish.status).toBe(200);

    const actingAdmin = await signInWithCode(app, sendCodeEmail, INTERNAL_OPERATIONS_ADMIN_EMAIL);

    const promote = await request(app)
      .post(`/api/admin/users/${candidate.user.id}/promote-admin`)
      .set("Cookie", actingAdmin.cookie)
      .send({
        reason: "Conta elevada para administração.",
      });
    expect(promote.status).toBe(200);

    const candidateAdminSession = await signInWithCode(app, sendCodeEmail, "dual-internal@opentalentpool.local");
    expect(candidateAdminSession.verification.body.user.availableRoles).toEqual(["administrator"]);

    const revoke = await request(app)
      .post(`/api/admin/users/${candidate.user.id}/revoke-admin`)
      .set("Cookie", actingAdmin.cookie)
      .send({
        reason: "A conta voltou ao escopo público interno.",
      });

    expect(revoke.status).toBe(200);
    expect(revoke.body.user).toMatchObject({
      id: candidate.user.id,
      email: "dual-internal@opentalentpool.local",
      isAdministrator: false,
      canPromote: true,
      canRevoke: false,
      lastAdminAction: expect.objectContaining({
        actionType: "revoke_administrator",
        reason: "A conta voltou ao escopo público interno.",
      }),
    });

    const restoredUser = await pool.query(
      "SELECT role FROM users WHERE id = $1 LIMIT 1",
      [candidate.user.id],
    );
    expect(restoredUser.rows[0]?.role).toBe("professional");

    const restoredRoles = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role ASC",
      [candidate.user.id],
    );
    expect(restoredRoles.rows.map((row) => row.role)).toEqual(["professional", "recruiter"]);

    const restoredProfile = await pool.query(
      "SELECT is_published FROM user_profiles WHERE user_id = $1 LIMIT 1",
      [candidate.user.id],
    );
    expect(restoredProfile.rows[0]?.is_published).toBe(false);

    const revokedAdminSession = await request(app)
      .get("/api/auth/me")
      .set("Cookie", candidateAdminSession.cookie);
    expect(revokedAdminSession.status).toBe(401);
    expect(revokedAdminSession.body.error).toBe("invalid_session");

    const revokeAudit = await pool.query(
      `
        SELECT action_type, reason, metadata_json
        FROM admin_role_actions
        WHERE target_user_id = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [candidate.user.id],
    );
    expect(revokeAudit.rows[0]).toMatchObject({
      action_type: "revoke_administrator",
      reason: "A conta voltou ao escopo público interno.",
    });
    expect(revokeAudit.rows[0]?.metadata_json).toMatchObject({
      restoredPublicRoles: ["professional", "recruiter"],
      restoredLegacyRole: "professional",
    });

    const restoredLogin = await signInWithCode(app, sendCodeEmail, "dual-internal@opentalentpool.local");
    expect(restoredLogin.verification.body.user).toMatchObject({
      activeRole: "professional",
      availableRoles: expect.arrayContaining(["professional", "recruiter"]),
    });
    expect(restoredLogin.verification.body.user.availableRoles).not.toContain("administrator");
  });

  it("faz a rota de teste reaproveitar as mesmas regras de promoção de produção", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const internal = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Test Route Internal",
      email: "test-route@opentalentpool.local",
      role: "professional",
    });
    const external = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Test Route External",
      email: "test-route-external@example.com",
      role: "professional",
    });

    const internalPromotion = await request(app)
      .post("/api/test/users/promote-admin")
      .send({ email: "test-route@opentalentpool.local" });
    expect(internalPromotion.status).toBe(200);

    const externalPromotion = await request(app)
      .post("/api/test/users/promote-admin")
      .send({ email: "test-route-external@example.com" });
    expect(externalPromotion.status).toBe(403);
    expect(externalPromotion.body.error).toBe("internal_admin_domain_required");

    const promotedRoles = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role ASC",
      [internal.user.id],
    );
    expect(promotedRoles.rows.map((row) => row.role)).toEqual(["administrator"]);

    const unchangedExternalRoles = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role ASC",
      [external.user.id],
    );
    expect(unchangedExternalRoles.rows.map((row) => row.role)).toEqual(["professional"]);
  });

  it("aceita o token dummy no desenvolvimento local mesmo quando a secret configurada nao e a de teste", async () => {
    const { app, sendCodeEmail } = await createTestContext({
      turnstileSecretKey: "0x4AAAAAADCLuY-D9D3CMTcllXVJ0bHNqPU",
    });

    const signup = await signUp(app, {
      name: "Local Dev",
      email: "local-dev@example.com",
      role: "professional",
    });

    expect(signup.status).toBe(200);
    expect(signup.body).toEqual({
      ok: true,
      message: "Se o e-mail puder receber um código, ele chegará em instantes.",
      challengeId: expect.stringMatching(/^[a-f0-9]{32}$/),
    });
    expect(sendCodeEmail).toHaveBeenCalledTimes(1);
  });

  it("mantém shape genérico no request-code com e sem conta e respeita cooldown de reenvio", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Hopper",
      email: "grace@example.com",
      role: "professional",
    });

    sendCodeEmail.mockClear();

    const firstLoginRequest = await requestCode(app, "grace@example.com");
    const secondLoginRequest = await requestCode(app, "grace@example.com");
    const unknownUserRequest = await requestCode(app, "missing@example.com");

    expect(firstLoginRequest.status).toBe(200);
    expect(secondLoginRequest.status).toBe(200);
    expect(unknownUserRequest.status).toBe(200);
    expect(firstLoginRequest.body).toMatchObject({
      ok: true,
      message: "Se o e-mail puder receber um código, ele chegará em instantes.",
      challengeId: expect.any(String),
    });
    expect(secondLoginRequest.body).toMatchObject({
      ok: true,
      message: firstLoginRequest.body.message,
      challengeId: firstLoginRequest.body.challengeId,
    });
    expect(unknownUserRequest.body).toMatchObject({
      ok: true,
      message: firstLoginRequest.body.message,
      challengeId: expect.any(String),
    });
    expect(Object.keys(unknownUserRequest.body).sort()).toEqual(Object.keys(firstLoginRequest.body).sort());
    expect(sendCodeEmail).toHaveBeenCalledTimes(1);
    expect(sendCodeEmail).toHaveBeenCalledWith(
      "grace@example.com",
      expect.stringMatching(/^\d{6}$/),
      "login",
      expect.objectContaining({
        challengeId: firstLoginRequest.body.challengeId,
      }),
    );

    const outbox = await loadOutboxByAuthChallenge(pool, firstLoginRequest.body.challengeId);

    expect(outbox).toMatchObject({
      template_key: "auth_code",
      status: "sent",
      priority: 1000,
      source_type: "auth_code_challenge",
    });
  });

  it("invalida o challenge anterior, verifica o novo e autentica só por cookie HttpOnly", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const firstSignup = await signUp(app, {
      name: "Pending User",
      email: "pending@example.com",
      role: "professional",
    });
    const firstChallengeId = firstSignup.body.challengeId;
    const firstCode = getLatestCode(sendCodeEmail);

    await expireResendCooldown(pool, "pending@example.com");

    const secondSignup = await signUp(app, {
      name: "Pending User",
      email: "pending@example.com",
      role: "professional",
    });
    const secondChallengeId = secondSignup.body.challengeId;
    const secondCode = getLatestCode(sendCodeEmail);

    expect(secondChallengeId).not.toBe(firstChallengeId);

    const staleVerification = await verifyChallenge(app, firstChallengeId, firstCode);

    expect(staleVerification.status).toBe(400);
    expect(staleVerification.body.error).toBe("invalid_or_expired_code");

    const verification = await verifyChallenge(app, secondChallengeId, secondCode);
    const sessionCookie = verification.headers["set-cookie"]?.find((value) => value.startsWith("otp_session="));

    expect(verification.status).toBe(200);
    expect(verification.body.user).toMatchObject({
      email: "pending@example.com",
      role: "professional",
      is_verified: true,
    });
    expect(verification.body.token).toBeUndefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("Path=/");

    const sessions = await pool.query("SELECT user_id, revoked_at FROM auth_sessions");

    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0].revoked_at).toBeNull();
  });

  it("bloqueia challenge após tentativas inválidas demais", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();

    const signup = await signUp(app, {
      name: "Attempt User",
      email: "attempt@example.com",
      role: "professional",
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalidAttempt = await verifyChallenge(app, signup.body.challengeId, "000000");
      expect(invalidAttempt.status).toBe(400);
      expect(invalidAttempt.body.error).toBe("invalid_or_expired_code");
    }

    const lockedAttempt = await verifyChallenge(app, signup.body.challengeId, "000000");

    expect(lockedAttempt.status).toBe(429);
    expect(lockedAttempt.body.error).toBe("rate_limited");
    expect(lockedAttempt.body.scope).toBe("auth_verify_challenge");

    const challengeState = await pool.query(
      "SELECT attempt_count, locked_until FROM auth_code_challenges WHERE challenge_id = $1 LIMIT 1",
      [signup.body.challengeId],
    );

    expect(challengeState.rows[0].attempt_count).toBe(5);
    expect(challengeState.rows[0].locked_until).toBeTruthy();
    expect(sendCodeEmail).toHaveBeenCalledTimes(1);
  });

  it("aplica rate limit persistido para envios por e-mail", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rate Limit",
      email: "ratelimit@example.com",
      role: "professional",
    });

    sendCodeEmail.mockClear();
    await pool.query("DELETE FROM auth_rate_limits");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await requestCode(app, "ratelimit@example.com");
      expect(response.status).toBe(200);
      await expireResendCooldown(pool, "ratelimit@example.com");
    }

    const limitedResponse = await requestCode(app, "ratelimit@example.com");

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body.error).toBe("rate_limited");
    expect(limitedResponse.body.scope).toBe("auth_send_email_15m");
    expect(limitedResponse.body.retryAfterSeconds).toEqual(expect.any(Number));
  });

  it("faz rollback completo do desafio quando o envio de e-mail falha", async () => {
    const { app, pool, emailClient } = await createTestContext();

    emailClient.sendMail.mockRejectedValueOnce(new EmailDeliveryError());

    const signupResponse = await signUp(app, {
      name: "SMTP Failure",
      email: "smtp@example.com",
      role: "professional",
    });

    expect(signupResponse.status).toBe(503);
    expect(signupResponse.body.error).toBe("email_delivery_failed");

    const signupChallenges = await pool.query(
      "SELECT challenge_id FROM auth_code_challenges WHERE email = $1 ORDER BY created_at DESC LIMIT 1",
      ["smtp@example.com"],
    );
    const outbox = await pool.query(
      "SELECT id FROM email_outbox WHERE template_key = 'auth_code' AND to_email = $1",
      ["smtp@example.com"],
    );

    expect(signupChallenges.rows).toEqual([]);
    expect(outbox.rows).toEqual([]);
  });

  it("revoga a sessão no signout e protege rotas privadas por cookie", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const verifiedUser = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Cookie User",
      email: "cookie@example.com",
      role: "professional",
    });

    const meResponse = await request(app).get("/api/auth/me").set("Cookie", verifiedUser.cookie);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe("cookie@example.com");

    const signout = await request(app).post("/api/auth/signout").set("Cookie", verifiedUser.cookie);

    expect(signout.status).toBe(200);
    expect(signout.body).toEqual({ ok: true });
    expect(signout.headers["set-cookie"]?.[0]).toContain("otp_session=");

    const afterSignout = await request(app).get("/api/auth/me").set("Cookie", verifiedUser.cookie);

    expect(afterSignout.status).toBe(401);
    expect(afterSignout.body.error).toBe("invalid_session");
  });

  it("permite habilitar o segundo contexto, trocar o papel ativo sem novo login e expõe activeRole em /me", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const meBefore = await request(app).get("/api/auth/me").set("Cookie", professional.cookie);

    expect(meBefore.status).toBe(200);
    expect(meBefore.body.user).toMatchObject({
      role: "professional",
      activeRole: "professional",
      availableRoles: ["professional"],
    });

    const enableRecruiter = await request(app)
      .post("/api/auth/roles/enable")
      .set("Cookie", professional.cookie)
      .send({
        role: "recruiter",
        makeActive: true,
      });

    expect(enableRecruiter.status).toBe(200);
    expect(enableRecruiter.body.user).toMatchObject({
      role: "recruiter",
      activeRole: "recruiter",
      availableRoles: expect.arrayContaining(["professional", "recruiter"]),
    });

    const recruiterFavoritesWrongContext = await request(app)
      .get("/api/auth/profile")
      .set("Cookie", professional.cookie);

    expect(recruiterFavoritesWrongContext.status).toBe(409);
    expect(recruiterFavoritesWrongContext.body).toMatchObject({
      error: "role_context_required",
      requiredRole: "professional",
      activeRole: "recruiter",
    });

    const switchBack = await request(app)
      .put("/api/auth/active-role")
      .set("Cookie", professional.cookie)
      .send({
        role: "professional",
      });

    expect(switchBack.status).toBe(200);
    expect(switchBack.body.user).toMatchObject({
      role: "professional",
      activeRole: "professional",
      availableRoles: expect.arrayContaining(["professional", "recruiter"]),
    });

    const meAfter = await request(app).get("/api/auth/me").set("Cookie", professional.cookie);

    expect(meAfter.status).toBe(200);
    expect(meAfter.body.user).toMatchObject({
      role: "professional",
      activeRole: "professional",
      availableRoles: expect.arrayContaining(["professional", "recruiter"]),
    });
  });

  it("bloqueia origens não permitidas em rotas que alteram estado", async () => {
    const { app } = await createTestContext();

    const response = await request(app)
      .post("/api/auth/request-code")
      .set("Origin", "https://evil.example.com")
      .send({
        email: "blocked@example.com",
        captchaToken: TURNSTILE_DUMMY_TOKEN,
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("invalid_origin");
  });

  it("aceita origem de IP privado local no ambiente de desenvolvimento", async () => {
    const { app } = await createTestContext();

    const response = await request(app)
      .post("/api/auth/request-code")
      .set("Origin", "http://192.168.0.5:8080")
      .send({
        email: "lan-dev@example.com",
        captchaToken: TURNSTILE_DUMMY_TOKEN,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        challengeId: expect.stringMatching(/^[a-f0-9]{32}$/),
      }),
    );
  });

  it("omite telefone legado do perfil autenticado e descarta novas tentativas de envio", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    await pool.query(
      `
        INSERT INTO user_profiles (user_id, profile_data, is_published, updated_at)
        VALUES ($1, $2, false, NOW())
      `,
      [
        professional.user.id,
        {
          name: "Ada Lovelace",
          phone: "(11) 99999-9999",
          city: "São Paulo",
          state: "SP",
          bio: "Especialista em plataformas e produto.",
          headline: "Staff Engineer | React e Node.js",
          linkedin: "https://linkedin.com/in/ada",
          github: "https://github.com/ada",
          portfolio: "https://ada.dev",
          skills: ["React", "Node.js", "TypeScript"],
          experiences: [],
          seniority: "senior",
          workModel: "remoto",
          openToOpportunities: true,
          isPublished: false,
          affirmativeProfile: {
            groups: [],
            policyVersion: "",
            consentAcceptedAt: null,
          },
        },
      ],
    );

    const ownProfile = await request(app).get("/api/auth/profile").set("Cookie", professional.cookie);

    expect(ownProfile.status).toBe(200);
    expect(ownProfile.body.profile).not.toHaveProperty("phone");

    const save = await publishProfessional(app, professional.cookie, {
      isPublished: false,
      phone: "(11) 98888-7777",
    });

    expect(save.status).toBe(200);
    expect(save.body.profile).not.toHaveProperty("phone");

    const storedProfile = await pool.query("SELECT profile_data FROM user_profiles WHERE user_id = $1", [professional.user.id]);

    expect(storedProfile.rows[0]?.profile_data).not.toHaveProperty("phone");
  });

  it("hidrata o e-mail de contato com o e-mail da conta, confirma um alternativo por código e expõe isso só para recrutadores", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const ownProfile = await request(app).get("/api/auth/profile").set("Cookie", professional.cookie);

    expect(ownProfile.status).toBe(200);
    expect(ownProfile.body.profile).toMatchObject({
      contactEmail: "ada@example.com",
      showContactEmailToRecruiters: false,
    });

    const requestContactCode = await request(app)
      .post("/api/auth/profile/contact-email/request-code")
      .set("Cookie", professional.cookie)
      .send({
        nextContactEmail: "jobs@ada.dev",
      });

    expect(requestContactCode.status).toBe(200);
    expect(requestContactCode.body).toEqual({
      ok: true,
      message: "Enviamos um código para o e-mail da sua conta.",
      challengeId: expect.stringMatching(/^[a-f0-9]{32}$/),
    });

    const latestContactEmailChallenge = getLatestEmailByPurpose(sendCodeEmail, "profile_contact_email");

    expect(latestContactEmailChallenge).toMatchObject({
      to: "ada@example.com",
      challengeId: requestContactCode.body.challengeId,
      code: expect.stringMatching(/^\d{6}$/),
    });

    const outbox = await loadOutboxByProfileContactChallenge(pool, requestContactCode.body.challengeId);

    expect(outbox).toMatchObject({
      template_key: "auth_code",
      status: "sent",
      priority: 1000,
      source_type: "profile_contact_email_challenge",
    });

    const resendDuringCooldown = await request(app)
      .post("/api/auth/profile/contact-email/request-code")
      .set("Cookie", professional.cookie)
      .send({
        nextContactEmail: "jobs@ada.dev",
      });

    expect(resendDuringCooldown.status).toBe(200);
    expect(resendDuringCooldown.body.challengeId).toBe(requestContactCode.body.challengeId);

    const verifyContactEmail = await request(app)
      .post("/api/auth/profile/contact-email/verify")
      .set("Cookie", professional.cookie)
      .send({
        challengeId: requestContactCode.body.challengeId,
        code: latestContactEmailChallenge?.code,
      });

    expect(verifyContactEmail.status).toBe(200);
    expect(verifyContactEmail.body).toEqual({
      ok: true,
      email: "jobs@ada.dev",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      contactEmail: "jobs@ada.dev",
      showContactEmailToRecruiters: true,
    });

    expect(publish.status).toBe(200);
    expect(publish.body.profile).toMatchObject({
      contactEmail: "jobs@ada.dev",
      showContactEmailToRecruiters: true,
    });

    const publicProfile = await request(app).get(`/api/profiles/${publish.body.publication.publicSlug}`);

    expect(publicProfile.status).toBe(200);
    expect(publicProfile.body.profile).not.toHaveProperty("contactEmail");
    expect(publicProfile.body.profile.links).not.toHaveProperty("email");

    const anonymousContact = await request(app).get(
      `/api/recruiter/profiles/${publish.body.publication.publicSlug}/contact`,
    );

    expect(anonymousContact.status).toBe(401);

    const recruiterContact = await request(app)
      .get(`/api/recruiter/profiles/${publish.body.publication.publicSlug}/contact`)
      .set("Cookie", recruiter.cookie);

    expect(recruiterContact.status).toBe(200);
    expect(recruiterContact.body).toEqual({
      email: "jobs@ada.dev",
    });
  });

  it("bloqueia e-mail de contato custom sem verificação válida, permite voltar para o e-mail da conta e mantém o contato oculto quando a visibilidade está desligada", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const unverifiedSave = await publishProfessional(app, professional.cookie, {
      contactEmail: "jobs@ada.dev",
      showContactEmailToRecruiters: true,
    });

    expect(unverifiedSave.status).toBe(400);
    expect(unverifiedSave.body.error).toBe("validation_error");
    expect(unverifiedSave.body.issues).toContainEqual(
      expect.objectContaining({
        path: "contactEmail",
      }),
    );

    await pool.query(
      `
        INSERT INTO user_profiles (user_id, profile_data, is_published, public_slug, published_at, updated_at)
        VALUES ($1, $2, true, $3, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET profile_data = $2,
            is_published = true,
            public_slug = $3,
            published_at = NOW(),
            updated_at = NOW()
      `,
      [
        professional.user.id,
        {
          name: "Ada Lovelace",
          city: "São Paulo",
          state: "SP",
          bio: "Especialista em plataformas e produto.",
          headline: "Staff Engineer | React e Node.js",
          linkedin: "https://linkedin.com/in/ada",
          github: "https://github.com/ada",
          portfolio: "https://ada.dev",
          skills: ["React", "Node.js", "TypeScript"],
          experiences: [],
          seniority: "senior",
          workModels: ["remoto"],
          openToOpportunities: true,
          isPublished: true,
          contactEmail: "jobs@ada.dev",
          showContactEmailToRecruiters: true,
          affirmativeProfile: {
            groups: [],
            policyVersion: "",
            consentAcceptedAt: null,
          },
        },
        "ada-lovelace-1",
      ],
    );

    const revertToAccountEmail = await publishProfessional(app, professional.cookie, {
      contactEmail: "ada@example.com",
      showContactEmailToRecruiters: false,
    });

    expect(revertToAccountEmail.status).toBe(200);
    expect(revertToAccountEmail.body.profile).toMatchObject({
      contactEmail: "ada@example.com",
      showContactEmailToRecruiters: false,
    });

    const storedProfile = await pool.query("SELECT profile_data FROM user_profiles WHERE user_id = $1", [professional.user.id]);

    expect(storedProfile.rows[0]?.profile_data).toMatchObject({
      contactEmail: "",
      showContactEmailToRecruiters: false,
    });

    const hiddenContact = await request(app)
      .get("/api/recruiter/profiles/ada-lovelace-1/contact")
      .set("Cookie", recruiter.cookie);

    expect(hiddenContact.status).toBe(404);
  });

  it("publica perfil, busca perfis e mantém favoritos e buscas salvas via cookie", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      name: "Ada Lovelace",
      headline: "Staff Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React", "TypeScript", "Design Systems"],
      workModels: ["remoto", "hibrido"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);
    expect(publish.body.publication).toMatchObject({
      isPublished: true,
      isPublishable: true,
    });
    expect(publish.body.profile).toMatchObject({
      workModels: ["remoto", "hibrido"],
    });
    expect(publish.body.profile).not.toHaveProperty("workModel");

    const publicProfiles = await request(app).get("/api/profiles?workModel=remoto");

    expect(publicProfiles.status).toBe(200);
    expect(publicProfiles.body.total).toBe(1);
    expect(publicProfiles.body.items[0]).toMatchObject({
      name: "Ada Lovelace",
      state: "SP",
      workModels: ["remoto", "hibrido"],
    });

    const forbiddenFavorites = await request(app)
      .get("/api/recruiter/favorites")
      .set("Cookie", professional.cookie);

    expect(forbiddenFavorites.status).toBe(403);
    expect(forbiddenFavorites.body).toMatchObject({
      error: "role_not_enabled",
      requiredRole: "recruiter",
    });

    const addFavorite = await request(app)
      .post("/api/recruiter/favorites")
      .set("Cookie", recruiter.cookie)
      .send({ profileId: professional.user.id });

    expect(addFavorite.status).toBe(201);

    const favorites = await request(app)
      .get("/api/recruiter/favorites")
      .set("Cookie", recruiter.cookie);

    expect(favorites.status).toBe(200);
    expect(favorites.body.favorites).toHaveLength(1);
    expect(favorites.body.favorites[0]).toMatchObject({
      id: professional.user.id,
      name: "Ada Lovelace",
    });

    const saveSearch = await request(app)
      .post("/api/recruiter/saved-searches")
      .set("Cookie", recruiter.cookie)
      .send({
        name: "React remoto SP",
        criteria: {
          q: "react",
          seniority: "",
          workModel: "remoto",
          state: "SP",
          openToOpportunities: false,
        },
        alertFrequency: "daily",
      });

    expect(saveSearch.status).toBe(201);
    expect(saveSearch.body.savedSearch).toMatchObject({
      name: "React remoto SP",
      alertFrequency: "daily",
    });

    const savedSearches = await request(app)
      .get("/api/recruiter/saved-searches")
      .set("Cookie", recruiter.cookie);

    expect(savedSearches.status).toBe(200);
    expect(savedSearches.body.savedSearches).toHaveLength(1);
    expect(savedSearches.body.savedSearches[0].name).toBe("React remoto SP");
  });

  it("exige o contexto ativo do recrutador quando a conta já tem esse papel habilitado", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      name: "Ada Lovelace",
      headline: "Staff Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    const enableProfessional = await request(app)
      .post("/api/auth/roles/enable")
      .set("Cookie", recruiter.cookie)
      .send({
        role: "professional",
        makeActive: true,
      });

    expect(enableProfessional.status).toBe(200);
    expect(enableProfessional.body.user.activeRole).toBe("professional");

    const favoritesWrongContext = await request(app)
      .post("/api/recruiter/favorites")
      .set("Cookie", recruiter.cookie)
      .send({ profileId: professional.user.id });

    expect(favoritesWrongContext.status).toBe(409);
    expect(favoritesWrongContext.body).toMatchObject({
      error: "role_context_required",
      requiredRole: "recruiter",
      activeRole: "professional",
    });

    const switchToRecruiter = await request(app)
      .put("/api/auth/active-role")
      .set("Cookie", recruiter.cookie)
      .send({
        role: "recruiter",
      });

    expect(switchToRecruiter.status).toBe(200);
    expect(switchToRecruiter.body.user.activeRole).toBe("recruiter");

    const addFavorite = await request(app)
      .post("/api/recruiter/favorites")
      .set("Cookie", recruiter.cookie)
      .send({ profileId: professional.user.id });

    expect(addFavorite.status).toBe(201);
  });

  it("não republica um perfil expirado no mesmo save, mas permite republicar após atualização confirmada", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      name: "Ada Lovelace",
      headline: "Staff Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    await pool.query(
      `
        UPDATE user_profiles
        SET is_published = false,
            published_at = NULL,
            expired_at = NOW() - INTERVAL '1 day',
            updated_at = NOW() - INTERVAL '181 days'
        WHERE user_id = $1
      `,
      [professional.user.id],
    );

    const refreshAfterExpiry = await publishProfessional(app, professional.cookie, {
      name: "Ada Lovelace",
      headline: "Staff Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React", "TypeScript"],
      openToOpportunities: true,
      isPublished: true,
    });

    expect(refreshAfterExpiry.status).toBe(200);
    expect(refreshAfterExpiry.body.publication).toMatchObject({
      isPublished: false,
      freshnessStatus: "active",
      expiredAt: null,
    });

    const publishAgain = await publishProfessional(app, professional.cookie, {
      name: "Ada Lovelace",
      headline: "Staff Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React", "TypeScript"],
      openToOpportunities: true,
      isPublished: true,
    });

    expect(publishAgain.status).toBe(200);
    expect(publishAgain.body.publication).toMatchObject({
      isPublished: true,
      freshnessStatus: "active",
      expiredAt: null,
    });
    expect(publishAgain.body.publication.publishedAt).not.toBeNull();
  });

  it("exige consentimento explícito para salvar autodeclaração afirmativa no perfil", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const save = await publishProfessional(app, professional.cookie, {
      affirmativeProfile: {
        groups: ["women"],
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        consentAcceptedAt: null,
      },
      affirmativeConsentAccepted: false,
    });

    expect(save.status).toBe(400);
    expect(save.body.error).toBe("validation_error");
    expect(save.body.issues).toContainEqual(
      expect.objectContaining({
        path: "affirmativeConsentAccepted",
      }),
    );
  });

  it("normaliza grupos legados de identidade para o grupo coletivo lgbtqiapn+ sem perder encontrabilidade", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const save = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
      affirmativeProfile: {
        groups: ["trans_people", "non_binary_people"],
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        consentAcceptedAt: null,
      },
      affirmativeConsentAccepted: true,
    });

    expect(save.status).toBe(200);
    expect(save.body.profile.affirmativeProfile).toMatchObject({
      groups: ["lgbtqiapn_people"],
      policyVersion: AFFIRMATIVE_POLICY_VERSION,
    });

    await request(app)
      .post("/api/recruiter/affirmative-search/policy-acceptance")
      .set("Cookie", recruiter.cookie)
      .send({
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
      });

    const inclusiveSearch = await request(app)
      .post("/api/recruiter/affirmative-search")
      .set("Cookie", recruiter.cookie)
      .send({
        q: "",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: true,
        page: 1,
        pageSize: 20,
        affirmativeContext: {
          useCase: "vaga_inclusiva",
          vacancyReference: "REQ-LGBT-001",
        },
        affirmativeFilters: {
          genderGroups: ["lgbtqiapn_people"],
          raceGroups: [],
          pcdOnly: false,
        },
      });

    expect(inclusiveSearch.status).toBe(200);
    expect(inclusiveSearch.body.total).toBe(1);
    expect(inclusiveSearch.body.items[0]).toMatchObject({
      id: professional.user.id,
      name: "Ada Lovelace",
    });
  });

  it("persiste aceite do recrutador, executa busca inclusiva e mantém dados afirmativos fora da superfície pública", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Staff Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React", "TypeScript", "Design Systems"],
      openToOpportunities: true,
      affirmativeProfile: {
        groups: ["women", "black_people"],
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        consentAcceptedAt: null,
      },
      affirmativeConsentAccepted: true,
    });

    expect(publish.status).toBe(200);

    const initialPolicyStatus = await request(app)
      .get("/api/recruiter/affirmative-search/policy-status")
      .set("Cookie", recruiter.cookie);

    expect(initialPolicyStatus.status).toBe(200);
    expect(initialPolicyStatus.body).toMatchObject({
      accepted: false,
      policyVersion: AFFIRMATIVE_POLICY_VERSION,
    });

    const acceptPolicy = await request(app)
      .post("/api/recruiter/affirmative-search/policy-acceptance")
      .set("Cookie", recruiter.cookie)
      .send({
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
      });

    expect(acceptPolicy.status).toBe(201);
    expect(acceptPolicy.body).toMatchObject({
      accepted: true,
      policyVersion: AFFIRMATIVE_POLICY_VERSION,
    });

    const recruiterAcceptances = await request(app)
      .get("/api/auth/account/privacy-export")
      .set("Cookie", recruiter.cookie);

    expect(recruiterAcceptances.status).toBe(200);
    expect(recruiterAcceptances.body.policyAcceptances.recruiter).toContainEqual(
      expect.objectContaining({
        policyKey: AFFIRMATIVE_POLICY_KEY,
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        policyHash: LEGAL_POLICY_HASH.inclusiveUsePolicy,
      }),
    );

    const inclusiveSearch = await request(app)
      .post("/api/recruiter/affirmative-search")
      .set("Cookie", recruiter.cookie)
      .send({
        q: "react",
        seniority: "",
        workModel: "remoto",
        state: "SP",
        openToOpportunities: true,
        page: 1,
        pageSize: 20,
        affirmativeContext: {
          useCase: "vaga_afirmativa",
          vacancyReference: "REQ-123 - Frontend afirmativa",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: ["black_people"],
          pcdOnly: false,
        },
      });

    expect(inclusiveSearch.status).toBe(200);
    expect(inclusiveSearch.body.total).toBe(1);
    expect(inclusiveSearch.body.items[0]).toMatchObject({
      id: professional.user.id,
      name: "Ada Lovelace",
    });

    const exportAfterAudit = await request(app)
      .get("/api/auth/account/privacy-export")
      .set("Cookie", recruiter.cookie);

    expect(exportAfterAudit.status).toBe(200);
    expect(exportAfterAudit.body.inclusiveSearchAudit).toContainEqual(
      expect.objectContaining({
        vacancyReference: "REQ-123 - Frontend afirmativa",
        useCase: "vaga_afirmativa",
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        policyHash: LEGAL_POLICY_HASH.inclusiveUsePolicy,
        resultCount: 1,
      }),
    );

    const saveSearch = await request(app)
      .post("/api/recruiter/saved-searches")
      .set("Cookie", recruiter.cookie)
      .send({
        name: "Busca inclusiva frontend",
        criteria: {
          q: "react",
          seniority: "",
          workModel: "remoto",
          state: "SP",
          openToOpportunities: true,
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
      });

    expect(saveSearch.status).toBe(201);
    expect(saveSearch.body.savedSearch.criteria).toMatchObject({
      affirmativeContext: {
        useCase: "vaga_afirmativa",
      },
      affirmativeFilters: {
        genderGroups: ["women"],
        raceGroups: ["black_people"],
        pcdOnly: false,
      },
    });

    const publicProfile = await request(app).get(`/api/profiles/${publish.body.publication.publicSlug}`);

    expect(publicProfile.status).toBe(200);
    expect(publicProfile.body.profile.affirmativeProfile).toBeUndefined();
  });

  it("exporta o snapshot de privacidade da conta autenticada", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel-export@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-export@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Platform Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React", "Kubernetes"],
      openToOpportunities: true,
      affirmativeProfile: {
        groups: ["women"],
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        consentAcceptedAt: null,
      },
      affirmativeConsentAccepted: true,
    });

    expect(publish.status).toBe(200);

    await request(app)
      .post("/api/recruiter/favorites")
      .set("Cookie", recruiter.cookie)
      .send({ profileId: professional.user.id });

    await request(app)
      .post("/api/recruiter/affirmative-search/policy-acceptance")
      .set("Cookie", recruiter.cookie)
      .send({
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
      });

    await request(app)
      .post("/api/recruiter/affirmative-search")
      .set("Cookie", recruiter.cookie)
      .send({
        q: "react",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: true,
        page: 1,
        pageSize: 20,
        affirmativeContext: {
          useCase: "vaga_inclusiva",
          vacancyReference: "REQ-EXPORT-001",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: [],
          pcdOnly: false,
        },
      });

    await request(app)
      .post("/api/recruiter/saved-searches")
      .set("Cookie", recruiter.cookie)
      .send({
        name: "Busca exportável",
        criteria: {
          q: "react",
          seniority: "",
          workModel: "",
          state: "SP",
          openToOpportunities: true,
        },
        alertFrequency: "weekly",
      });

    const exportResponse = await request(app)
      .get("/api/auth/account/privacy-export")
      .set("Cookie", recruiter.cookie);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body).toMatchObject({
      account: {
        email: "rachel-export@example.com",
        availableRoles: ["recruiter"],
      },
      profile: null,
      recruiter: {
        favorites: [
          expect.objectContaining({
            name: "Ada Lovelace",
          }),
        ],
        savedSearches: [
          expect.objectContaining({
            name: "Busca exportável",
            alertFrequency: "weekly",
          }),
        ],
      },
    });
    expect(exportResponse.body.policyAcceptances.user).toContainEqual(
      expect.objectContaining({
        policyKey: "privacy-policy",
        policyHash: LEGAL_POLICY_HASH.privacyPolicy,
      }),
    );
    expect(exportResponse.body.inclusiveSearchAudit).toContainEqual(
      expect.objectContaining({
        vacancyReference: "REQ-EXPORT-001",
        useCase: "vaga_inclusiva",
      }),
    );
  });

  it("exclui a conta autenticada, remove dados operacionais e preserva apenas a trilha anonimizada mínima", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel-delete@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-delete@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Platform Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
      affirmativeProfile: {
        groups: ["women"],
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        consentAcceptedAt: null,
      },
      affirmativeConsentAccepted: true,
    });

    expect(publish.status).toBe(200);

    await request(app)
      .post("/api/recruiter/favorites")
      .set("Cookie", recruiter.cookie)
      .send({ profileId: professional.user.id });

    await request(app)
      .post("/api/recruiter/affirmative-search/policy-acceptance")
      .set("Cookie", recruiter.cookie)
      .send({
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
      });

    await request(app)
      .post("/api/recruiter/affirmative-search")
      .set("Cookie", recruiter.cookie)
      .send({
        q: "react",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: true,
        page: 1,
        pageSize: 20,
        affirmativeContext: {
          useCase: "vaga_afirmativa",
          vacancyReference: "REQ-DELETE-001",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: [],
          pcdOnly: false,
        },
      });

    await request(app)
      .post("/api/recruiter/saved-searches")
      .set("Cookie", recruiter.cookie)
      .send({
        name: "Busca para excluir",
        criteria: {
          q: "react",
          seniority: "",
          workModel: "",
          state: "SP",
          openToOpportunities: true,
        },
        alertFrequency: "daily",
      });

    const deletion = await request(app)
      .delete("/api/auth/account")
      .set("Cookie", recruiter.cookie)
      .send({
        confirmEmail: "rachel-delete@example.com",
      });

    expect(deletion.status).toBe(200);
    expect(deletion.body).toEqual({
      ok: true,
      deletedAt: expect.any(String),
    });

    const deletedUser = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE email = $1", [
      "rachel-delete@example.com",
    ]);
    const deletedSearches = await pool.query("SELECT COUNT(*)::int AS count FROM saved_searches");
    const deletedFavorites = await pool.query("SELECT COUNT(*)::int AS count FROM recruiter_favorites");
    const deletedRecruiterAcceptances = await pool.query("SELECT COUNT(*)::int AS count FROM recruiter_policy_acceptances");
    const deletedUserAcceptances = await pool.query("SELECT COUNT(*)::int AS count FROM user_policy_acceptances WHERE user_id = $1", [
      recruiter.user.id,
    ]);
    const legalLedger = await pool.query(
      "SELECT COUNT(*)::int AS count FROM legal_audit_ledger WHERE actor_hash IS NOT NULL",
    );
    const affirmativeAudit = await pool.query(
      "SELECT COUNT(*)::int AS count FROM affirmative_search_audit_logs WHERE actor_hash IS NOT NULL",
    );

    expect(deletedUser.rows[0].count).toBe(0);
    expect(deletedSearches.rows[0].count).toBe(0);
    expect(deletedFavorites.rows[0].count).toBe(0);
    expect(deletedRecruiterAcceptances.rows[0].count).toBe(0);
    expect(deletedUserAcceptances.rows[0].count).toBe(0);
    expect(legalLedger.rows[0].count).toBeGreaterThanOrEqual(3);
    expect(affirmativeAudit.rows[0].count).toBe(1);

    const afterDeletion = await request(app).get("/api/auth/me").set("Cookie", recruiter.cookie);

    expect(afterDeletion.status).toBe(401);
    expect(afterDeletion.body.error).toBe("invalid_session");
  });

  it("registra acessos ao contato do profissional e permite denunciar a conta recrutadora a partir desse log", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    const admin = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Morgan Admin",
      email: "admin-contact-log@example.com",
      role: "professional",
    });
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel-contact-log@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-contact-log@example.com",
      role: "professional",
    });

    await promoteUserToAdministrator(pool, admin.user.id);

    const requestContactCode = await request(app)
      .post("/api/auth/profile/contact-email/request-code")
      .set("Cookie", professional.cookie)
      .send({
        nextContactEmail: "jobs@ada.dev",
      });

    const latestContactEmailChallenge = getLatestEmailByPurpose(sendCodeEmail, "profile_contact_email");

    expect(requestContactCode.status).toBe(200);

    const verifyContactEmail = await request(app)
      .post("/api/auth/profile/contact-email/verify")
      .set("Cookie", professional.cookie)
      .send({
        challengeId: requestContactCode.body.challengeId,
        code: latestContactEmailChallenge?.code,
      });

    expect(verifyContactEmail.status).toBe(200);

    const publish = await publishProfessional(app, professional.cookie, {
      contactEmail: "jobs@ada.dev",
      showContactEmailToRecruiters: true,
    });

    expect(publish.status).toBe(200);

    const recruiterContact = await request(app)
      .get(`/api/recruiter/profiles/${publish.body.publication.publicSlug}/contact`)
      .set("Cookie", recruiter.cookie);

    expect(recruiterContact.status).toBe(200);
    expect(recruiterContact.body).toEqual({
      email: "jobs@ada.dev",
    });

    const accesses = await request(app)
      .get("/api/auth/profile/contact-accesses")
      .set("Cookie", professional.cookie);

    expect(accesses.status).toBe(200);
    expect(accesses.body.accesses).toContainEqual(
      expect.objectContaining({
        recruiterUserId: recruiter.user.id,
        recruiterName: "Rachel Recruiter",
        recruiterEmailHint: "ra****@example.com",
      }),
    );

    const contactAccessId = accesses.body.accesses[0].id;

    const recruiterReport = await request(app)
      .post("/api/reports")
      .set("Cookie", professional.cookie)
      .send({
        targetKind: "recruiter_contact_access",
        targetRef: String(contactAccessId),
        category: "harassment_or_abuse",
        description: "Abordagem indevida após acesso ao contato.",
      });

    expect(recruiterReport.status).toBe(201);
    expect(recruiterReport.body.report).toMatchObject({
      targetKind: "recruiter_contact_access",
      status: "open",
    });

    const exported = await request(app)
      .get("/api/auth/account/privacy-export")
      .set("Cookie", professional.cookie);

    expect(exported.status).toBe(200);
    expect(exported.body.moderation.contactAccessLogs).toContainEqual(
      expect.objectContaining({
        recruiterUserId: recruiter.user.id,
        recruiterName: "Rachel Recruiter",
      }),
    );

    const openReports = await request(app)
      .get("/api/admin/moderation/reports")
      .set("Cookie", admin.cookie);

    expect(openReports.status).toBe(200);
    expect(openReports.body.reports).toContainEqual(
      expect.objectContaining({
        id: recruiterReport.body.report.id,
        targetKind: "recruiter_contact_access",
      }),
    );
  });

  it("aceita denúncia de perfil público, envia recibo por e-mail, bloqueia duplicata ativa e expõe o status do denunciante", async () => {
    const { app, pool, sendCodeEmail, sendModerationReportReceiptEmail } = await createTestContext();
    const reporter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Reporter",
      email: "grace-reporter@example.com",
      role: "professional",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-reported-profile@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    const createReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: publish.body.publication.publicSlug,
        category: "false_identity",
        description: "Perfil aparentemente falso.",
      });

    expect(createReport.status).toBe(201);
    expect(createReport.body.report).toMatchObject({
      targetKind: "professional_public_profile",
      category: "false_identity",
      status: "open",
      targetStrikeCount: 0,
      nextSanction: "hide_professional_profile",
    });
    expect(sendModerationReportReceiptEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "grace-reporter@example.com",
        reporterName: "Grace Reporter",
        targetKind: "professional_public_profile",
        category: "false_identity",
        reportId: createReport.body.report.id,
      }),
    );

    const receiptOutbox = await pool.query(
      `
        SELECT template_key, status, priority, source_type, source_id
        FROM email_outbox
        WHERE template_key = 'moderation_report_receipt'
          AND source_id = $1
        LIMIT 1
      `,
      [createReport.body.report.id],
    );

    expect(receiptOutbox.rows[0]).toMatchObject({
      template_key: "moderation_report_receipt",
      status: "sent",
      priority: 500,
      source_type: "moderation_report",
      source_id: createReport.body.report.id,
    });

    const duplicateReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: publish.body.publication.publicSlug,
        category: "false_identity",
        description: "Tentando repetir a mesma denúncia.",
      });

    expect(duplicateReport.status).toBe(409);
    expect(duplicateReport.body.error).toBe("report_already_open");

    const reportStatus = await request(app)
      .get("/api/reports/me/status")
      .set("Cookie", reporter.cookie);

    expect(reportStatus.status).toBe(200);
    expect(reportStatus.body).toMatchObject({
      canSubmit: true,
      falseReportStrikeCount: 0,
      reportingRestrictedUntil: null,
    });
  });

  it("faz rollback da denúncia quando o e-mail de confirmação falha", async () => {
    const { app, pool, sendCodeEmail, sendModerationReportReceiptEmail } = await createTestContext();
    const reporter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Reporter",
      email: "grace-report-receipt@example.com",
      role: "professional",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-report-receipt@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    sendModerationReportReceiptEmail.mockRejectedValueOnce(new EmailDeliveryError());

    const createReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: publish.body.publication.publicSlug,
        category: "other",
        description: "Falha proposital no recibo por e-mail.",
      });

    expect(createReport.status).toBe(503);
    expect(createReport.body.error).toBe("email_delivery_failed");

    const reports = await pool.query("SELECT id FROM moderation_reports");
    expect(reports.rows).toEqual([]);
  });

  it("aplica strike por denúncia falsa e restringe novos envios após a terceira ocorrência na janela", async () => {
    const { app, pool, sendCodeEmail } = await createTestContext();
    const admin = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Morgan Admin",
      email: "admin-false-report@example.com",
      role: "professional",
    });
    const reporter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Reporter",
      email: "grace-false-report@example.com",
      role: "professional",
    });

    await promoteUserToAdministrator(pool, admin.user.id);

    for (let index = 1; index <= 3; index += 1) {
      const target = await createAndVerifyUser(app, sendCodeEmail, {
        name: `Target ${index}`,
        email: `target-false-report-${index}@example.com`,
        role: "professional",
      });

      const publish = await publishProfessional(app, target.cookie, {
        name: `Target ${index}`,
        headline: "Frontend Engineer",
        city: "São Paulo",
        state: "SP",
        skills: ["React"],
        openToOpportunities: true,
      });

      expect(publish.status).toBe(200);

      const created = await request(app)
        .post("/api/reports")
        .set("Cookie", reporter.cookie)
        .send({
          targetKind: "professional_public_profile",
          targetRef: publish.body.publication.publicSlug,
          category: "spam_or_scraping",
          description: `Denúncia ${index}`,
        });

      expect(created.status).toBe(201);

      const resolved = await request(app)
        .post(`/api/admin/moderation/reports/${created.body.report.id}/resolve`)
        .set("Cookie", admin.cookie)
        .send({
          decision: "dismiss_false_report",
          adminNotes: `Falsa denúncia ${index}`,
        });

      expect(resolved.status).toBe(200);
      expect(resolved.body.report).toMatchObject({
        status: "resolved",
        resolutionCode: "dismiss_false_report",
      });
    }

    const reportStatus = await request(app)
      .get("/api/reports/me/status")
      .set("Cookie", reporter.cookie);

    expect(reportStatus.status).toBe(200);
    expect(reportStatus.body.canSubmit).toBe(false);
    expect(reportStatus.body.falseReportStrikeCount).toBe(3);
    expect(reportStatus.body.reportingRestrictedUntil).toEqual(expect.any(String));

    const blockedTarget = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Blocked Target",
      email: "blocked-target@example.com",
      role: "professional",
    });
    const blockedPublish = await publishProfessional(app, blockedTarget.cookie, {
      name: "Blocked Target",
      headline: "Platform Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["Node.js"],
      openToOpportunities: true,
    });

    expect(blockedPublish.status).toBe(200);

    const blockedReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: blockedPublish.body.publication.publicSlug,
        category: "other",
        description: "Nova denúncia após a restrição.",
      });

    expect(blockedReport.status).toBe(403);
    expect(blockedReport.body.error).toBe("reporting_restricted");
  });

  it("aplica o primeiro strike em perfil público ocultando o perfil, envia e-mail e exige restauração administrativa antes de nova publicação", async () => {
    const { app, pool, sendCodeEmail, sendModerationDecisionEmail } = await createTestContext();
    const admin = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Morgan Admin",
      email: "admin-hide-profile@example.com",
      role: "professional",
    });
    const reporter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Reporter",
      email: "grace-hide-profile@example.com",
      role: "professional",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-hide-profile@example.com",
      role: "professional",
    });

    await promoteUserToAdministrator(pool, admin.user.id);

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    const created = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: publish.body.publication.publicSlug,
        category: "third_party_data",
        description: "Dados de terceiros no perfil.",
      });

    expect(created.status).toBe(201);
    expect(created.body.report.nextSanction).toBe("hide_professional_profile");

    const resolved = await request(app)
      .post(`/api/admin/moderation/reports/${created.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "hide_professional_profile",
        adminNotes: "Conteúdo removido da vitrine pública.",
      });

    expect(resolved.status).toBe(200);
    expect(resolved.body.report.resolutionCode).toBe("hide_professional_profile");
    expect(sendModerationDecisionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada-hide-profile@example.com",
        actionType: "hide_professional_profile",
        targetKind: "professional_public_profile",
        category: "third_party_data",
        strikeCount: 0,
      }),
    );

    const decisionOutbox = await pool.query(
      `
        SELECT template_key, status, priority, source_type, source_id
        FROM email_outbox
        WHERE template_key = 'moderation_decision'
          AND source_id = $1
        LIMIT 1
      `,
      [created.body.report.id],
    );

    expect(decisionOutbox.rows[0]).toMatchObject({
      template_key: "moderation_decision",
      status: "sent",
      priority: 500,
      source_type: "moderation_report",
      source_id: created.body.report.id,
    });

    const publicProfile = await request(app).get(`/api/profiles/${publish.body.publication.publicSlug}`);
    expect(publicProfile.status).toBe(404);

    const blockedPublish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
      isPublished: true,
    });

    expect(blockedPublish.status).toBe(403);
    expect(blockedPublish.body.error).toBe("profile_moderation_blocked");

    const restore = await request(app)
      .post(`/api/admin/moderation/users/${professional.user.id}/restore-profile`)
      .set("Cookie", admin.cookie)
      .send({
        reason: "Conteúdo corrigido.",
      });

    expect(restore.status).toBe(200);
    expect(restore.body.ok).toBe(true);

    const republish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
      isPublished: true,
    });

    expect(republish.status).toBe(200);
    expect(republish.body.publication.isPublished).toBe(true);
  });

  it("aplica o segundo strike em perfil público suspendendo a conta e enviando o e-mail de suspensão", async () => {
    const { app, pool, sendCodeEmail, sendModerationDecisionEmail } = await createTestContext();
    const admin = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Morgan Admin",
      email: "admin-second-strike@example.com",
      role: "professional",
    });
    const reporter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Reporter",
      email: "grace-second-strike@example.com",
      role: "professional",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-second-strike@example.com",
      role: "professional",
    });

    await promoteUserToAdministrator(pool, admin.user.id);

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    const firstReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: publish.body.publication.publicSlug,
        category: "other",
        description: "Primeiro registro para gerar o primeiro strike.",
      });

    expect(firstReport.status).toBe(201);

    const firstResolution = await request(app)
      .post(`/api/admin/moderation/reports/${firstReport.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "hide_professional_profile",
        adminNotes: "Primeiro strike aplicado.",
      });

    expect(firstResolution.status).toBe(200);

    const restoreProfile = await request(app)
      .post(`/api/admin/moderation/users/${professional.user.id}/restore-profile`)
      .set("Cookie", admin.cookie)
      .send({
        reason: "Perfil revisado para continuar a investigação.",
      });

    expect(restoreProfile.status).toBe(200);

    const republish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
      isPublished: true,
    });

    expect(republish.status).toBe(200);

    const secondReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: republish.body.publication.publicSlug,
        category: "fraud_or_misleading",
        description: "Segundo registro para avançar a escada de sanções.",
      });

    expect(secondReport.status).toBe(201);
    expect(secondReport.body.report.targetStrikeCount).toBe(1);
    expect(secondReport.body.report.nextSanction).toBe("suspend_target_account");

    const resolved = await request(app)
      .post(`/api/admin/moderation/reports/${secondReport.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "suspend_target_account",
        adminNotes: "Segundo strike aplicado com suspensão.",
      });

    expect(resolved.status).toBe(200);
    expect(resolved.body.report.resolutionCode).toBe("suspend_target_account");
    expect(sendModerationDecisionEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: "ada-second-strike@example.com",
        actionType: "suspend_target_account",
        targetKind: "professional_public_profile",
        category: "fraud_or_misleading",
        strikeCount: 1,
      }),
    );

    const suspendedMe = await request(app)
      .get("/api/auth/me")
      .set("Cookie", professional.cookie);

    expect(suspendedMe.status).toBe(403);
    expect(suspendedMe.body.error).toBe("account_suspended");
  });

  it("aplica o terceiro strike com banimento definitivo, purge operacional e bloqueio silencioso de novo auth", async () => {
    const { app, pool, sendCodeEmail, sendModerationDecisionEmail } = await createTestContext();
    const admin = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Morgan Admin",
      email: "admin-third-strike@example.com",
      role: "professional",
    });
    const reporter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Reporter",
      email: "grace-third-strike@example.com",
      role: "professional",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-third-strike@example.com",
      role: "professional",
    });

    await promoteUserToAdministrator(pool, admin.user.id);

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    const firstReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: publish.body.publication.publicSlug,
        category: "other",
        description: "Primeiro strike.",
      });

    expect(firstReport.status).toBe(201);

    const firstResolution = await request(app)
      .post(`/api/admin/moderation/reports/${firstReport.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "hide_professional_profile",
        adminNotes: "Primeiro strike.",
      });

    expect(firstResolution.status).toBe(200);

    await request(app)
      .post(`/api/admin/moderation/users/${professional.user.id}/restore-profile`)
      .set("Cookie", admin.cookie)
      .send({
        reason: "Perfil revisado.",
      });

    const republishAfterFirst = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
      isPublished: true,
    });

    expect(republishAfterFirst.status).toBe(200);

    const secondReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: republishAfterFirst.body.publication.publicSlug,
        category: "fraud_or_misleading",
        description: "Segundo strike.",
      });

    expect(secondReport.status).toBe(201);

    const secondResolution = await request(app)
      .post(`/api/admin/moderation/reports/${secondReport.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "suspend_target_account",
        adminNotes: "Segundo strike.",
      });

    expect(secondResolution.status).toBe(200);

    const restoreAccount = await request(app)
      .post(`/api/admin/moderation/users/${professional.user.id}/restore-account`)
      .set("Cookie", admin.cookie)
      .send({
        reason: "Conta reativada para fechamento do fluxo de reincidência.",
      });

    expect(restoreAccount.status).toBe(200);

    const restoredLogin = await signInWithCode(app, sendCodeEmail, "ada-third-strike@example.com");
    const republishAfterSecond = await publishProfessional(app, restoredLogin.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
      isPublished: true,
    });

    expect(republishAfterSecond.status).toBe(200);

    const thirdReport = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: republishAfterSecond.body.publication.publicSlug,
        category: "third_party_data",
        description: "Terceiro strike.",
      });

    expect(thirdReport.status).toBe(201);
    expect(thirdReport.body.report.targetStrikeCount).toBe(2);
    expect(thirdReport.body.report.nextSanction).toBe("permanent_ban_target_account");

    const resolved = await request(app)
      .post(`/api/admin/moderation/reports/${thirdReport.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "permanent_ban_target_account",
        adminNotes: "Terceiro strike com encerramento definitivo.",
      });

    expect(resolved.status).toBe(200);
    expect(resolved.body.report.resolutionCode).toBe("permanent_ban_target_account");
    expect(sendModerationDecisionEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: "ada-third-strike@example.com",
        actionType: "permanent_ban_target_account",
        targetKind: "professional_public_profile",
        category: "third_party_data",
        strikeCount: 2,
        isImmediatePermanentBan: false,
      }),
    );

    const deletedUser = await pool.query("SELECT id FROM users WHERE email = $1", ["ada-third-strike@example.com"]);
    expect(deletedUser.rows).toEqual([]);

    const banRegistry = await pool.query(
      "SELECT email_hash, reason FROM moderation_banned_email_hashes WHERE email_hash = $1 LIMIT 1",
      [hashModerationEmail("ada-third-strike@example.com", TEST_CONFIG.authCodePepper)],
    );

    expect(banRegistry.rows[0]).toMatchObject({
      email_hash: hashModerationEmail("ada-third-strike@example.com", TEST_CONFIG.authCodePepper),
      reason: "Terceiro strike com encerramento definitivo.",
    });

    const purgeLedger = await pool.query(
      "SELECT event_type, source FROM legal_audit_ledger WHERE event_type = 'moderation_account_purge' ORDER BY id DESC LIMIT 1",
    );

    expect(purgeLedger.rows[0]).toMatchObject({
      event_type: "moderation_account_purge",
      source: "admin_moderation_permanent_ban",
    });

    sendCodeEmail.mockClear();

    const suppressedLogin = await requestCode(app, "ada-third-strike@example.com");
    expect(suppressedLogin.status).toBe(200);
    expect(sendCodeEmail).not.toHaveBeenCalled();

    const signupAfterBan = await signUp(app, {
      name: "Ada Ban Attempt",
      email: "ada-third-strike@example.com",
      role: "professional",
    });

    expect(signupAfterBan.status).toBe(200);
    expect(sendCodeEmail).not.toHaveBeenCalled();

    const adminQueue = await request(app)
      .get("/api/admin/moderation/reports")
      .set("Cookie", admin.cookie);

    expect(adminQueue.status).toBe(200);
    expect(adminQueue.body.recentActions).toContainEqual(
      expect.objectContaining({
        actionType: "permanent_ban_target_account",
        subjectUserId: null,
        subjectName: "Ada Lovelace",
        relatedReportId: thirdReport.body.report.id,
      }),
    );
  });

  it("exige banimento definitivo imediato para discriminação em perfil público", async () => {
    const { app, pool, sendCodeEmail, sendModerationDecisionEmail } = await createTestContext();
    const admin = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Morgan Admin",
      email: "admin-discrimination-ban@example.com",
      role: "professional",
    });
    const reporter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Grace Reporter",
      email: "grace-discrimination-ban@example.com",
      role: "professional",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-discrimination-ban@example.com",
      role: "professional",
    });

    await promoteUserToAdministrator(pool, admin.user.id);

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React"],
      openToOpportunities: true,
    });

    expect(publish.status).toBe(200);

    const created = await request(app)
      .post("/api/reports")
      .set("Cookie", reporter.cookie)
      .send({
        targetKind: "professional_public_profile",
        targetRef: publish.body.publication.publicSlug,
        category: "discrimination",
        description: "Conteúdo racista no perfil público.",
      });

    expect(created.status).toBe(201);
    expect(created.body.report.targetStrikeCount).toBe(0);
    expect(created.body.report.nextSanction).toBe("permanent_ban_target_account");

    const invalidHide = await request(app)
      .post(`/api/admin/moderation/reports/${created.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "hide_professional_profile",
        adminNotes: "Tentativa inválida de sanção leve.",
      });

    expect(invalidHide.status).toBe(409);
    expect(invalidHide.body.error).toBe("invalid_resolution_sequence");
    expect(invalidHide.body.expectedDecision).toBe("permanent_ban_target_account");

    const resolved = await request(app)
      .post(`/api/admin/moderation/reports/${created.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "permanent_ban_target_account",
        adminNotes: "Conteúdo discriminatório grave em perfil público.",
      });

    expect(resolved.status).toBe(200);
    expect(resolved.body.report.resolutionCode).toBe("permanent_ban_target_account");
    expect(sendModerationDecisionEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: "ada-discrimination-ban@example.com",
        actionType: "permanent_ban_target_account",
        targetKind: "professional_public_profile",
        category: "discrimination",
        strikeCount: 0,
        isImmediatePermanentBan: true,
      }),
    );

    const deletedUser = await pool.query("SELECT id FROM users WHERE email = $1", ["ada-discrimination-ban@example.com"]);
    expect(deletedUser.rows).toEqual([]);
  });

  it("mantém a suspensão manual para abuso de contato, envia e-mail e permite restaurar o acesso via decisão administrativa", async () => {
    const { app, pool, sendCodeEmail, sendModerationDecisionEmail } = await createTestContext();
    const admin = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Morgan Admin",
      email: "admin-suspend-account@example.com",
      role: "professional",
    });
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel-suspend-account@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-suspend-account@example.com",
      role: "professional",
    });

    await promoteUserToAdministrator(pool, admin.user.id);

    const requestContactCode = await request(app)
      .post("/api/auth/profile/contact-email/request-code")
      .set("Cookie", professional.cookie)
      .send({
        nextContactEmail: "jobs@ada.dev",
      });

    const latestContactEmailChallenge = getLatestEmailByPurpose(sendCodeEmail, "profile_contact_email");

    await request(app)
      .post("/api/auth/profile/contact-email/verify")
      .set("Cookie", professional.cookie)
      .send({
        challengeId: requestContactCode.body.challengeId,
        code: latestContactEmailChallenge?.code,
      });

    const publish = await publishProfessional(app, professional.cookie, {
      contactEmail: "jobs@ada.dev",
      showContactEmailToRecruiters: true,
    });

    expect(publish.status).toBe(200);

    await request(app)
      .get(`/api/recruiter/profiles/${publish.body.publication.publicSlug}/contact`)
      .set("Cookie", recruiter.cookie);

    const accesses = await request(app)
      .get("/api/auth/profile/contact-accesses")
      .set("Cookie", professional.cookie);

    const created = await request(app)
      .post("/api/reports")
      .set("Cookie", professional.cookie)
      .send({
        targetKind: "recruiter_contact_access",
        targetRef: String(accesses.body.accesses[0].id),
        category: "harassment_or_abuse",
        description: "Uso indevido do canal de contato.",
      });

    expect(created.status).toBe(201);

    const resolved = await request(app)
      .post(`/api/admin/moderation/reports/${created.body.report.id}/resolve`)
      .set("Cookie", admin.cookie)
      .send({
        decision: "suspend_target_account",
        adminNotes: "Conta suspensa após revisão.",
      });

    expect(resolved.status).toBe(200);
    expect(resolved.body.report.resolutionCode).toBe("suspend_target_account");
    expect(sendModerationDecisionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "rachel-suspend-account@example.com",
        actionType: "suspend_target_account",
        targetKind: "recruiter_contact_access",
        category: "harassment_or_abuse",
      }),
    );

    const suspendedMe = await request(app)
      .get("/api/auth/me")
      .set("Cookie", recruiter.cookie);

    expect(suspendedMe.status).toBe(403);
    expect(suspendedMe.body.error).toBe("account_suspended");

    const restore = await request(app)
      .post(`/api/admin/moderation/users/${recruiter.user.id}/restore-account`)
      .set("Cookie", admin.cookie)
      .send({
        reason: "Suspensão revertida.",
      });

    expect(restore.status).toBe(200);
    expect(restore.body.ok).toBe(true);

    const restoredLogin = await signInWithCode(app, sendCodeEmail, "rachel-suspend-account@example.com");
    const restoredMe = await request(app)
      .get("/api/auth/me")
      .set("Cookie", restoredLogin.cookie);

    expect(restoredMe.status).toBe(200);
    expect(restoredMe.body.user.email).toBe("rachel-suspend-account@example.com");
  });

  it("aceita referência curta de dois caracteres na busca inclusiva", async () => {
    const { app, sendCodeEmail } = await createTestContext();
    const recruiter = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Rachel Recruiter",
      email: "rachel-short-ref@example.com",
      role: "recruiter",
    });
    const professional = await createAndVerifyUser(app, sendCodeEmail, {
      name: "Ada Lovelace",
      email: "ada-short-ref@example.com",
      role: "professional",
    });

    const publish = await publishProfessional(app, professional.cookie, {
      headline: "Frontend Engineer",
      city: "São Paulo",
      state: "SP",
      skills: ["React", "TypeScript"],
      openToOpportunities: true,
      affirmativeProfile: {
        groups: ["women"],
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        consentAcceptedAt: null,
      },
      affirmativeConsentAccepted: true,
    });

    expect(publish.status).toBe(200);

    await request(app)
      .post("/api/recruiter/affirmative-search/policy-acceptance")
      .set("Cookie", recruiter.cookie)
      .send({
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
      });

    const inclusiveSearch = await request(app)
      .post("/api/recruiter/affirmative-search")
      .set("Cookie", recruiter.cookie)
      .send({
        q: "",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: true,
        page: 1,
        pageSize: 20,
        affirmativeContext: {
          useCase: "vaga_afirmativa",
          vacancyReference: "RQ",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: [],
          pcdOnly: false,
        },
      });

    expect(inclusiveSearch.status).toBe(200);
    expect(inclusiveSearch.body.total).toBe(1);
    expect(inclusiveSearch.body.items[0]).toMatchObject({
      id: professional.user.id,
      name: "Ada Lovelace",
    });
  });
});
