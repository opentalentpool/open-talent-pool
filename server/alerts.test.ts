import fs from "fs";
import path from "path";
import { newDb } from "pg-mem";
import { fileURLToPath } from "url";
import { describe, expect, it, vi } from "vitest";
import { createAsyncEmailSenderRegistry, runAsyncEmailDeliveryCycle } from "./async-email.js";
import {
  dispatchProfessionalProfileFreshnessNotifications,
  dispatchSavedSearchAlerts,
} from "./alerts.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(currentDir, "db", "schema.sql");

function loadTestSchema() {
  return fs
    .readFileSync(schemaPath, "utf8")
    .replace("CREATE INDEX IF NOT EXISTS user_profiles_profile_data_gin_idx ON user_profiles USING GIN (profile_data);", "");
}

async function createTestPool() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();

  await pool.query(loadTestSchema());

  return pool;
}

async function createUser(pool, { name, email, role, isVerified = true }) {
  const result = await pool.query(
    `
      INSERT INTO users (name, email, role, is_verified)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [name, email, role, isVerified],
  );

  const userId = Number(result.rows[0].id);

  await pool.query(
    `
      INSERT INTO user_roles (user_id, role, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, role) DO NOTHING
    `,
    [userId, role],
  );

  return userId;
}

async function createPublishedProfile(pool, userId, overrides = {}) {
  const workModels = Array.isArray(overrides.workModels)
    ? overrides.workModels
    : overrides.workModel
      ? [overrides.workModel]
      : ["remoto"];
  const profileData = {
    name: overrides.name || "Ada Lovelace",
    city: overrides.city || "São Paulo",
    state: overrides.state || "SP",
    bio: overrides.bio || "Especialista em React.",
    headline: overrides.headline || "Frontend Engineer",
    linkedin: overrides.linkedin || "",
    github: overrides.github || "",
    portfolio: overrides.portfolio || "",
    skills: overrides.skills || ["React"],
    experiences: overrides.experiences || [],
    seniority: overrides.seniority || "pleno",
    workModels,
    openToOpportunities: overrides.openToOpportunities ?? true,
    isPublished: true,
    affirmativeProfile: overrides.affirmativeProfile || {
      groups: [],
      policyVersion: "",
      consentAcceptedAt: null,
    },
  };

  await pool.query(
    `
      INSERT INTO user_profiles (user_id, profile_data, is_published, public_slug, published_at, updated_at, expired_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      userId,
      profileData,
      overrides.isPublished ?? true,
      overrides.publicSlug || `perfil-${userId}`,
      overrides.publishedAt || new Date(),
      overrides.updatedAt || overrides.publishedAt || new Date(),
      overrides.expiredAt || null,
    ],
  );
}

async function createSavedSearch(pool, overrides = {}) {
  const result = await pool.query(
    `
      INSERT INTO saved_searches (
        recruiter_user_id,
        name,
        criteria_json,
        alert_frequency,
        last_alert_sent_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      RETURNING id
    `,
    [
      overrides.recruiterId,
      overrides.name || "Busca salva",
      overrides.criteria || {
        q: "",
        seniority: "",
        workModel: "",
        state: "",
        openToOpportunities: false,
      },
      overrides.alertFrequency || "daily",
      overrides.lastAlertSentAt || null,
      overrides.createdAt || new Date(),
    ],
  );

  return Number(result.rows[0].id);
}

describe("dispatchSavedSearchAlerts", () => {
  it("cria lote e outbox, evita duplicar batches pendentes e só marca notificado após a entrega", async () => {
    const pool = await createTestPool();
    const recruiterId = await createUser(pool, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const professionalId = await createUser(pool, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });

    await createSavedSearch(pool, {
      recruiterId,
      name: "React remoto",
      criteria: {
        q: "react",
        seniority: "",
        workModel: "remoto",
        state: "SP",
        openToOpportunities: false,
      },
      alertFrequency: "daily",
      createdAt: new Date("2026-04-20T10:00:00.000Z"),
    });
    await createPublishedProfile(pool, professionalId, {
      name: "Ada Lovelace",
      publicSlug: "ada-lovelace-2",
      publishedAt: new Date("2026-04-21T12:00:00.000Z"),
    });

    const firstRun = await dispatchSavedSearchAlerts({
      pool,
      appBaseUrl: "http://localhost:8080",
      now: new Date("2026-04-22T12:00:00.000Z"),
    });

    expect(firstRun).toEqual({
      processed: 1,
      queued: 1,
      matchedProfiles: 1,
    });

    const pendingBatch = await pool.query(
      `
        SELECT status, email_outbox_id
        FROM saved_search_alert_batches
        ORDER BY id ASC
      `,
    );

    expect(pendingBatch.rows).toHaveLength(1);
    expect(pendingBatch.rows[0]).toMatchObject({
      status: "pending",
    });
    expect(pendingBatch.rows[0].email_outbox_id).toBeTruthy();

    const secondRun = await dispatchSavedSearchAlerts({
      pool,
      appBaseUrl: "http://localhost:8080",
      now: new Date("2026-04-22T18:00:00.000Z"),
    });

    expect(secondRun).toEqual({
      processed: 1,
      queued: 0,
      matchedProfiles: 0,
    });

    const notifiedBeforeDelivery = await pool.query("SELECT professional_user_id FROM saved_search_notified_profiles");

    expect(notifiedBeforeDelivery.rows).toHaveLength(0);

    const sendSavedSearchAlertEmail = vi.fn().mockResolvedValue({ messageId: "smtp-saved-search-1" });

    const deliverySummary = await runAsyncEmailDeliveryCycle({
      pool,
      senderRegistry: createAsyncEmailSenderRegistry({
        sendSavedSearchAlertEmail,
      }),
      maxAttempts: 3,
      retryBaseDelayMs: 60_000,
      now: new Date("2026-04-22T18:30:00.000Z"),
    });

    expect(deliverySummary.sent).toBe(1);
    expect(sendSavedSearchAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendSavedSearchAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "rachel@example.com",
        searchName: "React remoto",
      }),
    );

    const outboxRows = await pool.query(
      `
        SELECT status, provider_message_id, sent_at
        FROM email_outbox
        ORDER BY id ASC
      `,
    );

    expect(outboxRows.rows).toEqual([
      expect.objectContaining({
        status: "sent",
        provider_message_id: "smtp-saved-search-1",
        sent_at: expect.any(Date),
      }),
    ]);

    const notifiedProfiles = await pool.query(
      "SELECT professional_user_id FROM saved_search_notified_profiles ORDER BY professional_user_id ASC",
    );

    expect(notifiedProfiles.rows).toEqual([{ professional_user_id: professionalId }]);

    const savedSearchRow = await pool.query(
      "SELECT last_alert_sent_at FROM saved_searches ORDER BY id ASC",
    );

    expect(savedSearchRow.rows[0].last_alert_sent_at).toBeTruthy();
  });

  it("respeita as janelas semanal, quinzenal e mensal ao produzir batches no outbox", async () => {
    const pool = await createTestPool();
    const recruiterId = await createUser(pool, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });

    const weeklyProfessionalId = await createUser(pool, {
      name: "Grace Hopper",
      email: "grace@example.com",
      role: "professional",
    });
    const biweeklyProfessionalId = await createUser(pool, {
      name: "Katherine Johnson",
      email: "katherine@example.com",
      role: "professional",
    });
    const monthlyProfessionalId = await createUser(pool, {
      name: "Margaret Hamilton",
      email: "margaret@example.com",
      role: "professional",
    });

    await createSavedSearch(pool, {
      recruiterId,
      name: "Go semanal",
      criteria: {
        q: "go",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: false,
      },
      alertFrequency: "weekly",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      lastAlertSentAt: new Date("2026-04-22T10:00:00.000Z"),
    });
    await createSavedSearch(pool, {
      recruiterId,
      name: "Python quinzenal",
      criteria: {
        q: "python",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: false,
      },
      alertFrequency: "biweekly",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      lastAlertSentAt: new Date("2026-04-15T10:00:00.000Z"),
    });
    await createSavedSearch(pool, {
      recruiterId,
      name: "Rust mensal",
      criteria: {
        q: "rust",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: false,
      },
      alertFrequency: "monthly",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      lastAlertSentAt: new Date("2026-03-20T10:00:00.000Z"),
    });
    await createSavedSearch(pool, {
      recruiterId,
      name: "Java desativado",
      criteria: {
        q: "java",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: false,
      },
      alertFrequency: "disabled",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      lastAlertSentAt: new Date("2026-04-01T10:00:00.000Z"),
    });

    await createPublishedProfile(pool, weeklyProfessionalId, {
      name: "Grace Hopper",
      headline: "Go Engineer",
      skills: ["Go"],
      publicSlug: "grace-hopper-weekly",
      publishedAt: new Date("2026-04-29T12:00:00.000Z"),
    });
    await createPublishedProfile(pool, biweeklyProfessionalId, {
      name: "Katherine Johnson",
      headline: "Python Engineer",
      skills: ["Python"],
      publicSlug: "katherine-johnson-biweekly",
      publishedAt: new Date("2026-04-29T12:00:00.000Z"),
    });
    await createPublishedProfile(pool, monthlyProfessionalId, {
      name: "Margaret Hamilton",
      headline: "Rust Engineer",
      skills: ["Rust"],
      publicSlug: "margaret-hamilton-monthly",
      publishedAt: new Date("2026-04-29T12:00:00.000Z"),
    });

    const result = await dispatchSavedSearchAlerts({
      pool,
      appBaseUrl: "http://localhost:8080",
      now: new Date("2026-04-30T12:00:00.000Z"),
    });

    expect(result).toEqual({
      processed: 3,
      queued: 3,
      matchedProfiles: 3,
    });

    const sendSavedSearchAlertEmail = vi.fn().mockResolvedValue({ messageId: "smtp-saved-search-bulk" });

    await runAsyncEmailDeliveryCycle({
      pool,
      senderRegistry: createAsyncEmailSenderRegistry({
        sendSavedSearchAlertEmail,
      }),
      maxAttempts: 3,
      retryBaseDelayMs: 60_000,
      now: new Date("2026-04-30T12:30:00.000Z"),
    });

    expect(sendSavedSearchAlertEmail).toHaveBeenCalledTimes(3);
    expect(
      sendSavedSearchAlertEmail.mock.calls
        .map(([payload]) => payload.searchName)
        .sort(),
    ).toEqual(["Go semanal", "Python quinzenal", "Rust mensal"]);
  });

  it("não envia backlog quando uma busca é reativada depois de ficar desativada", async () => {
    const pool = await createTestPool();
    const recruiterId = await createUser(pool, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });
    const backlogProfessionalId = await createUser(pool, {
      name: "Barbara Liskov",
      email: "barbara@example.com",
      role: "professional",
    });
    const freshProfessionalId = await createUser(pool, {
      name: "Radia Perlman",
      email: "radia@example.com",
      role: "professional",
    });

    await createSavedSearch(pool, {
      recruiterId,
      name: "Kubernetes semanal",
      criteria: {
        q: "kubernetes",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: false,
      },
      alertFrequency: "weekly",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      lastAlertSentAt: new Date("2026-04-20T10:00:00.000Z"),
    });

    await createPublishedProfile(pool, backlogProfessionalId, {
      name: "Barbara Liskov",
      headline: "Platform Engineer",
      skills: ["Kubernetes"],
      publicSlug: "barbara-liskov-backlog",
      publishedAt: new Date("2026-04-18T10:00:00.000Z"),
    });
    await createPublishedProfile(pool, freshProfessionalId, {
      name: "Radia Perlman",
      headline: "Platform Engineer",
      skills: ["Kubernetes"],
      publicSlug: "radia-perlman-fresh",
      publishedAt: new Date("2026-04-26T10:00:00.000Z"),
    });

    const result = await dispatchSavedSearchAlerts({
      pool,
      appBaseUrl: "http://localhost:8080",
      now: new Date("2026-04-28T12:00:00.000Z"),
    });

    expect(result).toEqual({
      processed: 1,
      queued: 1,
      matchedProfiles: 1,
    });

    const sendSavedSearchAlertEmail = vi.fn().mockResolvedValue({ messageId: "smtp-saved-search-reactivated" });

    await runAsyncEmailDeliveryCycle({
      pool,
      senderRegistry: createAsyncEmailSenderRegistry({
        sendSavedSearchAlertEmail,
      }),
      maxAttempts: 3,
      retryBaseDelayMs: 60_000,
      now: new Date("2026-04-28T12:30:00.000Z"),
    });

    expect(sendSavedSearchAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: [
          expect.objectContaining({
            name: "Radia Perlman",
          }),
        ],
      }),
    );
  });

  it("preserva a busca afirmativa ao produzir e entregar o lote assíncrono", async () => {
    const pool = await createTestPool();
    const recruiterId = await createUser(pool, {
      name: "Rachel Recruiter",
      email: "rachel@example.com",
      role: "recruiter",
    });

    const matchingProfessionalId = await createUser(pool, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });
    const raceOnlyProfessionalId = await createUser(pool, {
      name: "Katherine Johnson",
      email: "katherine@example.com",
      role: "professional",
    });
    const genderOnlyProfessionalId = await createUser(pool, {
      name: "Grace Hopper",
      email: "grace@example.com",
      role: "professional",
    });

    await createSavedSearch(pool, {
      recruiterId,
      name: "Busca inclusiva frontend",
      criteria: {
        q: "",
        seniority: "",
        workModel: "",
        state: "SP",
        openToOpportunities: false,
        affirmativeContext: {
          useCase: "vaga_afirmativa",
          vacancyReference: "REQ-123",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: ["black_people", "indigenous_people"],
          pcdOnly: false,
        },
      },
      alertFrequency: "daily",
      createdAt: new Date("2026-04-20T10:00:00.000Z"),
    });

    await createPublishedProfile(pool, matchingProfessionalId, {
      name: "Ada Lovelace",
      publicSlug: "ada-lovelace-2",
      state: "SP",
      affirmativeProfile: {
        groups: ["women", "black_people"],
        policyVersion: "2026-04-26.v1",
        consentAcceptedAt: "2026-04-20T09:00:00.000Z",
      },
      publishedAt: new Date("2026-04-23T12:00:00.000Z"),
    });
    await createPublishedProfile(pool, raceOnlyProfessionalId, {
      name: "Katherine Johnson",
      publicSlug: "katherine-johnson-3",
      state: "SP",
      affirmativeProfile: {
        groups: ["black_people"],
        policyVersion: "2026-04-26.v1",
        consentAcceptedAt: "2026-04-20T09:00:00.000Z",
      },
      publishedAt: new Date("2026-04-22T12:00:00.000Z"),
    });
    await createPublishedProfile(pool, genderOnlyProfessionalId, {
      name: "Grace Hopper",
      publicSlug: "grace-hopper-4",
      state: "SP",
      affirmativeProfile: {
        groups: ["women"],
        policyVersion: "2026-04-26.v1",
        consentAcceptedAt: "2026-04-20T09:00:00.000Z",
      },
      publishedAt: new Date("2026-04-21T12:00:00.000Z"),
    });

    const result = await dispatchSavedSearchAlerts({
      pool,
      appBaseUrl: "http://localhost:8080",
      now: new Date("2026-04-22T12:00:00.000Z"),
    });

    expect(result).toEqual({
      processed: 1,
      queued: 1,
      matchedProfiles: 3,
    });

    const sendSavedSearchAlertEmail = vi.fn().mockResolvedValue({ messageId: "smtp-saved-search-affirmative" });

    await runAsyncEmailDeliveryCycle({
      pool,
      senderRegistry: createAsyncEmailSenderRegistry({
        sendSavedSearchAlertEmail,
      }),
      maxAttempts: 3,
      retryBaseDelayMs: 60_000,
      now: new Date("2026-04-22T12:30:00.000Z"),
    });

    expect(sendSavedSearchAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: [
          expect.objectContaining({ name: "Ada Lovelace" }),
          expect.objectContaining({ name: "Katherine Johnson" }),
          expect.objectContaining({ name: "Grace Hopper" }),
        ],
      }),
    );
  });
});

describe("dispatchProfessionalProfileFreshnessNotifications", () => {
  it("cria notificações pendentes, despublica no marco de 180 dias e só marca sent após a entrega", async () => {
    const pool = await createTestPool();

    const reminder60UserId = await createUser(pool, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "professional",
    });
    const reminder120UserId = await createUser(pool, {
      name: "Grace Hopper",
      email: "grace@example.com",
      role: "professional",
    });
    const expiryUserId = await createUser(pool, {
      name: "Katherine Johnson",
      email: "katherine@example.com",
      role: "professional",
    });

    const now = new Date("2026-04-26T12:00:00.000Z");

    await createPublishedProfile(pool, reminder60UserId, {
      publicSlug: "ada-lovelace-1",
      updatedAt: new Date("2026-02-24T12:00:00.000Z"),
      publishedAt: new Date("2026-02-24T12:00:00.000Z"),
    });
    await createPublishedProfile(pool, reminder120UserId, {
      publicSlug: "grace-hopper-2",
      updatedAt: new Date("2025-12-27T12:00:00.000Z"),
      publishedAt: new Date("2025-12-27T12:00:00.000Z"),
    });
    await createPublishedProfile(pool, expiryUserId, {
      publicSlug: "katherine-johnson-3",
      updatedAt: new Date("2025-10-27T12:00:00.000Z"),
      publishedAt: new Date("2025-10-27T12:00:00.000Z"),
    });

    const summary = await dispatchProfessionalProfileFreshnessNotifications({
      pool,
      appBaseUrl: "http://localhost:8080",
      now,
    });

    expect(summary).toEqual({
      processed: 3,
      remindersQueued: 2,
      expiredProfiles: 1,
    });

    const expiryRow = await pool.query(
      `
        SELECT is_published, expired_at, published_at
        FROM user_profiles
        WHERE user_id = $1
      `,
      [expiryUserId],
    );

    expect(expiryRow.rows[0]).toMatchObject({
      is_published: false,
      published_at: null,
    });
    expect(expiryRow.rows[0].expired_at).toBeTruthy();

    const notificationRows = await pool.query(
      `
        SELECT stage_days, status, email_outbox_id, sent_at
        FROM user_profile_freshness_notifications
        ORDER BY stage_days ASC
      `,
    );

    expect(notificationRows.rows).toEqual([
      expect.objectContaining({
        stage_days: 60,
        status: "pending",
        email_outbox_id: expect.any(Number),
        sent_at: null,
      }),
      expect.objectContaining({
        stage_days: 120,
        status: "pending",
        email_outbox_id: expect.any(Number),
        sent_at: null,
      }),
      expect.objectContaining({
        stage_days: 180,
        status: "pending",
        email_outbox_id: expect.any(Number),
        sent_at: null,
      }),
    ]);

    const secondRun = await dispatchProfessionalProfileFreshnessNotifications({
      pool,
      appBaseUrl: "http://localhost:8080",
      now,
    });

    expect(secondRun).toEqual({
      processed: 2,
      remindersQueued: 0,
      expiredProfiles: 0,
    });

    const sendProfileFreshnessEmail = vi.fn().mockResolvedValue({ messageId: "smtp-freshness-1" });

    const deliverySummary = await runAsyncEmailDeliveryCycle({
      pool,
      senderRegistry: createAsyncEmailSenderRegistry({
        sendProfileFreshnessEmail,
      }),
      maxAttempts: 3,
      retryBaseDelayMs: 60_000,
      now: new Date("2026-04-26T12:30:00.000Z"),
    });

    expect(deliverySummary.sent).toBe(3);
    expect(sendProfileFreshnessEmail).toHaveBeenCalledTimes(3);
    expect(sendProfileFreshnessEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        stageDays: 60,
      }),
    );
    expect(sendProfileFreshnessEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "grace@example.com",
        stageDays: 120,
      }),
    );
    expect(sendProfileFreshnessEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "katherine@example.com",
        stageDays: 180,
      }),
    );

    const sentNotifications = await pool.query(
      `
        SELECT status, sent_at
        FROM user_profile_freshness_notifications
        ORDER BY stage_days ASC
      `,
    );

    expect(sentNotifications.rows).toEqual([
      expect.objectContaining({
        status: "sent",
        sent_at: expect.any(Date),
      }),
      expect.objectContaining({
        status: "sent",
        sent_at: expect.any(Date),
      }),
      expect.objectContaining({
        status: "sent",
        sent_at: expect.any(Date),
      }),
    ]);
  });
});
