import {
  ASYNC_EMAIL_PRIORITY,
  ASYNC_EMAIL_SOURCE_TYPE,
  ASYNC_EMAIL_TEMPLATE_KEY,
  enqueueAsyncEmail,
} from "./async-email.js";
import { normalizeSavedSearchCriteria, searchAffirmativeProfiles, searchPublishedProfiles } from "./profiles.js";
import { hasAffirmativeFilters } from "../src/lib/affirmative-config.js";
import {
  addDays,
  getDaysSince,
  PROFILE_FRESHNESS_EXPIRY_DAYS,
  PROFILE_FRESHNESS_REMINDER_DAYS,
} from "./profile-freshness.js";

const ALERT_INTERVAL_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 14 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const SAVED_SEARCH_ALERT_PRIORITY = ASYNC_EMAIL_PRIORITY.savedSearchAlert;
const PROFILE_FRESHNESS_PRIORITY = ASYNC_EMAIL_PRIORITY.profileFreshness;
const PROFILE_EXPIRY_PRIORITY = ASYNC_EMAIL_PRIORITY.profileExpiry;

function buildIntInClause(columnSql, values, startIndex) {
  const placeholders = values.map((_, index) => `$${startIndex + index}`).join(", ");

  return {
    clause: `${columnSql} IN (${placeholders})`,
    params: values,
  };
}

function shouldSkipAlert(lastAlertSentAt, alertFrequency, now) {
  if (alertFrequency === "disabled") {
    return true;
  }

  if (!lastAlertSentAt) {
    return false;
  }

  return now.getTime() - new Date(lastAlertSentAt).getTime() < ALERT_INTERVAL_MS[alertFrequency];
}

async function getAlreadyNotifiedIds(pool, savedSearchId, professionalIds) {
  if (!professionalIds.length) {
    return new Set();
  }

  const professionalIdFilter = buildIntInClause("professional_user_id", professionalIds, 2);

  const result = await pool.query(
    `
      SELECT professional_user_id
      FROM saved_search_notified_profiles
      WHERE saved_search_id = $1
        AND ${professionalIdFilter.clause}
    `,
    [savedSearchId, ...professionalIdFilter.params],
  );

  return new Set(result.rows.map((row) => Number(row.professional_user_id)));
}

async function getBufferedAlertProfileIds(pool, savedSearchId, professionalIds) {
  if (!professionalIds.length) {
    return new Set();
  }

  const professionalIdFilter = buildIntInClause("item.professional_user_id", professionalIds, 2);

  const result = await pool.query(
    `
      SELECT item.professional_user_id
      FROM saved_search_alert_batch_items item
      INNER JOIN saved_search_alert_batches batch ON batch.id = item.batch_id
      WHERE batch.saved_search_id = $1
        AND batch.status IN ('pending', 'sent', 'dead')
        AND ${professionalIdFilter.clause}
    `,
    [savedSearchId, ...professionalIdFilter.params],
  );

  return new Set(result.rows.map((row) => Number(row.professional_user_id)));
}

function getFreshnessStageDays(updatedAt, now) {
  const daysSinceUpdate = getDaysSince(updatedAt, now);

  if (daysSinceUpdate >= PROFILE_FRESHNESS_EXPIRY_DAYS) {
    return PROFILE_FRESHNESS_EXPIRY_DAYS;
  }

  if (daysSinceUpdate >= PROFILE_FRESHNESS_REMINDER_DAYS[1]) {
    return PROFILE_FRESHNESS_REMINDER_DAYS[1];
  }

  if (daysSinceUpdate >= PROFILE_FRESHNESS_REMINDER_DAYS[0]) {
    return PROFILE_FRESHNESS_REMINDER_DAYS[0];
  }

  return null;
}

export async function dispatchSavedSearchAlerts({
  pool,
  appBaseUrl,
  now = new Date(),
}) {
  const searches = await pool.query(
    `
      SELECT
        ss.id,
        ss.name,
        ss.criteria_json,
        COALESCE(ss.alert_frequency, CASE WHEN ss.alerts_enabled = false THEN 'disabled' ELSE 'daily' END) AS alert_frequency,
        COALESCE(ss.last_alert_sent_at, ss.last_digest_sent_at) AS last_alert_sent_at,
        ss.created_at,
        recruiter.id AS recruiter_user_id,
        recruiter.name AS recruiter_name,
        recruiter.email AS recruiter_email
      FROM saved_searches ss
      INNER JOIN users recruiter ON recruiter.id = ss.recruiter_user_id
      INNER JOIN user_roles recruiter_role ON recruiter_role.user_id = recruiter.id
      WHERE COALESCE(ss.alert_frequency, CASE WHEN ss.alerts_enabled = false THEN 'disabled' ELSE 'daily' END) <> 'disabled'
        AND recruiter_role.role = 'recruiter'
        AND recruiter.is_verified = true
      ORDER BY ss.id ASC
    `,
  );

  const summary = {
    processed: 0,
    queued: 0,
    matchedProfiles: 0,
  };

  for (const row of searches.rows) {
    summary.processed += 1;

    if (shouldSkipAlert(row.last_alert_sent_at, row.alert_frequency, now)) {
      continue;
    }

    const criteria = normalizeSavedSearchCriteria(row.criteria_json || {});
    const searchResult = hasAffirmativeFilters(criteria)
      ? await searchAffirmativeProfiles(pool, {
          ...criteria,
          page: 1,
          pageSize: 50,
        })
      : await searchPublishedProfiles(pool, {
          ...criteria,
          page: 1,
          pageSize: 50,
        });
    const baseline = row.last_alert_sent_at ? new Date(row.last_alert_sent_at) : new Date(row.created_at);
    const freshMatches = searchResult.items.filter((item) => {
      if (!item.publishedAt) {
        return false;
      }

      return new Date(item.publishedAt).getTime() > baseline.getTime();
    });

    if (!freshMatches.length) {
      continue;
    }

    const professionalIds = freshMatches.map((item) => item.id);
    const alreadyNotifiedIds = await getAlreadyNotifiedIds(pool, Number(row.id), professionalIds);
    const alreadyBufferedIds = await getBufferedAlertProfileIds(pool, Number(row.id), professionalIds);
    const unseenMatches = freshMatches.filter(
      (item) => !alreadyNotifiedIds.has(item.id) && !alreadyBufferedIds.has(item.id),
    );

    if (!unseenMatches.length) {
      continue;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const batchResult = await client.query(
        `
          INSERT INTO saved_search_alert_batches (
            saved_search_id,
            recruiter_user_id,
            recruiter_name_snapshot,
            recruiter_email,
            search_name,
            criteria_json,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending', $7, $7)
          RETURNING id
        `,
        [
          Number(row.id),
          Number(row.recruiter_user_id),
          row.recruiter_name || "",
          row.recruiter_email,
          row.name,
          JSON.stringify(criteria),
          now,
        ],
      );

      const batchId = Number(batchResult.rows[0].id);

      for (const match of unseenMatches) {
        await client.query(
          `
            INSERT INTO saved_search_alert_batch_items (
              batch_id,
              professional_user_id,
              professional_public_slug,
              profile_published_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (batch_id, professional_user_id) DO NOTHING
          `,
          [
            batchId,
            match.id,
            match.publicSlug || null,
            match.publishedAt ? new Date(match.publishedAt) : null,
            now,
          ],
        );
      }

      const outbox = await enqueueAsyncEmail(client, {
        kind: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
        templateKey: ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert,
        toEmail: row.recruiter_email,
        payload: {
          to: row.recruiter_email,
          recruiterName: row.recruiter_name || "",
          searchName: row.name,
          savedSearchId: Number(row.id),
          criteria,
          matches: unseenMatches,
          appBaseUrl,
        },
        priority: SAVED_SEARCH_ALERT_PRIORITY,
        dedupeKey: `saved-search-alert-batch:${batchId}`,
        sourceType: ASYNC_EMAIL_SOURCE_TYPE.savedSearchAlertBatch,
        sourceId: batchId,
        availableAt: now,
        now,
      });

      await client.query(
        `
          UPDATE saved_search_alert_batches
          SET email_outbox_id = $2,
              updated_at = $3
          WHERE id = $1
        `,
        [batchId, outbox.id, now],
      );

      await client.query("COMMIT");

      summary.queued += 1;
      summary.matchedProfiles += unseenMatches.length;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return summary;
}

export async function dispatchProfessionalProfileFreshnessNotifications({
  pool,
  appBaseUrl,
  now = new Date(),
}) {
  const profiles = await pool.query(
    `
      SELECT
        up.id AS user_profile_id,
        up.user_id,
        up.public_slug,
        up.updated_at,
        up.published_at,
        u.name,
        u.email
      FROM user_profiles up
      INNER JOIN users u ON u.id = up.user_id
      INNER JOIN user_roles professional_role ON professional_role.user_id = u.id
      WHERE professional_role.role = 'professional'
        AND u.is_verified = true
        AND up.is_published = true
        AND up.expired_at IS NULL
      ORDER BY up.id ASC
    `,
  );

  const summary = {
    processed: profiles.rows.length,
    remindersQueued: 0,
    expiredProfiles: 0,
  };

  for (const row of profiles.rows) {
    const stageDays = getFreshnessStageDays(row.updated_at, now);

    if (!stageDays) {
      continue;
    }

    const profileUpdatedAt = new Date(row.updated_at).toISOString();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingNotification = await client.query(
        `
          SELECT id
          FROM user_profile_freshness_notifications
          WHERE user_profile_id = $1
            AND profile_updated_at = $2
            AND stage_days = $3
          LIMIT 1
        `,
        [Number(row.user_profile_id), profileUpdatedAt, stageDays],
      );

      if (existingNotification.rows.length) {
        await client.query("ROLLBACK");
        continue;
      }

      const insertedNotification = await client.query(
        `
          INSERT INTO user_profile_freshness_notifications (
            user_profile_id,
            profile_updated_at,
            stage_days,
            sent_at,
            status,
            email_outbox_id,
            last_error,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, NULL, 'pending', NULL, NULL, $4, $4)
          ON CONFLICT (user_profile_id, profile_updated_at, stage_days) DO NOTHING
          RETURNING id
        `,
        [Number(row.user_profile_id), profileUpdatedAt, stageDays, now],
      );

      if (!insertedNotification.rows.length) {
        await client.query("ROLLBACK");
        continue;
      }

      const notificationId = Number(insertedNotification.rows[0].id);

      if (stageDays === PROFILE_FRESHNESS_EXPIRY_DAYS) {
        await client.query(
          `
            UPDATE user_profiles
            SET is_published = false,
                published_at = NULL,
                expired_at = $2
            WHERE id = $1
          `,
          [Number(row.user_profile_id), now],
        );
      }

      const outbox = await enqueueAsyncEmail(client, {
        kind: ASYNC_EMAIL_TEMPLATE_KEY.profileFreshness,
        templateKey: ASYNC_EMAIL_TEMPLATE_KEY.profileFreshness,
        toEmail: row.email,
        payload: {
          to: row.email,
          professionalName: row.name || "",
          publicSlug: row.public_slug || "",
          stageDays,
          lastUpdatedAt: new Date(row.updated_at).toISOString(),
          staleAfterAt: addDays(row.updated_at, PROFILE_FRESHNESS_EXPIRY_DAYS).toISOString(),
          appBaseUrl,
        },
        priority: stageDays === PROFILE_FRESHNESS_EXPIRY_DAYS
          ? PROFILE_EXPIRY_PRIORITY
          : PROFILE_FRESHNESS_PRIORITY,
        dedupeKey: `profile-freshness-notification:${notificationId}`,
        sourceType: ASYNC_EMAIL_SOURCE_TYPE.profileFreshnessNotification,
        sourceId: notificationId,
        availableAt: now,
        now,
      });

      await client.query(
        `
          UPDATE user_profile_freshness_notifications
          SET email_outbox_id = $2,
              updated_at = $3
          WHERE id = $1
        `,
        [notificationId, outbox.id, now],
      );

      await client.query("COMMIT");

      if (stageDays === PROFILE_FRESHNESS_EXPIRY_DAYS) {
        summary.expiredProfiles += 1;
      } else {
        summary.remindersQueued += 1;
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return summary;
}

export async function runAlertsProducerCycle({
  pool,
  appBaseUrl,
  now = new Date(),
}) {
  const [savedSearches, profileFreshness] = await Promise.all([
    dispatchSavedSearchAlerts({
      pool,
      appBaseUrl,
      now,
    }),
    dispatchProfessionalProfileFreshnessNotifications({
      pool,
      appBaseUrl,
      now,
    }),
  ]);

  return {
    savedSearches,
    profileFreshness,
  };
}
