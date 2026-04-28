import fs from "fs";
import path from "path";
import { newDb } from "pg-mem";
import { fileURLToPath } from "url";
import { describe, expect, it, vi } from "vitest";
import {
  ASYNC_EMAIL_PRIORITY,
  ASYNC_EMAIL_SOURCE_TYPE,
  ASYNC_EMAIL_TEMPLATE_KEY,
  createAsyncEmailSenderRegistry,
  enqueueAsyncEmail,
  loadEmailOutboxById,
  processAsyncEmailOutboxJob,
  queueAndDeliverAsyncEmail,
  relayPendingEmailOutboxJobs,
} from "./async-email.js";

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

function createSavedSearchPayload(overrides = {}) {
  return {
    to: "rachel@example.com",
    recruiterName: "Rachel Recruiter",
    searchName: "React remoto",
    savedSearchId: 42,
    criteria: {
      q: "react",
      seniority: "",
      workModel: "remoto",
      state: "SP",
      openToOpportunities: false,
    },
    matches: [
      {
        id: 12,
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-12",
        publishedAt: "2026-04-22T10:00:00.000Z",
      },
    ],
    appBaseUrl: "http://localhost:8080",
    ...overrides,
  };
}

function createAuthPayload(overrides = {}) {
  return {
    to: "ada@example.com",
    code: "491534",
    purpose: "login",
    challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
    appBaseUrl: "http://localhost:8080",
    ...overrides,
  };
}

describe("enqueueAsyncEmail", () => {
  it("cria um registro pending com o payload e a agenda explícita do outbox", async () => {
    const pool = await createTestPool();
    const now = new Date("2026-04-22T12:00:00.000Z");

    const outbox = await enqueueAsyncEmail(pool, {
      kind: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      toEmail: "rachel@example.com",
      payload: createSavedSearchPayload(),
      availableAt: now,
      now,
    });

    const persisted = await loadEmailOutboxById(pool, outbox.id);

    expect(persisted).toMatchObject({
      id: outbox.id,
      status: "pending",
      kind: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      toEmail: "rachel@example.com",
      attemptCount: 0,
    });
    expect(persisted?.availableAt).toBe(now.toISOString());
  });
});

describe("relayPendingEmailOutboxJobs", () => {
  it("ordena a fila por prioridade, com auth acima de moderação e alertas", async () => {
    const pool = await createTestPool();
    const now = new Date("2026-04-22T12:00:00.000Z");

    await enqueueAsyncEmail(pool, {
      kind: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      toEmail: "rachel@example.com",
      payload: createSavedSearchPayload(),
      priority: ASYNC_EMAIL_PRIORITY.savedSearchAlert,
      availableAt: now,
      now,
    });
    await enqueueAsyncEmail(pool, {
      kind: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      toEmail: "ada@example.com",
      payload: createAuthPayload(),
      priority: ASYNC_EMAIL_PRIORITY.authCode,
      availableAt: now,
      now,
    });
    await enqueueAsyncEmail(pool, {
      kind: ASYNC_EMAIL_TEMPLATE_KEY.moderationDecision,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.moderationDecision,
      toEmail: "grace@example.com",
      payload: {
        to: "grace@example.com",
        targetName: "Grace",
        targetKind: "professional_public_profile",
        actionType: "hide_professional_profile",
      },
      priority: ASYNC_EMAIL_PRIORITY.moderation,
      availableAt: now,
      now,
    });

    const queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue(undefined),
    };

    const summary = await relayPendingEmailOutboxJobs({
      pool,
      queue,
      now: new Date("2026-04-22T12:01:00.000Z"),
    });

    expect(summary).toEqual({
      scanned: 3,
      queued: 3,
      existing: 0,
    });
    expect(queue.add.mock.calls.map((call) => call[0])).toEqual([
      ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      ASYNC_EMAIL_TEMPLATE_KEY.moderationDecision,
      ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
    ]);
    expect(queue.add.mock.calls.map((call) => call[2]?.priority)).toEqual([
      ASYNC_EMAIL_PRIORITY.authCode,
      ASYNC_EMAIL_PRIORITY.moderation,
      ASYNC_EMAIL_PRIORITY.savedSearchAlert,
    ]);
  });

  it("não duplica job no Redis quando o mesmo jobId já existe", async () => {
    const pool = await createTestPool();

    const outbox = await enqueueAsyncEmail(pool, {
      kind: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      toEmail: "rachel@example.com",
      payload: createSavedSearchPayload(),
      availableAt: new Date("2026-04-22T12:00:00.000Z"),
      now: new Date("2026-04-22T12:00:00.000Z"),
    });

    const queue = {
      getJob: vi.fn().mockResolvedValue({ id: String(outbox.id) }),
      add: vi.fn(),
    };

    const summary = await relayPendingEmailOutboxJobs({
      pool,
      queue,
      now: new Date("2026-04-22T12:01:00.000Z"),
    });

    expect(summary).toEqual({
      scanned: 1,
      queued: 0,
      existing: 1,
    });
    expect(queue.getJob).toHaveBeenCalledWith(String(outbox.id));
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe("queueAndDeliverAsyncEmail", () => {
  it("enfileira e drena inline um e-mail de auth usando o template genérico", async () => {
    const pool = await createTestPool();
    const sendAuthCodeEmail = vi.fn().mockResolvedValue({ messageId: "smtp-auth-1" });
    const senderRegistry = createAsyncEmailSenderRegistry({
      sendAuthCodeEmail,
    });

    const result = await queueAndDeliverAsyncEmail({
      pool,
      senderRegistry,
      kind: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      toEmail: "ada@example.com",
      payload: createAuthPayload(),
      priority: ASYNC_EMAIL_PRIORITY.authCode,
      sourceType: ASYNC_EMAIL_SOURCE_TYPE.authCodeChallenge,
      sourceId: 42,
      now: new Date("2026-04-22T12:00:00.000Z"),
    });

    expect(sendAuthCodeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        purpose: "login",
      }),
    );
    expect(result).toMatchObject({
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      providerMessageId: "smtp-auth-1",
    });

    const persisted = await loadEmailOutboxById(pool, result.outbox.id);

    expect(persisted).toMatchObject({
      status: "sent",
      priority: ASYNC_EMAIL_PRIORITY.authCode,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      sourceType: ASYNC_EMAIL_SOURCE_TYPE.authCodeChallenge,
      sourceId: 42,
      providerMessageId: "smtp-auth-1",
    });
  });
});

describe("processAsyncEmailOutboxJob", () => {
  it("envia o e-mail e marca o outbox como sent com provider_message_id", async () => {
    const pool = await createTestPool();

    const outbox = await enqueueAsyncEmail(pool, {
      kind: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      toEmail: "rachel@example.com",
      payload: createSavedSearchPayload(),
      availableAt: new Date("2026-04-22T12:00:00.000Z"),
      now: new Date("2026-04-22T12:00:00.000Z"),
    });

    const sendSavedSearchAlertEmail = vi.fn().mockResolvedValue({ messageId: "smtp-42" });
    const senderRegistry = createAsyncEmailSenderRegistry({
      sendSavedSearchAlertEmail,
    });

    const result = await processAsyncEmailOutboxJob({
      pool,
      outboxId: outbox.id,
      senderRegistry,
      maxAttempts: 3,
      retryBaseDelayMs: 60_000,
      now: new Date("2026-04-22T12:05:00.000Z"),
    });

    expect(result).toEqual({
      outcome: "sent",
      outboxId: outbox.id,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      providerMessageId: "smtp-42",
    });
    expect(sendSavedSearchAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "rachel@example.com",
        searchName: "React remoto",
      }),
    );

    const persisted = await loadEmailOutboxById(pool, outbox.id);

    expect(persisted).toMatchObject({
      status: "sent",
      providerMessageId: "smtp-42",
      attemptCount: 0,
    });
    expect(persisted?.sentAt).toBeTruthy();
  });

  it("reagenda em falha transitória e marca dead ao atingir o limite de tentativas", async () => {
    const pool = await createTestPool();

    const outbox = await enqueueAsyncEmail(pool, {
      kind: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      toEmail: "rachel@example.com",
      payload: createSavedSearchPayload(),
      availableAt: new Date("2026-04-22T12:00:00.000Z"),
      now: new Date("2026-04-22T12:00:00.000Z"),
    });

    const senderRegistry = createAsyncEmailSenderRegistry({
      sendSavedSearchAlertEmail: vi.fn().mockRejectedValue(new Error("smtp unavailable")),
    });
    const firstAttemptAt = new Date("2026-04-22T12:05:00.000Z");

    const firstResult = await processAsyncEmailOutboxJob({
      pool,
      outboxId: outbox.id,
      senderRegistry,
      maxAttempts: 2,
      retryBaseDelayMs: 60_000,
      now: firstAttemptAt,
    });

    expect(firstResult).toMatchObject({
      outcome: "retried",
      outboxId: outbox.id,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      attemptCount: 1,
      error: "smtp unavailable",
    });

    const afterFirstAttempt = await loadEmailOutboxById(pool, outbox.id);

    expect(afterFirstAttempt).toMatchObject({
      status: "pending",
      attemptCount: 1,
      lastError: "smtp unavailable",
    });
    expect(afterFirstAttempt?.availableAt).toBe(new Date(firstAttemptAt.getTime() + 60_000).toISOString());

    const secondResult = await processAsyncEmailOutboxJob({
      pool,
      outboxId: outbox.id,
      senderRegistry,
      maxAttempts: 2,
      retryBaseDelayMs: 60_000,
      now: new Date("2026-04-22T12:06:00.000Z"),
    });

    expect(secondResult).toMatchObject({
      outcome: "dead",
      outboxId: outbox.id,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
      attemptCount: 2,
      error: "smtp unavailable",
    });

    const afterSecondAttempt = await loadEmailOutboxById(pool, outbox.id);

    expect(afterSecondAttempt).toMatchObject({
      status: "dead",
      attemptCount: 2,
      lastError: "smtp unavailable",
    });
  });
});
