import dotenv from "dotenv";
import fs from "fs";
import IORedis from "ioredis";
import nodemailer from "nodemailer";
import path from "path";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import {
  ASYNC_EMAIL_PRIORITY,
  ASYNC_EMAIL_SOURCE_TYPE,
  ASYNC_EMAIL_TEMPLATE_KEY,
  createAsyncEmailSenderRegistry,
  queueAndDeliverAsyncEmail,
} from "./async-email.js";
import {
  buildCodeEmail,
  buildModerationDecisionEmail,
  buildModerationReportReceiptEmail,
  buildProfileFreshnessEmail,
  buildSavedSearchAlertEmail,
} from "./email-templates.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(currentDir, "db", "schema.sql");

export function getEnvironmentFiles() {
  return [
    path.join(currentDir, ".env.local"),
    path.join(currentDir, "..", ".env.local"),
    path.join(currentDir, ".env"),
    path.join(currentDir, "..", ".env"),
  ];
}

export function loadEnvironment({ files = getEnvironmentFiles() } = {}) {
  for (const envFile of files) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: false });
    }
  }
}

function isProductionLike(env) {
  return String(env.NODE_ENV || "development").toLowerCase() === "production";
}

function splitCsvInput(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPlaceholderSecret(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [
    "change_me",
    "change_this_in_production",
    "change_this_secret",
    "dev-only-auth-pepper",
    "replace_me",
    "example",
  ].includes(normalized);
}

function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function resolveRedisEnv(env = process.env) {
  const redisUrl = String(env.REDIS_URL || "").trim();

  if (redisUrl) {
    const parsed = new URL(redisUrl);

    return {
      redisUrl,
      redisHost: parsed.hostname || "",
      redisPort: parsed.port ? Number(parsed.port) : 6379,
      redisUsername: decodeURIComponent(parsed.username || ""),
      redisPassword: decodeURIComponent(parsed.password || ""),
    };
  }

  return {
    redisUrl: "",
    redisHost: env.REDIS_HOST || "localhost",
    redisPort: Number(env.REDIS_PORT || 6379),
    redisUsername: env.REDIS_USERNAME || "",
    redisPassword: env.REDIS_PASSWORD || "",
  };
}

function assertSecureRuntimeConfig(config) {
  if (config.enableTestRoutes && config.nodeEnv !== "test") {
    throw new Error("ENABLE_TEST_ROUTES is only allowed when NODE_ENV=test.");
  }

  if (!config.isProduction) {
    return;
  }

  if (isPlaceholderSecret(config.postgresPassword)) {
    throw new Error("POSTGRES_PASSWORD must be configured with a non-placeholder value in production.");
  }

  if (isPlaceholderSecret(config.authCodePepper)) {
    throw new Error("AUTH_CODE_PEPPER must be configured with a non-placeholder value in production.");
  }

  if (isPlaceholderSecret(config.turnstileSecretKey)) {
    throw new Error("TURNSTILE_SECRET_KEY must be configured with a real secret in production.");
  }

  if (!config.redisUsername || config.redisUsername === "default") {
    throw new Error("REDIS_USERNAME must be configured with a dedicated ACL user in production.");
  }

  if (isPlaceholderSecret(config.redisPassword)) {
    throw new Error("REDIS_PASSWORD must be configured with a non-placeholder value in production.");
  }

  if (!config.mailQueuePrefix) {
    throw new Error("MAIL_QUEUE_PREFIX must be configured in production.");
  }

  if (config.debug) {
    throw new Error("DEBUG logging must be disabled in production.");
  }
}

export function getRuntimeConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "development").toLowerCase();
  const isProduction = isProductionLike(env);
  const trustedOrigins = splitCsvInput(env.TRUSTED_ORIGINS);
  const authSessionIdleHours = Number(env.AUTH_SESSION_IDLE_HOURS || 24);
  const authSessionMaxDays = Number(env.AUTH_SESSION_MAX_DAYS || 7);
  const redis = resolveRedisEnv(env);

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT || 4000),
    postgresHost: env.POSTGRES_HOST || "localhost",
    postgresPort: Number(env.POSTGRES_PORT || 5432),
    postgresDb: env.POSTGRES_DB || "otp",
    postgresUser: env.POSTGRES_USER || "otp",
    postgresPassword: env.POSTGRES_PASSWORD || "change_me",
    authCodePepper: env.AUTH_CODE_PEPPER || "dev-only-auth-pepper",
    smtpServer: env.SMTP_SERVER,
    smtpPort: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    smtpSecure: parseBooleanEnv(env.SMTP_SECURE, false),
    smtpFrom: env.SMTP_FROM,
    appBaseUrl: env.APP_BASE_URL || "http://localhost:8080",
    redisUrl: redis.redisUrl,
    redisHost: redis.redisHost,
    redisPort: redis.redisPort,
    redisUsername: redis.redisUsername,
    redisPassword: redis.redisPassword,
    mailQueuePrefix: env.MAIL_QUEUE_PREFIX || "otp:mail",
    mailWorkerConcurrency: Number(env.MAIL_WORKER_CONCURRENCY || 4),
    mailOutboxPollIntervalMs: Number(env.MAIL_OUTBOX_POLL_INTERVAL_MS || 5000),
    mailOutboxBatchSize: Number(env.MAIL_OUTBOX_BATCH_SIZE || 25),
    mailRetryMaxAttempts: Number(env.MAIL_RETRY_MAX_ATTEMPTS || 5),
    mailRetryBaseDelayMs: Number(env.MAIL_RETRY_BASE_DELAY_MS || 60000),
    trustedOrigins,
    cookieDomain: env.COOKIE_DOMAIN || "",
    cookieSecure: parseBooleanEnv(env.COOKIE_SECURE, isProduction),
    authSessionIdleMs: authSessionIdleHours * 60 * 60 * 1000,
    authSessionMaxMs: authSessionMaxDays * 24 * 60 * 60 * 1000,
    alertsDispatchIntervalSeconds: Number(env.ALERTS_DISPATCH_INTERVAL_SECONDS || 900),
    turnstileSecretKey:
      env.TURNSTILE_SECRET_KEY ||
      (isProduction ? "" : "1x0000000000000000000000000000000AA"),
    trustProxy: parseBooleanEnv(env.TRUST_PROXY, false),
    inMemoryDb: parseBooleanEnv(env.OTP_IN_MEMORY_DB, false),
    enableTestRoutes: parseBooleanEnv(env.ENABLE_TEST_ROUTES, false),
    debug:
      parseBooleanEnv(env.DEBUG, false) ||
      String(env.LOG_LEVEL || "").toLowerCase() === "debug",
  };
}

export async function createPool(config) {
  if (config.inMemoryDb) {
    const { newDb } = await import("pg-mem");
    const database = newDb({ autoCreateForeignKeyIndices: true });
    const { Pool: InMemoryPool } = database.adapters.createPg();

    return new InMemoryPool();
  }

  return new Pool({
    host: config.postgresHost,
    port: config.postgresPort,
    database: config.postgresDb,
    user: config.postgresUser,
    password: config.postgresPassword,
  });
}

export function enablePoolDebugLogging(pool, logger = console) {
  const originalQuery = pool.query.bind(pool);

  pool.query = async (...args) => {
    try {
      const sql = args[0];
      const params = args[1];
      logger.log("[SQL QUERY]", typeof sql === "string" ? sql.trim().replace(/\s+/g, " ") : sql, params || []);
    } catch {
      logger.log("[SQL QUERY]", "(failed to serialize query)");
    }

    return originalQuery(...args);
  };

  return pool;
}

export async function ensureSchema(pool) {
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schemaSql);
}

export function createRedisConnection(config, options = {}) {
  const connectionOptions = {
    username: config.redisUsername || undefined,
    password: config.redisPassword || undefined,
    maxRetriesPerRequest: null,
    ...options,
  };

  if (config.redisUrl) {
    return new IORedis(config.redisUrl, connectionOptions);
  }

  return new IORedis({
    host: config.redisHost,
    port: config.redisPort,
    ...connectionOptions,
  });
}

function createEmailRecorder() {
  const sentEmails = [];

  return {
    capture(email) {
      sentEmails.push({
        ...email,
        sentAt: new Date().toISOString(),
      });
    },
    list({ to, subjectIncludes } = {}) {
      return sentEmails.filter((email) => {
        if (to && email.to !== to) return false;
        if (subjectIncludes && !email.subject.includes(subjectIncludes)) return false;
        return true;
      });
    },
    clear() {
      sentEmails.length = 0;
    },
  };
}

export class EmailDeliveryError extends Error {
  constructor(message = "email_delivery_failed") {
    super(message);
    this.name = "EmailDeliveryError";
    this.code = "email_delivery_failed";
  }
}

function createEmailClient(config, logger = console, recorder = createEmailRecorder()) {
  const transporter =
    !config.enableTestRoutes && config.smtpServer && config.smtpPort && config.smtpUser && config.smtpPass
      ? nodemailer.createTransport({
          host: config.smtpServer,
          port: config.smtpPort,
          secure: config.smtpSecure,
          auth: { user: config.smtpUser, pass: config.smtpPass },
        })
      : null;

  if (transporter) {
    void transporter
      .verify()
      .then(() => {
        logger.log(`[SMTP] Ready on ${config.smtpServer}:${config.smtpPort} (secure=${config.smtpSecure})`);
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        logger.error(
          `[SMTP] Invalid configuration for ${config.smtpServer}:${config.smtpPort} (secure=${config.smtpSecure}). Emails will fail until this is fixed. ${detail}`,
        );
      });
  }

  const sendMail = async ({ to, subject, text, html, metadata = {} }) => {
    if (config.enableTestRoutes) {
      const messageId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      recorder.capture({
        to,
        subject,
        text,
        html,
        metadata,
        messageId,
      });

      if (!transporter) {
        return { messageId };
      }
    }

    if (!transporter) {
      logger.warn(`[SMTP] Email not configured for ${to}.`);
      throw new EmailDeliveryError();
    }

    try {
      return await transporter.sendMail({
        from: config.smtpFrom || config.smtpUser,
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      logger.error("Failed to send email:", error);
      throw new EmailDeliveryError();
    }
  };

  return {
    sendMail,
    recorder,
  };
}

export function createCodeEmailSender(config, emailClient = createEmailClient(config)) {
  return async (email, code, purpose = "verification", context = {}) => {
    const effectiveAppBaseUrl = context.appBaseUrl || config.appBaseUrl;
    const { subject, text, html } = buildCodeEmail({
      appBaseUrl: effectiveAppBaseUrl,
      code,
      purpose,
    });

    return await emailClient.sendMail({
      to: email,
      subject,
      text,
      html,
      metadata: {
        kind: "auth-code",
        purpose,
        code,
        challengeId: context.challengeId || null,
      },
    });
  };
}

export function createDirectAsyncEmailSenderRegistry(config, emailClient = createEmailClient(config)) {
  const sendCodeEmail = createCodeEmailSender(config, emailClient);
  const sendSavedSearchAlertEmail = createSavedSearchAlertEmailSender(config, emailClient);
  const sendModerationReportReceiptEmail = createModerationReportReceiptEmailSender(config, emailClient);
  const sendModerationDecisionEmail = createModerationDecisionEmailSender(config, emailClient);
  const sendProfileFreshnessEmail = createProfileFreshnessEmailSender(config, emailClient);

  return {
    senderRegistry: createAsyncEmailSenderRegistry({
      sendAuthCodeEmail: async (payload) => await sendCodeEmail(payload.to, payload.code, payload.purpose || "verification", {
        challengeId: payload.challengeId || null,
        appBaseUrl: payload.appBaseUrl || config.appBaseUrl,
      }),
      sendModerationReportReceiptEmail,
      sendModerationDecisionEmail,
      sendSavedSearchAlertEmail,
      sendProfileFreshnessEmail,
    }),
    directSenders: {
      sendCodeEmail,
      sendSavedSearchAlertEmail,
      sendModerationReportReceiptEmail,
      sendModerationDecisionEmail,
      sendProfileFreshnessEmail,
    },
  };
}

function toPositiveIntegerOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function createQueuedCodeEmailSender({
  pool,
  config,
  senderRegistry,
}) {
  return async (email, code, purpose = "verification", context = {}) => {
    const effectiveAppBaseUrl = context.appBaseUrl || config.appBaseUrl;
    const sourceType = context.sourceType
      || (purpose === "profile_contact_email"
        ? ASYNC_EMAIL_SOURCE_TYPE.profileContactEmailChallenge
        : ASYNC_EMAIL_SOURCE_TYPE.authCodeChallenge);
    const sourceId = toPositiveIntegerOrNull(context.sourceId);
    const result = await queueAndDeliverAsyncEmail({
      pool,
      executor: context.executor || null,
      senderRegistry,
      kind: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.authCode,
      toEmail: email,
      payload: {
        to: email,
        code,
        purpose,
        challengeId: context.challengeId || null,
        appBaseUrl: effectiveAppBaseUrl,
      },
      priority: context.priority ?? ASYNC_EMAIL_PRIORITY.authCode,
      availableAt: context.availableAt || new Date(),
      sourceType,
      sourceId,
      now: context.now || new Date(),
    });

    return {
      messageId: result.providerMessageId,
      outboxId: result.outbox.id,
    };
  };
}

export function createSavedSearchAlertEmailSender(config, emailClient = createEmailClient(config)) {
  return async ({ to, recruiterName, searchName, savedSearchId = null, criteria, matches, appBaseUrl = config.appBaseUrl }) => {
    const { subject, text, html } = buildSavedSearchAlertEmail({
      to,
      recruiterName,
      searchName,
      savedSearchId,
      criteria,
      matches,
      appBaseUrl,
    });

    return await emailClient.sendMail({
      to,
      subject,
      text,
      html,
      metadata: {
        kind: "saved-search-alert",
        searchName,
        matchCount: matches.length,
      },
    });
  };
}

export function createModerationReportReceiptEmailSender(config, emailClient = createEmailClient(config)) {
  return async ({ to, reporterName, reportId, targetKind, category, appBaseUrl = config.appBaseUrl }) => {
    const { subject, text, html } = buildModerationReportReceiptEmail({
      to,
      reporterName,
      reportId,
      targetKind,
      category,
      appBaseUrl,
    });

    return await emailClient.sendMail({
      to,
      subject,
      text,
      html,
      metadata: {
        kind: "moderation-report-receipt",
        reportId,
        targetKind,
        category,
      },
    });
  };
}

export function createQueuedModerationReportReceiptEmailSender({
  pool,
  config,
  senderRegistry,
}) {
  return async ({
    executor = null,
    priority = ASYNC_EMAIL_PRIORITY.moderation,
    now = new Date(),
    availableAt = now,
    sourceType = ASYNC_EMAIL_SOURCE_TYPE.moderationReport,
    sourceId = null,
    ...payload
  }) => {
    const effectiveSourceId = toPositiveIntegerOrNull(sourceId) || toPositiveIntegerOrNull(payload.reportId);
    const effectiveAppBaseUrl = payload.appBaseUrl || config.appBaseUrl;
    const result = await queueAndDeliverAsyncEmail({
      pool,
      executor,
      senderRegistry,
      kind: ASYNC_EMAIL_TEMPLATE_KEY.moderationReportReceipt,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.moderationReportReceipt,
      toEmail: payload.to,
      payload: {
        ...payload,
        appBaseUrl: effectiveAppBaseUrl,
      },
      priority,
      availableAt,
      sourceType,
      sourceId: effectiveSourceId,
      now,
    });

    return {
      messageId: result.providerMessageId,
      outboxId: result.outbox.id,
    };
  };
}

export function createModerationDecisionEmailSender(config, emailClient = createEmailClient(config)) {
  return async ({
    to,
    targetName,
    targetKind,
    category = null,
    actionType,
    strikeCount = null,
    isImmediatePermanentBan = false,
    appBaseUrl = config.appBaseUrl,
  }) => {
    const { subject, text, html } = buildModerationDecisionEmail({
      to,
      targetName,
      targetKind,
      category,
      actionType,
      strikeCount,
      isImmediatePermanentBan,
      appBaseUrl,
    });

    return await emailClient.sendMail({
      to,
      subject,
      text,
      html,
      metadata: {
        kind: "moderation-decision",
        actionType,
        targetKind,
        category,
        strikeCount,
        isImmediatePermanentBan,
      },
    });
  };
}

export function createQueuedModerationDecisionEmailSender({
  pool,
  config,
  senderRegistry,
}) {
  return async ({
    executor = null,
    priority = ASYNC_EMAIL_PRIORITY.moderation,
    now = new Date(),
    availableAt = now,
    sourceType = ASYNC_EMAIL_SOURCE_TYPE.moderationReport,
    sourceId = null,
    ...payload
  }) => {
    const effectiveSourceId = toPositiveIntegerOrNull(sourceId) || toPositiveIntegerOrNull(payload.reportId);
    const effectiveAppBaseUrl = payload.appBaseUrl || config.appBaseUrl;
    const normalizedPayload = {
      ...payload,
      appBaseUrl: effectiveAppBaseUrl,
    };
    delete normalizedPayload.reportId;

    const result = await queueAndDeliverAsyncEmail({
      pool,
      executor,
      senderRegistry,
      kind: ASYNC_EMAIL_TEMPLATE_KEY.moderationDecision,
      templateKey: ASYNC_EMAIL_TEMPLATE_KEY.moderationDecision,
      toEmail: payload.to,
      payload: normalizedPayload,
      priority,
      availableAt,
      sourceType,
      sourceId: effectiveSourceId,
      now,
    });

    return {
      messageId: result.providerMessageId,
      outboxId: result.outbox.id,
    };
  };
}

export function createProfileFreshnessEmailSender(config, emailClient = createEmailClient(config)) {
  return async ({
    to,
    professionalName,
    publicSlug = "",
    stageDays,
    lastUpdatedAt,
    staleAfterAt,
    appBaseUrl = config.appBaseUrl,
  }) => {
    const { subject, text, html } = buildProfileFreshnessEmail({
      to,
      professionalName,
      publicSlug,
      stageDays,
      lastUpdatedAt,
      staleAfterAt,
      appBaseUrl,
    });

    return await emailClient.sendMail({
      to,
      subject,
      text,
      html,
      metadata: {
        kind: "profile-freshness",
        stageDays,
        publicSlug,
      },
    });
  };
}

export async function createServerRuntime({ env = process.env, logger = console } = {}) {
  loadEnvironment();

  const config = getRuntimeConfig(env);
  assertSecureRuntimeConfig(config);
  const pool = await createPool(config);
  const emailClient = createEmailClient(config, logger);

  if (config.debug) {
    enablePoolDebugLogging(pool, logger);
  }

  await ensureSchema(pool);

  const { senderRegistry, directSenders } = createDirectAsyncEmailSenderRegistry(config, emailClient);

  return {
    config,
    pool,
    emailClient,
    asyncEmailSenderRegistry: senderRegistry,
    sendCodeEmail: createQueuedCodeEmailSender({
      pool,
      config,
      senderRegistry,
    }),
    sendSavedSearchAlertEmail: directSenders.sendSavedSearchAlertEmail,
    sendModerationReportReceiptEmail: createQueuedModerationReportReceiptEmailSender({
      pool,
      config,
      senderRegistry,
    }),
    sendModerationDecisionEmail: createQueuedModerationDecisionEmailSender({
      pool,
      config,
      senderRegistry,
    }),
    sendProfileFreshnessEmail: directSenders.sendProfileFreshnessEmail,
    testState: {
      emails: emailClient.recorder,
    },
  };
}
