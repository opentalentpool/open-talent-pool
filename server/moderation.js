import { maskEmail } from "./auth.js";
import { normalizeEmail, normalizeProfilePayload } from "./profiles.js";
import { DEFAULT_INTERNAL_OPERATIONS_ADMIN_EMAIL } from "../src/lib/internal-accounts.js";
import {
  IMMEDIATE_PERMANENT_BAN_CATEGORY_VALUES,
  MODERATION_ACTION_TYPE_VALUES,
  MODERATION_REPORT_CATEGORY_VALUES,
  MODERATION_REPORT_STATUS_VALUES,
  MODERATION_RESOLUTION_CODE_VALUES,
  MODERATION_TARGET_KIND_VALUES,
  PROFESSIONAL_PROFILE_STRIKE_ACTION_VALUES,
  REPORTING_RESTRICTION_DAYS,
  REPORTING_STRIKE_THRESHOLD,
  REPORTING_STRIKE_WINDOW_DAYS,
} from "../src/lib/moderation.js";

const PROFESSIONAL_PROFILE_STRIKE_ACTION_SET = new Set(PROFESSIONAL_PROFILE_STRIKE_ACTION_VALUES);
const IMMEDIATE_PERMANENT_BAN_CATEGORY_SET = new Set(IMMEDIATE_PERMANENT_BAN_CATEGORY_VALUES);

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function futureDate(base, days) {
  return new Date(toDate(base).getTime() + days * 24 * 60 * 60 * 1000);
}

function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildModerationSubjectSnapshot(metadata = {}) {
  const subjectSnapshot = metadata?.subjectSnapshot || {};
  const targetSnapshot = metadata?.targetSnapshot || {};

  return {
    name:
      normalizeText(subjectSnapshot.name)
      || normalizeText(metadata.subjectName)
      || normalizeText(targetSnapshot.targetName)
      || "Conta alvo",
    emailHint:
      normalizeText(subjectSnapshot.emailHint)
      || normalizeText(metadata.subjectEmailHint)
      || normalizeText(targetSnapshot.targetEmailHint)
      || null,
    publicSlug:
      normalizeText(subjectSnapshot.publicSlug)
      || normalizeText(targetSnapshot.publicSlug)
      || null,
    accountRole:
      normalizeText(subjectSnapshot.accountRole)
      || normalizeText(metadata.accountRole)
      || null,
  };
}

function buildModerationActionSubjectName(row) {
  if (row?.subject_name) {
    return row.subject_name;
  }

  return buildModerationSubjectSnapshot(row?.metadata_json).name;
}

function buildModerationActionSubjectEmailHint(row) {
  if (row?.subject_email) {
    return maskEmail(row.subject_email);
  }

  return buildModerationSubjectSnapshot(row?.metadata_json).emailHint;
}

function buildReportTargetName(row) {
  if (row?.target_name) {
    return row.target_name;
  }

  const snapshotName = row?.target_snapshot_json?.targetName;

  return typeof snapshotName === "string" && snapshotName.trim() ? snapshotName.trim() : "Conta alvo";
}

function buildReportTargetEmailHint(row) {
  if (row?.target_email) {
    return maskEmail(row.target_email);
  }

  const snapshotHint = row?.target_snapshot_json?.targetEmailHint;

  return typeof snapshotHint === "string" && snapshotHint.trim() ? snapshotHint.trim() : null;
}

export function mapContactAccessRow(row) {
  return {
    id: Number(row.id),
    recruiterUserId: row.recruiter_user_id ? Number(row.recruiter_user_id) : null,
    recruiterName: row.recruiter_name_snapshot,
    recruiterEmailHint: row.recruiter_email_hint,
    professionalPublicSlug: row.professional_public_slug || null,
    accessedAt: toIsoOrNull(row.accessed_at),
  };
}

export function mapModerationReportRow(row) {
  return {
    id: Number(row.id),
    reporterUserId: Number(row.reporter_user_id),
    reporterName: row.reporter_name || "Pessoa denunciante",
    targetUserId: row.target_user_id ? Number(row.target_user_id) : null,
    targetName: buildReportTargetName(row),
    targetEmailHint: buildReportTargetEmailHint(row),
    targetKind: row.target_kind,
    category: row.category,
    description: row.description,
    targetSnapshot: row.target_snapshot_json || {},
    status: row.status,
    resolutionCode: row.resolution_code || null,
    adminNotes: row.admin_notes || null,
    createdAt: toIsoOrNull(row.created_at),
    resolvedAt: toIsoOrNull(row.resolved_at),
    resolvedByName: row.resolved_by_name || null,
    targetStrikeCount: Number.isInteger(row?.target_strike_count) ? Number(row.target_strike_count) : null,
    nextSanction: row?.next_sanction || null,
  };
}

export function mapModerationActionRow(row) {
  return {
    id: Number(row.id),
    actionType: row.action_type,
    subjectUserId: row.subject_user_id ? Number(row.subject_user_id) : null,
    subjectName: buildModerationActionSubjectName(row),
    subjectEmailHint: buildModerationActionSubjectEmailHint(row),
    relatedReportId: row.related_report_id ? Number(row.related_report_id) : null,
    createdByName: row.created_by_name || null,
    reason: row.reason,
    metadata: row.metadata_json || {},
    createdAt: toIsoOrNull(row.created_at),
  };
}

export function resolveNextModerationSanction({ targetKind, category, targetStrikeCount = 0 }) {
  if (targetKind !== "professional_public_profile") {
    return null;
  }

  if (IMMEDIATE_PERMANENT_BAN_CATEGORY_SET.has(category)) {
    return "permanent_ban_target_account";
  }

  if (targetStrikeCount >= 2) {
    return "permanent_ban_target_account";
  }

  if (targetStrikeCount === 1) {
    return "suspend_target_account";
  }

  return "hide_professional_profile";
}

export async function recordProfileContactAccess(
  executor,
  {
    recruiterUserId,
    recruiterName,
    recruiterEmail,
    professionalUserId,
    professionalPublicSlug = null,
    now = new Date(),
  },
) {
  await executor.query(
    `
      INSERT INTO profile_contact_access_logs (
        recruiter_user_id,
        professional_user_id,
        professional_public_slug,
        recruiter_name_snapshot,
        recruiter_email_hint,
        accessed_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6)
    `,
    [
      recruiterUserId,
      professionalUserId,
      professionalPublicSlug,
      recruiterName || "Recrutador autenticado",
      maskEmail(recruiterEmail),
      now,
    ],
  );
}

export async function loadProfessionalContactAccesses(executor, professionalUserId) {
  const result = await executor.query(
    `
      SELECT
        id,
        recruiter_user_id,
        professional_user_id,
        professional_public_slug,
        recruiter_name_snapshot,
        recruiter_email_hint,
        accessed_at
      FROM profile_contact_access_logs
      WHERE professional_user_id = $1
      ORDER BY accessed_at DESC, id DESC
    `,
    [professionalUserId],
  );

  return result.rows.map(mapContactAccessRow);
}

export async function findProfessionalContactAccess(executor, accessId, professionalUserId) {
  const result = await executor.query(
    `
      SELECT
        id,
        recruiter_user_id,
        professional_user_id,
        professional_public_slug,
        recruiter_name_snapshot,
        recruiter_email_hint,
        accessed_at
      FROM profile_contact_access_logs
      WHERE id = $1
        AND professional_user_id = $2
      LIMIT 1
    `,
    [accessId, professionalUserId],
  );

  return result.rows[0] || null;
}

export async function countFalseReportStrikes(executor, reporterUserId, now = new Date()) {
  const cutoff = new Date(toDate(now).getTime() - REPORTING_STRIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const result = await executor.query(
    `
      SELECT COUNT(*)::int AS count
      FROM moderation_reports
      WHERE reporter_user_id = $1
        AND resolution_code = 'dismiss_false_report'
        AND resolved_at IS NOT NULL
        AND resolved_at >= $2
    `,
    [reporterUserId, cutoff],
  );

  return Number(result.rows[0]?.count || 0);
}

export async function countProfessionalProfileTargetStrikes(executor, targetUserId) {
  if (!targetUserId) {
    return 0;
  }

  const result = await executor.query(
    `
      SELECT COUNT(*)::int AS count
      FROM moderation_actions action
      LEFT JOIN moderation_reports report ON report.id = action.related_report_id
      WHERE action.subject_user_id = $1
        AND action.action_type = ANY($2::text[])
        AND COALESCE(report.target_kind, action.metadata_json->>'targetKind') = 'professional_public_profile'
    `,
    [targetUserId, PROFESSIONAL_PROFILE_STRIKE_ACTION_VALUES],
  );

  return Number(result.rows[0]?.count || 0);
}

export async function loadReportSubmissionStatus(executor, reporterUserId, now = new Date()) {
  const userResult = await executor.query(
    `
      SELECT reporting_restricted_until, reporting_restriction_reason
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [reporterUserId],
  );
  const user = userResult.rows[0] || null;
  const falseReportStrikeCount = await countFalseReportStrikes(executor, reporterUserId, now);
  const restrictedUntil = user?.reporting_restricted_until ? new Date(user.reporting_restricted_until) : null;
  const isRestricted = Boolean(restrictedUntil && restrictedUntil > toDate(now));

  return {
    canSubmit: !isRestricted,
    falseReportStrikeCount,
    reportingRestrictedUntil: isRestricted ? restrictedUntil.toISOString() : null,
    reportingRestrictionReason: isRestricted ? user?.reporting_restriction_reason || null : null,
  };
}

export async function resolveReportTarget(executor, { targetKind, targetRef, reporterUserId }) {
  if (targetKind === "professional_public_profile") {
    const result = await executor.query(
      `
        SELECT
          u.id AS target_user_id,
          u.name AS target_name,
          u.email AS target_email,
          up.public_slug,
          up.profile_data
        FROM users u
        INNER JOIN user_profiles up ON up.user_id = u.id
        INNER JOIN user_roles professional_role ON professional_role.user_id = u.id
        WHERE professional_role.role = 'professional'
          AND u.account_status = 'active'
          AND u.is_verified = true
          AND up.is_published = true
          AND up.public_slug = $1
        LIMIT 1
      `,
      [targetRef],
    );

    const row = result.rows[0] || null;

    if (!row) {
      return null;
    }

    const profile = normalizeProfilePayload({
      ...row.profile_data,
      name: row.profile_data?.name || row.target_name || "",
      isPublished: true,
    });

    return {
      targetUserId: Number(row.target_user_id),
      targetSnapshot: {
        targetName: row.target_name || profile.name,
        publicSlug: row.public_slug,
        headline: profile.headline,
        city: profile.city,
        state: profile.state,
      },
    };
  }

  if (targetKind === "recruiter_contact_access") {
    const result = await executor.query(
      `
        SELECT
          log.id,
          log.recruiter_user_id,
          log.professional_user_id,
          log.professional_public_slug,
          log.recruiter_name_snapshot,
          log.recruiter_email_hint
        FROM profile_contact_access_logs log
        WHERE log.id = $1
          AND log.professional_user_id = $2
        LIMIT 1
      `,
      [Number(targetRef), reporterUserId],
    );

    const row = result.rows[0] || null;

    if (!row || !row.recruiter_user_id) {
      return null;
    }

    return {
      targetUserId: Number(row.recruiter_user_id),
      targetSnapshot: {
        targetName: row.recruiter_name_snapshot,
        targetEmailHint: row.recruiter_email_hint,
        professionalPublicSlug: row.professional_public_slug || null,
        accessLogId: Number(row.id),
      },
    };
  }

  return null;
}

export async function findOpenModerationReport(executor, { reporterUserId, targetUserId, targetKind }) {
  const result = await executor.query(
    `
      SELECT id
      FROM moderation_reports
      WHERE reporter_user_id = $1
        AND target_user_id = $2
        AND target_kind = $3
        AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [reporterUserId, targetUserId, targetKind],
  );

  return result.rows[0] || null;
}

export async function createModerationReport(
  executor,
  {
    reporterUserId,
    targetUserId,
    targetKind,
    category,
    description,
    targetSnapshot,
    now = new Date(),
  },
) {
  const result = await executor.query(
    `
      INSERT INTO moderation_reports (
        reporter_user_id,
        target_user_id,
        target_kind,
        category,
        description,
        target_snapshot_json,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'open', $7, $7)
      RETURNING
        id,
        reporter_user_id,
        target_user_id,
        target_kind,
        category,
        description,
        target_snapshot_json,
        status,
        resolution_code,
        admin_notes,
        created_at,
        resolved_at
    `,
    [
      reporterUserId,
      targetUserId,
      targetKind,
      category,
      description,
      JSON.stringify(targetSnapshot || {}),
      now,
    ],
  );

  return result.rows[0] || null;
}

export async function recordModerationAction(
  executor,
  {
    actionType,
    subjectUserId,
    relatedReportId = null,
    createdByAdminUserId,
    reason,
    metadata = {},
    now = new Date(),
  },
) {
  await executor.query(
    `
      INSERT INTO moderation_actions (
        action_type,
        subject_user_id,
        related_report_id,
        created_by_admin_user_id,
        reason,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      actionType,
      subjectUserId,
      relatedReportId,
      createdByAdminUserId,
      reason,
      JSON.stringify(metadata || {}),
      now,
    ],
  );
}

export async function loadModerationSubjectUser(executor, userId) {
  if (!userId) {
    return null;
  }

  const result = await executor.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        up.public_slug
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

export function createModerationSubjectSnapshot(row) {
  if (!row) {
    return {
      name: "Conta alvo",
      emailHint: null,
      publicSlug: null,
      accountRole: null,
    };
  }

  return {
    name: row.name || "Conta alvo",
    emailHint: row.email ? maskEmail(row.email) : null,
    publicSlug: row.public_slug || null,
    accountRole: row.role || null,
  };
}

export async function createModerationBanRecord(
  executor,
  {
    emailHash,
    sourceUserId = null,
    relatedReportId = null,
    createdByAdminUserId = null,
    reason,
    metadata = {},
    now = new Date(),
  },
) {
  await executor.query(
    `
      INSERT INTO moderation_banned_email_hashes (
        email_hash,
        source_user_id,
        related_report_id,
        created_by_admin_user_id,
        reason,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      ON CONFLICT (email_hash) DO UPDATE
      SET
        source_user_id = EXCLUDED.source_user_id,
        related_report_id = EXCLUDED.related_report_id,
        created_by_admin_user_id = EXCLUDED.created_by_admin_user_id,
        reason = EXCLUDED.reason,
        metadata_json = EXCLUDED.metadata_json,
        created_at = EXCLUDED.created_at
    `,
    [
      emailHash,
      sourceUserId,
      relatedReportId,
      createdByAdminUserId,
      reason,
      JSON.stringify(metadata || {}),
      now,
    ],
  );
}

export async function hideProfessionalProfile(executor, { targetUserId, reason, now = new Date() }) {
  const currentProfile = await executor.query(
    `
      SELECT profile_data
      FROM user_profiles
      WHERE user_id = $1
      LIMIT 1
    `,
    [targetUserId],
  );
  const nextProfileData = {
    ...(currentProfile.rows[0]?.profile_data || {}),
    isPublished: false,
  };

  await executor.query(
    `
      UPDATE user_profiles
      SET
        is_published = false,
        published_at = NULL,
        moderation_blocked_at = $2,
        moderation_block_reason = $3,
        profile_data = $4,
        updated_at = $2
      WHERE user_id = $1
    `,
    [targetUserId, now, normalizeText(reason) || "Perfil ocultado por moderação.", nextProfileData],
  );
}

export async function suspendUserAccount(executor, { targetUserId, reason, now = new Date() }) {
  await executor.query(
    `
      UPDATE users
      SET account_status = 'suspended'
      WHERE id = $1
    `,
    [targetUserId],
  );
  await executor.query(
    `
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, $2),
          revoked_reason = COALESCE(revoked_reason, 'account_suspended')
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [targetUserId, now],
  );

  return {
    suspensionReason: normalizeText(reason) || "Conta suspensa por moderação.",
    suspendedAt: now.toISOString(),
  };
}

export async function maybeApplyFalseReportRestriction(executor, { reporterUserId, reason, now = new Date() }) {
  const falseReportStrikeCount = await countFalseReportStrikes(executor, reporterUserId, now);

  if (falseReportStrikeCount < REPORTING_STRIKE_THRESHOLD) {
    return {
      falseReportStrikeCount,
      reportingRestrictedUntil: null,
    };
  }

  const restrictedUntil = futureDate(now, REPORTING_RESTRICTION_DAYS);

  await executor.query(
    `
      UPDATE users
      SET reporting_restricted_until = $2,
          reporting_restriction_reason = $3
      WHERE id = $1
    `,
    [
      reporterUserId,
      restrictedUntil,
      normalizeText(reason) || "Canal de denúncias temporariamente restrito após reincidência em denúncias falsas.",
    ],
  );

  return {
    falseReportStrikeCount,
    reportingRestrictedUntil: restrictedUntil.toISOString(),
  };
}

export async function restoreProfessionalProfile(executor, { targetUserId, now = new Date() }) {
  await executor.query(
    `
      UPDATE user_profiles
      SET moderation_blocked_at = NULL,
          moderation_block_reason = NULL,
          updated_at = $2
      WHERE user_id = $1
    `,
    [targetUserId, now],
  );
}

export async function restoreUserAccount(executor, { targetUserId }) {
  await executor.query(
    `
      UPDATE users
      SET account_status = 'active'
      WHERE id = $1
    `,
    [targetUserId],
  );
}

export async function liftReportingRestriction(executor, { targetUserId }) {
  await executor.query(
    `
      UPDATE users
      SET reporting_restricted_until = NULL,
          reporting_restriction_reason = NULL
      WHERE id = $1
    `,
    [targetUserId],
  );
}

async function queryModerationReports(executor, whereClause = "", params = []) {
  const result = await executor.query(
    `
      SELECT
        report.id,
        report.reporter_user_id,
        reporter.name AS reporter_name,
        report.target_user_id,
        target_user.name AS target_name,
        target_user.email AS target_email,
        report.target_kind,
        report.category,
        report.description,
        report.target_snapshot_json,
        report.status,
        report.resolution_code,
        report.admin_notes,
        report.created_at,
        report.resolved_at,
        resolver.name AS resolved_by_name
      FROM moderation_reports report
      INNER JOIN users reporter ON reporter.id = report.reporter_user_id
      LEFT JOIN users target_user ON target_user.id = report.target_user_id
      LEFT JOIN users resolver ON resolver.id = report.resolved_by
      ${whereClause}
      ORDER BY report.created_at DESC, report.id DESC
    `,
    params,
  );

  const items = [];

  for (const row of result.rows) {
    const targetStrikeCount = row.target_user_id
      ? await countProfessionalProfileTargetStrikes(executor, Number(row.target_user_id))
      : null;

    items.push(
      mapModerationReportRow({
        ...row,
        target_strike_count: targetStrikeCount,
        next_sanction: row.target_user_id
          ? resolveNextModerationSanction({
              targetKind: row.target_kind,
              category: row.category,
              targetStrikeCount,
            })
          : null,
      }),
    );
  }

  return items;
}

export async function listModerationReports(executor) {
  return queryModerationReports(executor, "WHERE report.status = 'open'");
}

export async function loadModerationReportById(executor, reportId) {
  const rows = await queryModerationReports(executor, "WHERE report.id = $1", [reportId]);
  return rows[0] || null;
}

export async function listHiddenProfiles(executor, { reservedAdminEmail = DEFAULT_INTERNAL_OPERATIONS_ADMIN_EMAIL } = {}) {
  const result = await executor.query(
    `
      SELECT
        u.id AS user_id,
        u.name,
        up.public_slug,
        up.moderation_blocked_at,
        up.moderation_block_reason
      FROM user_profiles up
      INNER JOIN users u ON u.id = up.user_id
      WHERE up.moderation_blocked_at IS NOT NULL
        AND LOWER(u.email) <> $1
      ORDER BY up.moderation_blocked_at DESC, u.id DESC
    `,
    [reservedAdminEmail],
  );

  return result.rows.map((row) => ({
    userId: Number(row.user_id),
    name: row.name || "Profissional",
    publicSlug: row.public_slug || null,
    blockedAt: toIsoOrNull(row.moderation_blocked_at),
    blockReason: row.moderation_block_reason || null,
  }));
}

export async function listSuspendedAccounts(executor, { reservedAdminEmail = DEFAULT_INTERNAL_OPERATIONS_ADMIN_EMAIL } = {}) {
  const usersResult = await executor.query(
    `
      SELECT
        u.id AS user_id,
        u.name,
        u.email
      FROM users u
      WHERE u.account_status = 'suspended'
        AND LOWER(u.email) <> $1
      ORDER BY u.id DESC
    `,
    [reservedAdminEmail],
  );

  const items = [];

  for (const row of usersResult.rows) {
    const actionResult = await executor.query(
      `
        SELECT created_at, reason
        FROM moderation_actions
        WHERE subject_user_id = $1
          AND action_type = 'suspend_target_account'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [row.user_id],
    );

    items.push({
      userId: Number(row.user_id),
      name: row.name || "Conta suspensa",
      emailHint: maskEmail(row.email),
      suspendedAt: toIsoOrNull(actionResult.rows[0]?.created_at || null),
      suspensionReason: actionResult.rows[0]?.reason || null,
    });
  }

  return items.sort((left, right) => {
    const leftTime = left.suspendedAt ? new Date(left.suspendedAt).getTime() : 0;
    const rightTime = right.suspendedAt ? new Date(right.suspendedAt).getTime() : 0;
    return rightTime - leftTime || right.userId - left.userId;
  });
}

export async function listRestrictedReporters(
  executor,
  now = new Date(),
  { reservedAdminEmail = DEFAULT_INTERNAL_OPERATIONS_ADMIN_EMAIL } = {},
) {
  const usersResult = await executor.query(
    `
      SELECT
        u.id AS user_id,
        u.name,
        u.email,
        u.reporting_restricted_until,
        u.reporting_restriction_reason
      FROM users u
      WHERE u.reporting_restricted_until IS NOT NULL
        AND u.reporting_restricted_until > $1
        AND LOWER(u.email) <> $2
      ORDER BY u.reporting_restricted_until DESC, u.id DESC
    `,
    [now, reservedAdminEmail],
  );

  const items = [];

  for (const row of usersResult.rows) {
    const falseReportStrikeCount = await countFalseReportStrikes(executor, row.user_id, now);

    items.push({
      userId: Number(row.user_id),
      name: row.name || "Conta restrita",
      emailHint: maskEmail(row.email),
      restrictedUntil: toIsoOrNull(row.reporting_restricted_until),
      restrictionReason: row.reporting_restriction_reason || null,
      falseReportStrikeCount,
    });
  }

  return items.sort((left, right) => {
    const leftTime = left.restrictedUntil ? new Date(left.restrictedUntil).getTime() : 0;
    const rightTime = right.restrictedUntil ? new Date(right.restrictedUntil).getTime() : 0;
    return rightTime - leftTime || right.userId - left.userId;
  });
}

export async function listRecentModerationActions(executor, limit = 20) {
  const result = await executor.query(
    `
      SELECT
        action.id,
        action.action_type,
        action.subject_user_id,
        subject_user.name AS subject_name,
        subject_user.email AS subject_email,
        action.related_report_id,
        action.reason,
        action.metadata_json,
        action.created_at,
        action_actor.name AS created_by_name
      FROM moderation_actions action
      LEFT JOIN users subject_user ON subject_user.id = action.subject_user_id
      LEFT JOIN users action_actor ON action_actor.id = action.created_by_admin_user_id
      ORDER BY action.created_at DESC, action.id DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(mapModerationActionRow);
}

export async function loadOwnModerationReports(executor, reporterUserId) {
  return queryModerationReports(executor, "WHERE report.reporter_user_id = $1", [reporterUserId]);
}

export function isModerationTargetKind(value) {
  return MODERATION_TARGET_KIND_VALUES.includes(value);
}

export function isModerationCategory(value) {
  return MODERATION_REPORT_CATEGORY_VALUES.includes(value);
}

export function isModerationResolutionCode(value) {
  return MODERATION_RESOLUTION_CODE_VALUES.includes(value);
}

export function isModerationStatus(value) {
  return MODERATION_REPORT_STATUS_VALUES.includes(value);
}

export function isModerationActionType(value) {
  return MODERATION_ACTION_TYPE_VALUES.includes(value);
}
