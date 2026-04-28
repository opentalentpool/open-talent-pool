import fs from "fs";
import { Queue, Worker } from "bullmq";

export const ASYNC_EMAIL_QUEUE_NAME = "async-email-outbox";
export const ASYNC_EMAIL_TEMPLATE_KEY = {
  authCode: "auth_code",
  moderationReportReceipt: "moderation_report_receipt",
  moderationDecision: "moderation_decision",
  savedSearchAlert: "saved_search_alert",
  profileFreshness: "profile_freshness",
};
export const ASYNC_EMAIL_SOURCE_TYPE = {
  authCodeChallenge: "auth_code_challenge",
  profileContactEmailChallenge: "profile_contact_email_challenge",
  moderationReport: "moderation_report",
  savedSearchAlertBatch: "saved_search_alert_batch",
  profileFreshnessNotification: "profile_freshness_notification",
};
export const ASYNC_EMAIL_PRIORITY = {
  authCode: 1000,
  moderation: 500,
  profileExpiry: 100,
  savedSearchAlert: 50,
  profileFreshness: 30,
};

function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function mapEmailOutboxRow(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    templateKey: row.template_key,
    toEmail: row.to_email,
    payload: row.payload_json || {},
    priority: Number(row.priority || 0),
    dedupeKey: row.dedupe_key || null,
    status: row.status,
    availableAt: toIsoOrNull(row.available_at),
    attemptCount: Number(row.attempt_count || 0),
    lastError: row.last_error || null,
    providerMessageId: row.provider_message_id || null,
    sourceType: row.source_type || null,
    sourceId: Number.isInteger(row.source_id) ? Number(row.source_id) : row.source_id ? Number(row.source_id) : null,
    createdAt: toIsoOrNull(row.created_at),
    updatedAt: toIsoOrNull(row.updated_at),
    sentAt: toIsoOrNull(row.sent_at),
  };
}

function describeAsyncEmailError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function computeRetryDelayMs(baseDelayMs, attemptCount) {
  const safeAttemptCount = Math.max(1, attemptCount);
  return baseDelayMs * (2 ** (safeAttemptCount - 1));
}

function createDeliveryBucket() {
  return {
    processed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    noop: 0,
  };
}

function createDeliverySummary() {
  return {
    processed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    noop: 0,
    byTemplate: {},
  };
}

function recordDeliveryOutcome(summary, templateKey, outcome) {
  const bucket = summary.byTemplate[templateKey] || createDeliveryBucket();

  bucket.processed += 1;
  bucket[outcome] += 1;
  summary.byTemplate[templateKey] = bucket;
  summary.processed += 1;
  summary[outcome] += 1;
}

function isPermanentAsyncEmailError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.startsWith("Unsupported async email template")
    || error.message.startsWith("Missing sender for async email template")
  );
}

function getAsyncEmailSender(senderRegistry, templateKey) {
  const sender = senderRegistry?.[templateKey];

  if (!sender) {
    throw new Error(`Missing sender for async email template: ${templateKey}`);
  }

  return sender;
}

async function markEmailOutboxSent(executor, { outboxId, providerMessageId = null, now = new Date() }) {
  await executor.query(
    `
      UPDATE email_outbox
      SET status = 'sent',
          provider_message_id = $2,
          sent_at = $3,
          last_error = NULL,
          updated_at = $3
      WHERE id = $1
    `,
    [outboxId, providerMessageId, now],
  );
}

async function rescheduleEmailOutbox(executor, {
  outboxId,
  attemptCount,
  lastError,
  availableAt,
  now = new Date(),
}) {
  await executor.query(
    `
      UPDATE email_outbox
      SET status = 'pending',
          attempt_count = $2,
          last_error = $3,
          available_at = $4,
          updated_at = $5
      WHERE id = $1
    `,
    [outboxId, attemptCount, lastError, availableAt, now],
  );
}

async function markEmailOutboxDead(executor, {
  outboxId,
  attemptCount,
  lastError,
  now = new Date(),
}) {
  await executor.query(
    `
      UPDATE email_outbox
      SET status = 'dead',
          attempt_count = $2,
          last_error = $3,
          updated_at = $4
      WHERE id = $1
    `,
    [outboxId, attemptCount, lastError, now],
  );
}

async function markSavedSearchAlertBatchSent(executor, { batchId, now = new Date() }) {
  const batchResult = await executor.query(
    `
      UPDATE saved_search_alert_batches
      SET status = 'sent',
          sent_at = $2,
          last_error = NULL,
          updated_at = $2
      WHERE id = $1
      RETURNING saved_search_id
    `,
    [batchId, now],
  );

  const savedSearchId = batchResult.rows[0]?.saved_search_id ? Number(batchResult.rows[0].saved_search_id) : null;

  if (!savedSearchId) {
    return;
  }

  await executor.query(
    `
      INSERT INTO saved_search_notified_profiles (saved_search_id, professional_user_id, first_notified_at)
      SELECT $2::int, item.professional_user_id, $3::timestamptz
      FROM saved_search_alert_batch_items item
      INNER JOIN users professional ON professional.id = item.professional_user_id
      WHERE item.batch_id = $1::int
      ON CONFLICT (saved_search_id, professional_user_id) DO NOTHING
    `,
    [batchId, savedSearchId, now],
  );

  await executor.query(
    `
      UPDATE saved_searches
      SET last_alert_sent_at = $1,
          updated_at = NOW()
      WHERE id = $2::int
    `,
    [now, savedSearchId],
  );
}

async function markSavedSearchAlertBatchFailure(executor, {
  batchId,
  status,
  lastError,
  now = new Date(),
}) {
  await executor.query(
    `
      UPDATE saved_search_alert_batches
      SET status = $2,
          last_error = $3,
          updated_at = $4
      WHERE id = $1
    `,
    [batchId, status, lastError, now],
  );
}

async function markProfileFreshnessNotificationSent(executor, { notificationId, now = new Date() }) {
  await executor.query(
    `
      UPDATE user_profile_freshness_notifications
      SET status = 'sent',
          sent_at = $2,
          last_error = NULL,
          updated_at = $2
      WHERE id = $1
    `,
    [notificationId, now],
  );
}

async function markProfileFreshnessNotificationFailure(executor, {
  notificationId,
  status,
  lastError,
  now = new Date(),
}) {
  await executor.query(
    `
      UPDATE user_profile_freshness_notifications
      SET status = $2,
          last_error = $3,
          updated_at = $4
      WHERE id = $1
    `,
    [notificationId, status, lastError, now],
  );
}

async function markAsyncEmailSourceSent(executor, outbox, now) {
  if (!outbox.sourceType || !outbox.sourceId) {
    return;
  }

  if (outbox.sourceType === ASYNC_EMAIL_SOURCE_TYPE.savedSearchAlertBatch) {
    await markSavedSearchAlertBatchSent(executor, {
      batchId: outbox.sourceId,
      now,
    });
    return;
  }

  if (outbox.sourceType === ASYNC_EMAIL_SOURCE_TYPE.profileFreshnessNotification) {
    await markProfileFreshnessNotificationSent(executor, {
      notificationId: outbox.sourceId,
      now,
    });
  }
}

async function markAsyncEmailSourceFailure(executor, outbox, {
  status,
  lastError,
  now = new Date(),
}) {
  if (!outbox.sourceType || !outbox.sourceId) {
    return;
  }

  if (outbox.sourceType === ASYNC_EMAIL_SOURCE_TYPE.savedSearchAlertBatch) {
    await markSavedSearchAlertBatchFailure(executor, {
      batchId: outbox.sourceId,
      status,
      lastError,
      now,
    });
    return;
  }

  if (outbox.sourceType === ASYNC_EMAIL_SOURCE_TYPE.profileFreshnessNotification) {
    await markProfileFreshnessNotificationFailure(executor, {
      notificationId: outbox.sourceId,
      status,
      lastError,
      now,
    });
  }
}

async function sendAsyncEmailFromOutbox(outbox, senderRegistry) {
  const sender = getAsyncEmailSender(senderRegistry, outbox.templateKey);
  return await sender(outbox.payload);
}

function writeWorkerHealthFile(healthFilePath, payload) {
  if (!healthFilePath) {
    return;
  }

  fs.writeFileSync(healthFilePath, JSON.stringify(payload, null, 2));
}

export function createAsyncEmailSenderRegistry({
  sendAuthCodeEmail = null,
  sendModerationReportReceiptEmail = null,
  sendModerationDecisionEmail = null,
  sendSavedSearchAlertEmail = null,
  sendProfileFreshnessEmail = null,
} = {}) {
  return {
    [ASYNC_EMAIL_TEMPLATE_KEY.authCode]: sendAuthCodeEmail,
    [ASYNC_EMAIL_TEMPLATE_KEY.moderationReportReceipt]: sendModerationReportReceiptEmail,
    [ASYNC_EMAIL_TEMPLATE_KEY.moderationDecision]: sendModerationDecisionEmail,
    [ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert]: sendSavedSearchAlertEmail,
    [ASYNC_EMAIL_TEMPLATE_KEY.profileFreshness]: sendProfileFreshnessEmail,
  };
}

export function createAsyncEmailQueue({ connection, prefix }) {
  return new Queue(ASYNC_EMAIL_QUEUE_NAME, {
    connection,
    prefix,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
}

export async function enqueueAsyncEmail(executor, {
  kind,
  templateKey,
  toEmail,
  payload,
  priority = 0,
  dedupeKey = null,
  availableAt = new Date(),
  sourceType = null,
  sourceId = null,
  now = new Date(),
}) {
  const result = await executor.query(
    `
      INSERT INTO email_outbox (
        kind,
        template_key,
        to_email,
        payload_json,
        priority,
        dedupe_key,
        status,
        available_at,
        attempt_count,
        last_error,
        provider_message_id,
        source_type,
        source_id,
        created_at,
        updated_at,
        sent_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4::jsonb,
        $5,
        $6,
        'pending',
        $7,
        0,
        NULL,
        NULL,
        $8,
        $9,
        $10,
        $10,
        NULL
      )
      RETURNING *
    `,
    [
      kind,
      templateKey,
      toEmail,
      JSON.stringify(payload || {}),
      priority,
      dedupeKey,
      availableAt,
      sourceType,
      sourceId,
      now,
    ],
  );

  return mapEmailOutboxRow(result.rows[0]);
}

export async function loadEmailOutboxById(executor, outboxId) {
  const result = await executor.query(
    `
      SELECT *
      FROM email_outbox
      WHERE id = $1
      LIMIT 1
    `,
    [outboxId],
  );

  return result.rows.length ? mapEmailOutboxRow(result.rows[0]) : null;
}

export async function listPendingEmailOutboxRows(executor, {
  now = new Date(),
  limit = 25,
} = {}) {
  const result = await executor.query(
    `
      SELECT *
      FROM email_outbox
      WHERE status = 'pending'
        AND available_at <= $1
      ORDER BY priority DESC, created_at ASC
      LIMIT $2
    `,
    [now, limit],
  );

  return result.rows.map(mapEmailOutboxRow);
}

export async function relayPendingEmailOutboxJobs({
  pool,
  queue,
  now = new Date(),
  limit = 25,
  logger = console,
}) {
  const rows = await listPendingEmailOutboxRows(pool, { now, limit });
  const summary = {
    scanned: rows.length,
    queued: 0,
    existing: 0,
  };

  for (const row of rows) {
    const jobId = String(row.id);
    const existingJob = await queue.getJob(jobId);

    if (existingJob) {
      summary.existing += 1;
      continue;
    }

    try {
      await queue.add(
        row.templateKey,
        { outboxId: row.id },
        {
          jobId,
          priority: row.priority,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      summary.queued += 1;
    } catch (error) {
      logger.error("[MAIL_OUTBOX][relay_failed]", {
        outboxId: row.id,
        templateKey: row.templateKey,
        error: describeAsyncEmailError(error),
      });
    }
  }

  return summary;
}

export async function deliverInlineAsyncEmail(executor, outbox, {
  senderRegistry,
  now = new Date(),
}) {
  const deliveryResult = await sendAsyncEmailFromOutbox(outbox, senderRegistry);
  const providerMessageId = deliveryResult?.messageId || null;

  await markAsyncEmailSourceSent(executor, outbox, now);
  await markEmailOutboxSent(executor, {
    outboxId: outbox.id,
    providerMessageId,
    now,
  });

  return {
    outboxId: outbox.id,
    templateKey: outbox.templateKey,
    providerMessageId,
  };
}

export async function queueAndDeliverAsyncEmail({
  pool,
  executor = null,
  senderRegistry,
  kind,
  templateKey,
  toEmail,
  payload,
  priority = 0,
  dedupeKey = null,
  availableAt = new Date(),
  sourceType = null,
  sourceId = null,
  now = new Date(),
}) {
  const runWithinExecutor = async (db) => {
    const outbox = await enqueueAsyncEmail(db, {
      kind,
      templateKey,
      toEmail,
      payload,
      priority,
      dedupeKey,
      availableAt,
      sourceType,
      sourceId,
      now,
    });
    const delivery = await deliverInlineAsyncEmail(db, outbox, {
      senderRegistry,
      now,
    });

    return {
      outbox,
      ...delivery,
    };
  };

  if (executor) {
    return await runWithinExecutor(executor);
  }

  if (!pool) {
    throw new Error("queueAndDeliverAsyncEmail requires a pool when no executor is provided.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await runWithinExecutor(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function processAsyncEmailOutboxJob({
  pool,
  outboxId,
  senderRegistry,
  maxAttempts = 5,
  retryBaseDelayMs = 60_000,
  logger = console,
  now = new Date(),
}) {
  const outbox = await loadEmailOutboxById(pool, outboxId);

  if (!outbox || outbox.status !== "pending") {
    return {
      outcome: "noop",
      outboxId,
      templateKey: outbox?.templateKey || null,
    };
  }

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const delivery = await deliverInlineAsyncEmail(client, outbox, {
        senderRegistry,
        now,
      });
      await client.query("COMMIT");

      return {
        outcome: "sent",
        outboxId: outbox.id,
        templateKey: outbox.templateKey,
        providerMessageId: delivery.providerMessageId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage = describeAsyncEmailError(error);
    const attemptCount = isPermanentAsyncEmailError(error)
      ? maxAttempts
      : outbox.attemptCount + 1;
    const isDead = attemptCount >= maxAttempts;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      if (isDead) {
        await markAsyncEmailSourceFailure(client, outbox, {
          status: "dead",
          lastError: errorMessage,
          now,
        });
        await markEmailOutboxDead(client, {
          outboxId: outbox.id,
          attemptCount,
          lastError: errorMessage,
          now,
        });
      } else {
        const availableAt = new Date(now.getTime() + computeRetryDelayMs(retryBaseDelayMs, attemptCount));

        await markAsyncEmailSourceFailure(client, outbox, {
          status: "pending",
          lastError: errorMessage,
          now,
        });
        await rescheduleEmailOutbox(client, {
          outboxId: outbox.id,
          attemptCount,
          lastError: errorMessage,
          availableAt,
          now,
        });
      }

      await client.query("COMMIT");
    } catch (updateError) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw updateError;
    } finally {
      client.release();
    }

    logger.error("[MAIL_OUTBOX][delivery_failed]", {
      outboxId: outbox.id,
      templateKey: outbox.templateKey,
      status: isDead ? "dead" : "pending",
      attemptCount,
      error: errorMessage,
    });

    return {
      outcome: isDead ? "dead" : "retried",
      outboxId: outbox.id,
      templateKey: outbox.templateKey,
      error: errorMessage,
      attemptCount,
    };
  }
}

export async function runAsyncEmailDeliveryCycle({
  pool,
  senderRegistry,
  maxAttempts = 5,
  retryBaseDelayMs = 60_000,
  limit = 50,
  logger = console,
  now = new Date(),
}) {
  const rows = await listPendingEmailOutboxRows(pool, { now, limit });
  const summary = createDeliverySummary();

  for (const row of rows) {
    const result = await processAsyncEmailOutboxJob({
      pool,
      outboxId: row.id,
      senderRegistry,
      maxAttempts,
      retryBaseDelayMs,
      logger,
      now,
    });

    recordDeliveryOutcome(summary, row.templateKey, result.outcome || "noop");
  }

  return summary;
}

export async function getEmailOutboxMetrics(executor) {
  const result = await executor.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE status = 'dead')::int AS dead_count,
        MIN(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_created_at,
        MAX(updated_at) AS last_updated_at
      FROM email_outbox
    `,
  );

  const row = result.rows[0] || {};

  return {
    pendingCount: Number(row.pending_count || 0),
    deadCount: Number(row.dead_count || 0),
    oldestPendingCreatedAt: toIsoOrNull(row.oldest_pending_created_at),
    lastUpdatedAt: toIsoOrNull(row.last_updated_at),
  };
}

export async function runMailWorker({
  pool,
  queue,
  queueConnection = null,
  workerConnection,
  mailQueuePrefix,
  senderRegistry,
  concurrency = 4,
  pollIntervalMs = 5_000,
  batchSize = 25,
  maxAttempts = 5,
  retryBaseDelayMs = 60_000,
  healthFilePath = "/tmp/mail-worker-health.json",
  logger = console,
}) {
  let relayInFlight = false;

  const writeHealth = async () => {
    const metrics = await getEmailOutboxMetrics(pool);

    writeWorkerHealthFile(healthFilePath, {
      checkedAt: new Date().toISOString(),
      metrics,
    });
  };

  const relayPending = async () => {
    if (relayInFlight) {
      return null;
    }

    relayInFlight = true;

    try {
      const summary = await relayPendingEmailOutboxJobs({
        pool,
        queue,
        limit: batchSize,
        logger,
      });

      await writeHealth();
      return summary;
    } finally {
      relayInFlight = false;
    }
  };

  const worker = new Worker(
    ASYNC_EMAIL_QUEUE_NAME,
    async (job) => {
      const result = await processAsyncEmailOutboxJob({
        pool,
        outboxId: Number(job.data?.outboxId),
        senderRegistry,
        maxAttempts,
        retryBaseDelayMs,
        logger,
      });

      await writeHealth();
      return result;
    },
    {
      connection: workerConnection,
      concurrency,
      prefix: mailQueuePrefix,
    },
  );

  worker.on("error", (error) => {
    logger.error("[MAIL_WORKER][worker_error]", error);
  });

  const intervalId = setInterval(() => {
    void relayPending().catch((error) => {
      logger.error("[MAIL_WORKER][relay_error]", error);
    });
  }, pollIntervalMs);

  await relayPending();

  return {
    worker,
    async shutdown() {
      clearInterval(intervalId);
      await worker.close();
      await queue.close();
      if (queueConnection) {
        await queueConnection.quit();
      }
      await workerConnection.quit();
    },
  };
}
