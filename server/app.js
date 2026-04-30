import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ASYNC_EMAIL_PRIORITY } from "./async-email.js";
import {
  buildRateLimitedError,
  consumeRateLimit,
  createAuthService,
  createCorsOptions,
  getClientIp,
  handleAuthError,
  hashModerationEmail,
  hashPrivacyActor,
  isAllowedOrigin,
} from "./auth.js";
import {
  accountDeletionSchema,
  adminModerationReasonSchema,
  affirmativePolicyAcceptanceSchema,
  authActiveRoleSchema,
  authEnableRoleSchema,
  authRequestCodeSchema,
  authSignUpSchema,
  authVerifySchema,
  affirmativeSearchParamsSchema,
  collectValidationIssues,
  createModerationReportSchema,
  createSavedSearchSchema,
  profileInputSchema,
  profileContactEmailRequestSchema,
  recruiterFavoriteSchema,
  resolveModerationReportSchema,
  SAVED_SEARCH_ALERT_FREQUENCY_VALUES,
  searchProfilesParamsSchema,
  updateSavedSearchSchema,
} from "./contracts.js";
import {
  buildStoredAffirmativeProfile,
  PROFILE_DEFAULTS,
  createPublicSlug,
  getProfilePublicationIssues,
  hydrateOwnProfileRow,
  normalizeEmail,
  normalizeProfilePayload,
  resolveProfileContactEmail,
  searchAffirmativeProfiles,
  searchPublishedProfiles,
  shapePublicProfileDetail,
  shapePublicProfileSummary,
  listPublishedProfileRecords,
  normalizeSavedSearchCriteria,
  validateAffirmativeProfileConsent,
} from "./profiles.js";
import {
  createModerationReport,
  countProfessionalProfileTargetStrikes,
  createModerationBanRecord,
  createModerationSubjectSnapshot,
  countFalseReportStrikes,
  findOpenModerationReport,
  hideProfessionalProfile,
  listHiddenProfiles,
  listModerationReports,
  listRecentModerationActions,
  listRestrictedReporters,
  listSuspendedAccounts,
  loadModerationReportById,
  loadModerationSubjectUser,
  loadOwnModerationReports,
  loadProfessionalContactAccesses,
  loadReportSubmissionStatus,
  maybeApplyFalseReportRestriction,
  recordModerationAction,
  recordProfileContactAccess,
  resolveReportTarget,
  restoreProfessionalProfile,
  restoreUserAccount,
  resolveNextModerationSanction,
  liftReportingRestriction,
  suspendUserAccount,
} from "./moderation.js";
import {
  AFFIRMATIVE_POLICY_KEY,
  AFFIRMATIVE_POLICY_VERSION,
  hasAffirmativeFilters,
} from "../src/lib/affirmative-config.js";
import { LEGAL_POLICY_HASH } from "../src/lib/legal-policies.js";
import {
  IMMEDIATE_PERMANENT_BAN_CATEGORY_VALUES,
  REPORT_SUBMISSION_LIMIT,
  REPORT_SUBMISSION_WINDOW_MS,
} from "../src/lib/moderation.js";

const PUNITIVE_MODERATION_DECISIONS = new Set([
  "hide_professional_profile",
  "suspend_target_account",
  "permanent_ban_target_account",
]);
const IMMEDIATE_PERMANENT_BAN_CATEGORY_SET = new Set(IMMEDIATE_PERMANENT_BAN_CATEGORY_VALUES);

function createValidationResponse(res, error) {
  return res.status(400).json({
    error: "validation_error",
    issues: collectValidationIssues(error),
  });
}

function createCustomValidationResponse(res, issues) {
  return res.status(400).json({
    error: "validation_error",
    issues,
  });
}

function createContactEmailVerificationIssue() {
  return {
    path: "contactEmail",
    message: "Confirme o novo e-mail de contato antes de salvar.",
  };
}

function createAccountDeletionConfirmationIssue() {
  return {
    path: "confirmEmail",
    message: "Confirme o e-mail da conta para excluir permanentemente o acesso.",
  };
}

function parseIntegerId(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSavedSearchAlertFrequencyValue(value) {
  return SAVED_SEARCH_ALERT_FREQUENCY_VALUES.includes(value) ? value : "daily";
}

function mapSavedSearch(row) {
  return {
    id: Number(row.id),
    name: row.name,
    criteria: normalizeSavedSearchCriteria(row.criteria_json || {}),
    alertFrequency: normalizeSavedSearchAlertFrequencyValue(row.alert_frequency),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    lastAlertSentAt: row.last_alert_sent_at ? new Date(row.last_alert_sent_at).toISOString() : null,
  };
}

function mapPolicyAcceptance(row) {
  return {
    policyKey: row.policy_key,
    policyVersion: row.policy_version,
    policyHash: row.policy_hash,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    acceptanceSource: row.acceptance_source || null,
  };
}

function mapInclusiveAuditRow(row) {
  return {
    policyKey: row.policy_key,
    policyVersion: row.policy_version,
    policyHash: row.policy_hash,
    useCase: row.use_case,
    vacancyReference: row.vacancy_reference,
    criteria: normalizeSavedSearchCriteria(row.criteria_json || {}),
    resultCount: Number(row.result_count || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function shapeFavoriteRow(row) {
  return {
    ...shapePublicProfileSummary({
      id: Number(row.user_id),
      name: row.name,
      publicSlug: row.public_slug,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      profile: normalizeProfilePayload({
        ...row.profile_data,
        name: row.profile_data?.name || row.name,
        isPublished: row.is_published,
      }),
    }),
    favoritedAt: row.favorited_at ? new Date(row.favorited_at).toISOString() : null,
  };
}

async function loadRecruiterFavorites(pool, recruiterUserId) {
  const favorites = await pool.query(
    `
      SELECT
        favorite.created_at AS favorited_at,
        profile.user_id,
        user_record.name,
        profile.profile_data,
        profile.is_published,
        profile.public_slug,
        profile.published_at,
        profile.updated_at
      FROM recruiter_favorites favorite
      INNER JOIN user_profiles profile ON profile.user_id = favorite.professional_user_id
      INNER JOIN users user_record ON user_record.id = profile.user_id
      INNER JOIN user_roles professional_role ON professional_role.user_id = user_record.id
      WHERE favorite.recruiter_user_id = $1
        AND profile.is_published = true
        AND profile.moderation_blocked_at IS NULL
        AND professional_role.role = 'professional'
        AND user_record.account_status = 'active'
        AND user_record.is_verified = true
      ORDER BY favorite.created_at DESC
    `,
    [recruiterUserId],
  );

  return favorites.rows.map(shapeFavoriteRow);
}

async function loadRecruiterSavedSearches(pool, recruiterUserId) {
  const searches = await pool.query(
    `
      SELECT
        id,
        name,
        criteria_json,
        COALESCE(alert_frequency, CASE WHEN alerts_enabled = false THEN 'disabled' ELSE 'daily' END) AS alert_frequency,
        COALESCE(last_alert_sent_at, last_digest_sent_at) AS last_alert_sent_at,
        created_at,
        updated_at
      FROM saved_searches
      WHERE recruiter_user_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [recruiterUserId],
  );

  return searches.rows.map(mapSavedSearch);
}

async function loadUserPolicyAcceptances(pool, userId) {
  const result = await pool.query(
    `
      SELECT policy_key, policy_version, policy_hash, acceptance_source, accepted_at
      FROM user_policy_acceptances
      WHERE user_id = $1
      ORDER BY accepted_at DESC, id DESC
    `,
    [userId],
  );

  return result.rows.map(mapPolicyAcceptance);
}

async function loadRecruiterPolicyAcceptances(pool, recruiterUserId) {
  const result = await pool.query(
    `
      SELECT policy_key, policy_version, policy_hash, NULL::text AS acceptance_source, accepted_at
      FROM recruiter_policy_acceptances
      WHERE recruiter_user_id = $1
      ORDER BY accepted_at DESC, id DESC
    `,
    [recruiterUserId],
  );

  return result.rows.map(mapPolicyAcceptance);
}

async function loadInclusiveSearchAudit(pool, recruiterUserId) {
  const result = await pool.query(
    `
      SELECT policy_key, policy_version, policy_hash, use_case, vacancy_reference, criteria_json, result_count, created_at
      FROM affirmative_search_audit_logs
      WHERE recruiter_user_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [recruiterUserId],
  );

  return result.rows.map(mapInclusiveAuditRow);
}

async function recordLegalAuditLedgerEvent(
  executor,
  {
    eventType,
    actorHash,
    accountRole,
    policyKey = null,
    policyVersion = null,
    policyHash = null,
    source = null,
    metadata = {},
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
        metadata_json,
        occurred_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
    `,
    [
      eventType,
      actorHash,
      accountRole,
      policyKey,
      policyVersion,
      policyHash,
      source,
      JSON.stringify(metadata || {}),
      occurredAt,
    ],
  );
}

async function getRecruiterAffirmativePolicyStatus(pool, recruiterUserId) {
  const result = await pool.query(
    `
      SELECT policy_version, policy_hash, accepted_at
      FROM recruiter_policy_acceptances
      WHERE recruiter_user_id = $1
        AND policy_key = $2
      ORDER BY accepted_at DESC, id DESC
      LIMIT 1
    `,
    [recruiterUserId, AFFIRMATIVE_POLICY_KEY],
  );

  const current = result.rows[0] || null;
  const accepted =
    current?.policy_version === AFFIRMATIVE_POLICY_VERSION &&
    Boolean(current?.accepted_at);

  return {
    accepted,
    acceptedAt: accepted ? new Date(current.accepted_at).toISOString() : null,
    policyVersion: AFFIRMATIVE_POLICY_VERSION,
    policyHash: LEGAL_POLICY_HASH.inclusiveUsePolicy,
  };
}

async function ensureRecruiterAffirmativePolicyAccepted(pool, recruiterUserId) {
  const status = await getRecruiterAffirmativePolicyStatus(pool, recruiterUserId);

  return status.accepted;
}

async function loadAuthenticatedUser(pool, userId) {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.account_status,
        u.reporting_restricted_until,
        u.reporting_restriction_reason,
        u.is_verified,
        u.created_at,
        up.profile_data,
        up.is_published,
        up.public_slug,
        up.published_at,
        up.updated_at,
        up.expired_at,
        up.moderation_blocked_at,
        up.moderation_block_reason
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

function buildFallbackModerationSubjectSnapshot({
  name = "Conta alvo",
  emailHint = null,
  publicSlug = null,
  accountRole = null,
} = {}) {
  return {
    name,
    emailHint,
    publicSlug,
    accountRole,
  };
}

async function loadModerationActionSubjectSnapshot(executor, {
  subjectUserId = null,
  fallbackName = "Conta alvo",
  fallbackEmailHint = null,
  fallbackPublicSlug = null,
  fallbackAccountRole = null,
} = {}) {
  if (!subjectUserId) {
    return buildFallbackModerationSubjectSnapshot({
      name: fallbackName,
      emailHint: fallbackEmailHint,
      publicSlug: fallbackPublicSlug,
      accountRole: fallbackAccountRole,
    });
  }

  const subjectRow = await loadModerationSubjectUser(executor, subjectUserId);
  const snapshot = createModerationSubjectSnapshot(subjectRow);

  return {
    name: snapshot.name || fallbackName || "Conta alvo",
    emailHint: snapshot.emailHint || fallbackEmailHint || null,
    publicSlug: snapshot.publicSlug || fallbackPublicSlug || null,
    accountRole: snapshot.accountRole || fallbackAccountRole || null,
  };
}

function buildModerationActionMetadata({
  currentReport = null,
  subjectSnapshot,
  emailStatus = "not_applicable",
  strikeCountBeforeAction = null,
  sanctionMode = null,
  purge = null,
  extra = {},
} = {}) {
  return {
    targetKind: currentReport?.targetKind || extra.targetKind || null,
    category: currentReport?.category || extra.category || null,
    targetSnapshot: currentReport?.targetSnapshot || extra.targetSnapshot || null,
    subjectSnapshot: subjectSnapshot || null,
    strikeCountBeforeAction,
    sanctionMode,
    emailStatus,
    purge,
    ...extra,
  };
}

async function recordModerationActionWithSnapshot(executor, {
  actionType,
  subjectUserId = null,
  relatedReportId = null,
  createdByAdminUserId,
  reason,
  currentReport = null,
  subjectFallback = {},
  emailStatus = "not_applicable",
  strikeCountBeforeAction = null,
  sanctionMode = null,
  purge = null,
  extraMetadata = {},
  now = new Date(),
} = {}) {
  const subjectSnapshot = await loadModerationActionSubjectSnapshot(executor, {
    subjectUserId,
    fallbackName: subjectFallback.name,
    fallbackEmailHint: subjectFallback.emailHint,
    fallbackPublicSlug: subjectFallback.publicSlug,
    fallbackAccountRole: subjectFallback.accountRole,
  });

  await recordModerationAction(executor, {
    actionType,
    subjectUserId,
    relatedReportId,
    createdByAdminUserId,
    reason,
    metadata: buildModerationActionMetadata({
      currentReport,
      subjectSnapshot,
      emailStatus,
      strikeCountBeforeAction,
      sanctionMode,
      purge,
      extra: extraMetadata,
    }),
    now,
  });

  return subjectSnapshot;
}

function createImmediatePermanentBanMode(currentReport) {
  return currentReport?.targetKind === "professional_public_profile"
    && IMMEDIATE_PERMANENT_BAN_CATEGORY_SET.has(currentReport.category);
}

async function loadPublishedProfileBySlug(pool, slug) {
  const result = await pool.query(
    `
      SELECT
        u.id AS user_id,
        u.name,
        u.email,
        up.profile_data,
        up.is_published,
        up.public_slug,
        up.published_at,
        up.updated_at
      FROM users u
      INNER JOIN user_profiles up ON up.user_id = u.id
      INNER JOIN user_roles user_role ON user_role.user_id = u.id
      WHERE user_role.role = 'professional'
        AND u.account_status = 'active'
        AND u.is_verified = true
        AND up.is_published = true
        AND up.moderation_blocked_at IS NULL
        AND up.public_slug = $1
      LIMIT 1
    `,
    [slug],
  );

  return result.rows[0] || null;
}

function shapeAuthUser(row, authContext) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role: authContext.activeRole,
    activeRole: authContext.activeRole,
    availableRoles: authContext.availableRoles,
    is_verified: Boolean(row.is_verified),
    created_at: row.created_at,
  };
}

function redactRequestBody(value) {
  if (Array.isArray(value)) {
    return value.map(redactRequestBody);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sensitiveKeys = new Set([
    "code",
    "captchaToken",
    "challengeId",
    "token",
    "password",
    "smtpPass",
    "authCodePepper",
    "turnstileSecretKey",
    "contactEmail",
    "nextContactEmail",
    "affirmativeProfile",
    "affirmativeContext",
    "affirmativeFilters",
    "affirmativeConsentAccepted",
    "vacancyReference",
  ]);

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      sensitiveKeys.has(key) ? "[REDACTED]" : redactRequestBody(entryValue),
    ]),
  );
}

function createApp({
  pool,
  config,
  sendCodeEmail = async () => {},
  sendModerationReportReceiptEmail = async () => {},
  sendModerationDecisionEmail = async () => {},
  verifyCaptcha = undefined,
  debug = false,
  logger = console,
  enableTestRoutes = config?.nodeEnv === "test" || process.env.NODE_ENV === "test",
  testState = null,
  dispatchAlerts = null,
}) {
  const app = express();
  const authService = createAuthService({
    pool,
    config,
    sendCodeEmail,
    logger,
    captchaVerifier: verifyCaptcha,
  });
  const corsOptions = createCorsOptions(config);

  app.set("trust proxy", Boolean(config.trustProxy));
  app.disable("x-powered-by");
  app.use(cors(corsOptions));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'", "https://challenges.cloudflare.com"],
          fontSrc: ["'self'", "data:"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          frameSrc: ["'self'", "https://challenges.cloudflare.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use((req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return next();
    }

    const origin = req.headers.origin;

    if (origin && !isAllowedOrigin(origin, config)) {
      return res.status(403).json({ error: "invalid_origin" });
    }

    return next();
  });

  if (debug) {
    app.use(morgan("dev"));
    app.use((req, _res, next) => {
      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        try {
          logger.log(`[REQ BODY] ${req.method} ${req.originalUrl} ->`, JSON.stringify(redactRequestBody(req.body)));
        } catch {
          logger.log(`[REQ BODY] ${req.method} ${req.originalUrl} -> (unserializable)`);
        }
      }

      next();
    });
  }

  app.get("/api/health", (_req, res) => {
    return res.json({ ok: true });
  });

  async function authMiddleware(req, res, next) {
    try {
      req.user = await authService.authenticateRequest(req, res);
      return next();
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  }

  function requireRoleContext(requiredRole) {
    return (req, res, next) => {
      if (!req.user?.hasRole?.(requiredRole)) {
        return res.status(403).json({
          error: "role_not_enabled",
          requiredRole,
          activeRole: req.user?.activeRole || null,
          availableRoles: req.user?.availableRoles || [],
        });
      }

      if (req.user.activeRole !== requiredRole) {
        return res.status(409).json({
          error: "role_context_required",
          requiredRole,
          activeRole: req.user.activeRole,
          availableRoles: req.user.availableRoles,
        });
      }

      return next();
    };
  }

  const professionalContextMiddleware = requireRoleContext("professional");
  const recruiterContextMiddleware = requireRoleContext("recruiter");
  const adminMiddleware = (req, res, next) => {
    if (!req.user?.isAdmin && req.user?.role !== "administrator" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }

    return next();
  };

  function csrfMutationMiddleware(req, res, next) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return next();
    }

    if (req.path.startsWith("/test/")) {
      return next();
    }

    return authMiddleware(req, res, () => {
      if (!authService.isValidCsrfToken(req.user, req.get("x-csrf-token"))) {
        return res.status(403).json({ error: "invalid_csrf_token" });
      }

      return next();
    });
  }

  app.post("/api/auth/signup", async (req, res) => {
    const parsed = authSignUpSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    const { name, role } = parsed.data;
    const normalizedEmail = normalizeEmail(parsed.data.email);

    try {
      const response = await authService.issueSignUpChallenge({
        email: normalizedEmail,
        name,
        role,
        acceptedLegalPolicies: parsed.data.acceptedLegalPolicies,
        captchaToken: parsed.data.captchaToken,
        remoteIp: getClientIp(req),
        userAgent: req.get("user-agent") || "",
        requestOrigin: req.get("origin") || "",
      });

      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.post("/api/auth/request-code", async (req, res) => {
    const parsed = authRequestCodeSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);

    try {
      const response = await authService.issueLoginChallenge({
        email: normalizedEmail,
        captchaToken: parsed.data.captchaToken,
        remoteIp: getClientIp(req),
        userAgent: req.get("user-agent") || "",
        requestOrigin: req.get("origin") || "",
      });

      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.post("/api/auth/verify", async (req, res) => {
    const parsed = authVerifySchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const response = await authService.verifyChallenge({
        challengeId: parsed.data.challengeId,
        code: parsed.data.code,
        remoteIp: getClientIp(req),
        userAgent: req.get("user-agent") || "",
        res,
      });
      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.use("/api", csrfMutationMiddleware);

  app.post("/api/auth/signout", async (req, res) => {
    try {
      const response = await authService.signOut(req, res);
      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.get("/api/auth/csrf", authMiddleware, async (req, res) => {
    try {
      const csrfToken = await authService.issueCsrfToken(req.user.sessionId);
      return res.json({ csrfToken });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    try {
      const users = await pool.query(
        "SELECT id,name,email,role,is_verified,created_at FROM users WHERE id = $1 LIMIT 1",
        [req.user.userId],
      );

      if (!users.rows.length) {
        return res.status(404).json({ error: "user_not_found" });
      }

      const csrfToken = await authService.issueCsrfToken(req.user.sessionId);
      return res.json({ user: shapeAuthUser(users.rows[0], req.user), csrfToken });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/auth/account/privacy-export", authMiddleware, async (req, res) => {
    try {
      const userRecord = await loadAuthenticatedUser(pool, req.user.userId);

      if (!userRecord) {
        return res.status(404).json({ error: "user_not_found" });
      }

      const [
        favorites,
        savedSearches,
        userPolicyAcceptances,
        recruiterPolicyAcceptances,
        inclusiveSearchAudit,
        contactAccessLogs,
        reportsMade,
        reportingStatus,
      ] = await Promise.all([
        loadRecruiterFavorites(pool, req.user.userId),
        loadRecruiterSavedSearches(pool, req.user.userId),
        loadUserPolicyAcceptances(pool, req.user.userId),
        loadRecruiterPolicyAcceptances(pool, req.user.userId),
        loadInclusiveSearchAudit(pool, req.user.userId),
        loadProfessionalContactAccesses(pool, req.user.userId),
        loadOwnModerationReports(pool, req.user.userId),
        loadReportSubmissionStatus(pool, req.user.userId),
      ]);

      const profile = userRecord.profile_data
        ? hydrateOwnProfileRow({
            ...userRecord,
            role: "professional",
          })
        : null;

      return res.json({
        exportedAt: new Date().toISOString(),
        account: shapeAuthUser(userRecord, req.user),
        profile,
        recruiter: {
          favorites,
          savedSearches,
        },
        policyAcceptances: {
          user: userPolicyAcceptances,
          recruiter: recruiterPolicyAcceptances,
        },
        inclusiveSearchAudit,
        moderation: {
          contactAccessLogs,
          reportsMade,
          reportingStatus,
        },
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.delete("/api/auth/account", authMiddleware, async (req, res) => {
    const parsed = accountDeletionSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    if (normalizeEmail(parsed.data.confirmEmail) !== normalizeEmail(req.user.email)) {
      return createCustomValidationResponse(res, [createAccountDeletionConfirmationIssue()]);
    }

    const client = await pool.connect();
    const deletedAt = new Date();

    try {
      const userRecord = await loadAuthenticatedUser(client, req.user.userId);

      if (!userRecord) {
        return res.status(404).json({ error: "user_not_found" });
      }

      await client.query("BEGIN");
      await recordLegalAuditLedgerEvent(client, {
        eventType: "account_deletion",
        actorHash: hashPrivacyActor(req.user.email, config.authCodePepper),
        accountRole: req.user.activeRole,
        source: "self_service_dashboard",
        metadata: {
          availableRoles: req.user.availableRoles,
          deletedUserId: req.user.userId,
        },
        occurredAt: deletedAt,
      });
      await client.query("DELETE FROM users WHERE id = $1", [req.user.userId]);
      await client.query("COMMIT");

      authService.clearAuthCookie(res);

      return res.json({
        ok: true,
        deletedAt: deletedAt.toISOString(),
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    } finally {
      client.release();
    }
  });

  app.put("/api/auth/active-role", authMiddleware, async (req, res) => {
    const parsed = authActiveRoleSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const response = await authService.setActiveRole({
        sessionId: req.user.sessionId,
        userId: req.user.userId,
        role: parsed.data.role,
      });

      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.post("/api/auth/roles/enable", authMiddleware, async (req, res) => {
    const parsed = authEnableRoleSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const response = await authService.enableRole({
        sessionId: req.user.sessionId,
        userId: req.user.userId,
        role: parsed.data.role,
        makeActive: parsed.data.makeActive,
        currentActiveRole: req.user.activeRole,
      });

      return res.json(response);
    } catch (error) {
      logger.error(error);
      return handleAuthError(res, error, logger);
    }
  });

  app.get("/api/auth/profile", authMiddleware, professionalContextMiddleware, async (req, res) => {
    try {
      const { userId } = req.user || {};

      if (!userId) {
        return res.status(401).json({ error: "invalid_session" });
      }

      const currentUser = await loadAuthenticatedUser(pool, userId);

      if (!currentUser) {
        return res.status(404).json({ error: "user_not_found" });
      }

      const ownProfile = hydrateOwnProfileRow({
        ...currentUser,
        role: "professional",
        profile_data: currentUser.profile_data || { ...PROFILE_DEFAULTS, name: currentUser.name || "" },
      });

      return res.json(ownProfile);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/auth/profile/contact-accesses", authMiddleware, professionalContextMiddleware, async (req, res) => {
    try {
      const accesses = await loadProfessionalContactAccesses(pool, req.user.userId);
      return res.json({ accesses });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/reports/me/status", authMiddleware, async (req, res) => {
    try {
      const status = await loadReportSubmissionStatus(pool, req.user.userId);
      return res.json(status);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/profile/contact-email/request-code", authMiddleware, professionalContextMiddleware, async (req, res) => {
    const parsed = profileContactEmailRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const response = await authService.issueProfileContactEmailChallenge({
        userId: req.user.userId,
        sessionId: req.user.sessionId,
        accountEmail: normalizeEmail(req.user.email),
        nextContactEmail: normalizeEmail(parsed.data.nextContactEmail),
        remoteIp: getClientIp(req),
        userAgent: req.get("user-agent") || "",
        requestOrigin: req.get("origin") || "",
      });

      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.post("/api/auth/profile/contact-email/verify", authMiddleware, professionalContextMiddleware, async (req, res) => {
    const parsed = authVerifySchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const response = await authService.verifyProfileContactEmailChallenge({
        challengeId: parsed.data.challengeId,
        code: parsed.data.code,
        userId: req.user.userId,
        sessionId: req.user.sessionId,
        remoteIp: getClientIp(req),
      });

      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.put("/api/auth/profile", authMiddleware, professionalContextMiddleware, async (req, res) => {
    const parsed = profileInputSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const { userId } = req.user || {};

      if (!userId) {
        return res.status(401).json({ error: "invalid_session" });
      }

      const currentUser = await loadAuthenticatedUser(pool, userId);

      if (!currentUser) {
        return res.status(404).json({ error: "user_not_found" });
      }

      const normalizedProfile = normalizeProfilePayload(parsed.data);
      const normalizedAccountEmail = normalizeEmail(currentUser.email);
      const currentEffectiveContactEmail = resolveProfileContactEmail(currentUser.profile_data || null, currentUser.email);
      const requestedContactEmail = normalizeEmail(normalizedProfile.contactEmail) || normalizedAccountEmail;
      const requiresContactEmailVerification =
        requestedContactEmail !== normalizedAccountEmail &&
        requestedContactEmail !== normalizeEmail(currentEffectiveContactEmail);
      const affirmativeConsentIssue = validateAffirmativeProfileConsent(
        normalizedProfile,
        currentUser.profile_data || null,
        parsed.data.affirmativeConsentAccepted,
      );

      if (affirmativeConsentIssue) {
        return createCustomValidationResponse(res, [affirmativeConsentIssue]);
      }

      const storedAffirmativeProfile = buildStoredAffirmativeProfile(
        normalizedProfile,
        currentUser.profile_data || null,
        parsed.data.affirmativeConsentAccepted,
      );
      const requestedPublication = normalizedProfile.isPublished;

      if (requestedPublication && currentUser.moderation_blocked_at) {
        return res.status(403).json({
          error: "profile_moderation_blocked",
          message: "Este perfil depende de restauração administrativa antes de nova publicação.",
          blockedAt: new Date(currentUser.moderation_blocked_at).toISOString(),
        });
      }

      const publicationIssues = getProfilePublicationIssues({
        role: "professional",
        isVerified: Boolean(currentUser.is_verified),
        profile: {
          ...normalizedProfile,
          affirmativeProfile: storedAffirmativeProfile,
        },
        moderationBlockedAt: currentUser.moderation_blocked_at,
      });

      if (requestedPublication && publicationIssues.length > 0) {
        return res.status(400).json({
          error: "profile_not_publishable",
          issues: publicationIssues,
        });
      }

      const nextUserName = normalizedProfile.name || null;
      const nextPublicSlug =
        currentUser.public_slug ||
        createPublicSlug(nextUserName || currentUser.name || normalizedProfile.headline || "profissional", userId);
      const canRepublishAfterExpiry = !currentUser.expired_at;
      const shouldPublish = requestedPublication && publicationIssues.length === 0 && canRepublishAfterExpiry;
      const nextPublishedAt = shouldPublish
        ? currentUser.published_at && canRepublishAfterExpiry && currentUser.is_published
          ? currentUser.published_at
          : new Date()
        : null;
      const profileData = {
        ...normalizedProfile,
        contactEmail: requestedContactEmail === normalizedAccountEmail ? "" : requestedContactEmail,
        isPublished: shouldPublish,
        affirmativeProfile: storedAffirmativeProfile,
      };

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        if (requiresContactEmailVerification) {
          const hasVerifiedContactEmailChange = await authService.consumeVerifiedProfileContactEmailChallenge(client, {
            userId,
            sessionId: req.user.sessionId,
            nextContactEmail: requestedContactEmail,
          });

          if (!hasVerifiedContactEmailChange) {
            await client.query("ROLLBACK");
            return createCustomValidationResponse(res, [createContactEmailVerificationIssue()]);
          }
        }

        await client.query("UPDATE users SET name = $1 WHERE id = $2", [nextUserName, userId]);

        if (currentUser.profile_data) {
          await client.query(
            `
              UPDATE user_profiles
              SET profile_data = $1,
                  is_published = $2,
                  public_slug = $3,
                  published_at = $4,
                  expired_at = NULL,
                  updated_at = NOW()
              WHERE user_id = $5
            `,
            [
              profileData,
              shouldPublish,
              nextPublicSlug,
              nextPublishedAt,
              userId,
            ],
          );
        } else {
          await client.query(
            `
              INSERT INTO user_profiles (user_id, profile_data, is_published, public_slug, published_at, expired_at)
              VALUES ($1, $2, $3, $4, $5, NULL)
            `,
            [userId, profileData, shouldPublish, nextPublicSlug, nextPublishedAt],
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      const updatedUser = await loadAuthenticatedUser(pool, userId);
      const ownProfile = hydrateOwnProfileRow({
        ...updatedUser,
        role: "professional",
      });

      return res.json({
        user: shapeAuthUser(updatedUser, req.user),
        ...ownProfile,
      });
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.post("/api/reports", authMiddleware, async (req, res) => {
    const parsed = createModerationReportSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    const now = new Date();
    const client = await pool.connect();
    let createdReportId = null;

    try {
      await client.query("BEGIN");

      const submissionStatus = await loadReportSubmissionStatus(client, req.user.userId, now);

      if (!submissionStatus.canSubmit) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          error: "reporting_restricted",
          message: "Seu acesso ao canal de denúncias está temporariamente restrito.",
          ...submissionStatus,
        });
      }

      const rateLimit = await consumeRateLimit(client, {
        scope: "moderation_report_submit_account_24h",
        subject: String(req.user.userId),
        windowMs: REPORT_SUBMISSION_WINDOW_MS,
        limit: REPORT_SUBMISSION_LIMIT,
        now,
      });

      if (!rateLimit.allowed) {
        await client.query("ROLLBACK");
        return handleAuthError(res, buildRateLimitedError("moderation_report_submit_account_24h", rateLimit), logger);
      }

      const target = await resolveReportTarget(client, {
        targetKind: parsed.data.targetKind,
        targetRef: parsed.data.targetRef,
        reporterUserId: req.user.userId,
      });

      if (!target?.targetUserId) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "report_target_not_found" });
      }

      const duplicate = await findOpenModerationReport(client, {
        reporterUserId: req.user.userId,
        targetUserId: target.targetUserId,
        targetKind: parsed.data.targetKind,
      });

      if (duplicate) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "report_already_open",
          reportId: Number(duplicate.id),
        });
      }

      const created = await createModerationReport(client, {
        reporterUserId: req.user.userId,
        targetUserId: target.targetUserId,
        targetKind: parsed.data.targetKind,
        category: parsed.data.category,
        description: parsed.data.description,
        targetSnapshot: target.targetSnapshot,
        now,
      });
      createdReportId = created?.id ? Number(created.id) : null;

      const report = created ? await loadModerationReportById(client, created.id) : null;

      if (!report) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "server_error" });
      }

      await sendModerationReportReceiptEmail({
        executor: client,
        priority: ASYNC_EMAIL_PRIORITY.moderation,
        to: req.user.email,
        reporterName: req.user.name || "Pessoa denunciante",
        reportId: report.id,
        targetKind: report.targetKind,
        category: report.category,
        appBaseUrl: config.appBaseUrl,
      });

      await client.query("COMMIT");
      return res.status(201).json({ report });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (createdReportId) {
        await pool.query("DELETE FROM moderation_reports WHERE id = $1", [createdReportId]).catch(() => undefined);
      }
      return handleAuthError(res, error, logger);
    } finally {
      client.release();
    }
  });

  app.get("/api/profiles", async (req, res) => {
    const parsed = searchProfilesParamsSchema.safeParse(req.query);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const result = await searchPublishedProfiles(pool, parsed.data);

      return res.json(result);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/profiles/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();

      if (!slug) {
        return res.status(404).json({ error: "profile_not_found" });
      }

      const row = await loadPublishedProfileBySlug(pool, slug);

      if (!row) {
        return res.status(404).json({ error: "profile_not_found" });
      }

      const allPublished = await listPublishedProfileRecords(pool);
      const currentRecord = allPublished.find((record) => record.publicSlug === slug);

      if (!currentRecord) {
        return res.status(404).json({ error: "profile_not_found" });
      }

      return res.json({ profile: shapePublicProfileDetail(currentRecord) });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/recruiter/profiles/:slug/contact", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();

      if (!slug) {
        return res.status(404).json({ error: "contact_email_not_available" });
      }

      const row = await loadPublishedProfileBySlug(pool, slug);

      if (!row) {
        return res.status(404).json({ error: "contact_email_not_available" });
      }

      const profile = normalizeProfilePayload({
        ...row.profile_data,
        name: row.profile_data?.name || row.name || "",
        isPublished: Boolean(row.is_published),
      });

      if (!profile.showContactEmailToRecruiters) {
        return res.status(404).json({ error: "contact_email_not_available" });
      }

      await recordProfileContactAccess(pool, {
        recruiterUserId: req.user.userId,
        recruiterName: req.user.name || "Recrutador autenticado",
        recruiterEmail: req.user.email,
        professionalUserId: Number(row.user_id),
        professionalPublicSlug: row.public_slug || slug,
      });

      return res.json({
        email: resolveProfileContactEmail(profile, row.email),
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/recruiter/affirmative-search/policy-status", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    try {
      const status = await getRecruiterAffirmativePolicyStatus(pool, req.user.userId);

      return res.json(status);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/recruiter/affirmative-search/policy-acceptance", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    const parsed = affirmativePolicyAcceptanceSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const acceptedAt = new Date();

      await pool.query(
        `
          INSERT INTO recruiter_policy_acceptances (recruiter_user_id, policy_key, policy_version, policy_hash, accepted_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          req.user.userId,
          AFFIRMATIVE_POLICY_KEY,
          parsed.data.policyVersion,
          LEGAL_POLICY_HASH.inclusiveUsePolicy,
          acceptedAt,
        ],
      );
      await recordLegalAuditLedgerEvent(pool, {
        eventType: "policy_acceptance",
        actorHash: hashPrivacyActor(req.user.email, config.authCodePepper),
        accountRole: "recruiter",
        policyKey: AFFIRMATIVE_POLICY_KEY,
        policyVersion: parsed.data.policyVersion,
        policyHash: LEGAL_POLICY_HASH.inclusiveUsePolicy,
        source: "affirmative_search_policy_acceptance",
        occurredAt: acceptedAt,
      });

      return res.status(201).json({
        accepted: true,
        acceptedAt: acceptedAt.toISOString(),
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
        policyHash: LEGAL_POLICY_HASH.inclusiveUsePolicy,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/recruiter/affirmative-search", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    const parsed = affirmativeSearchParamsSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const hasAcceptedPolicy = await ensureRecruiterAffirmativePolicyAccepted(pool, req.user.userId);

      if (!hasAcceptedPolicy) {
        return res.status(403).json({
          error: "affirmative_policy_not_accepted",
          policyVersion: AFFIRMATIVE_POLICY_VERSION,
        });
      }

      const result = await searchAffirmativeProfiles(pool, parsed.data);
      await pool.query(
        `
          INSERT INTO affirmative_search_audit_logs (
            recruiter_user_id,
            actor_hash,
            policy_key,
            policy_version,
            policy_hash,
            use_case,
            vacancy_reference,
            criteria_json,
            result_count,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        `,
        [
          req.user.userId,
          hashPrivacyActor(req.user.email, config.authCodePepper),
          AFFIRMATIVE_POLICY_KEY,
          AFFIRMATIVE_POLICY_VERSION,
          LEGAL_POLICY_HASH.inclusiveUsePolicy,
          parsed.data.affirmativeContext.useCase,
          parsed.data.affirmativeContext.vacancyReference,
          JSON.stringify(
            normalizeSavedSearchCriteria({
              q: parsed.data.q,
              seniority: parsed.data.seniority,
              workModel: parsed.data.workModel,
              state: parsed.data.state,
              openToOpportunities: parsed.data.openToOpportunities,
              affirmativeContext: parsed.data.affirmativeContext,
              affirmativeFilters: parsed.data.affirmativeFilters,
            }),
          ),
          result.total,
          new Date(),
        ],
      );

      return res.json(result);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/recruiter/favorites", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    try {
      return res.json({
        favorites: await loadRecruiterFavorites(pool, req.user.userId),
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/recruiter/favorites", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    const parsed = recruiterFavoriteSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const targetProfile = await pool.query(
        `
          SELECT profile.user_id
          FROM user_profiles profile
          INNER JOIN users user_record ON user_record.id = profile.user_id
          INNER JOIN user_roles professional_role ON professional_role.user_id = user_record.id
          WHERE profile.user_id = $1
            AND profile.is_published = true
            AND profile.moderation_blocked_at IS NULL
            AND professional_role.role = 'professional'
            AND user_record.account_status = 'active'
            AND user_record.is_verified = true
          LIMIT 1
        `,
        [parsed.data.profileId],
      );

      if (!targetProfile.rows.length) {
        return res.status(404).json({ error: "profile_not_found" });
      }

      await pool.query(
        `
          INSERT INTO recruiter_favorites (recruiter_user_id, professional_user_id)
          VALUES ($1, $2)
          ON CONFLICT (recruiter_user_id, professional_user_id) DO NOTHING
        `,
        [req.user.userId, parsed.data.profileId],
      );

      return res.status(201).json({ ok: true });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.delete("/api/recruiter/favorites/:profileId", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    const profileId = parseIntegerId(req.params.profileId);

    if (!profileId) {
      return res.status(400).json({ error: "validation_error" });
    }

    try {
      await pool.query(
        "DELETE FROM recruiter_favorites WHERE recruiter_user_id = $1 AND professional_user_id = $2",
        [req.user.userId, profileId],
      );

      return res.status(204).send();
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/recruiter/saved-searches", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    try {
      return res.json({
        savedSearches: await loadRecruiterSavedSearches(pool, req.user.userId),
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/recruiter/saved-searches", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    const parsed = createSavedSearchSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const normalizedCriteria = normalizeSavedSearchCriteria(parsed.data.criteria);

      if (hasAffirmativeFilters(normalizedCriteria)) {
        const hasAcceptedPolicy = await ensureRecruiterAffirmativePolicyAccepted(pool, req.user.userId);

        if (!hasAcceptedPolicy) {
          return res.status(403).json({
            error: "affirmative_policy_not_accepted",
            policyVersion: AFFIRMATIVE_POLICY_VERSION,
          });
        }
      }

      const result = await pool.query(
        `
          INSERT INTO saved_searches (recruiter_user_id, name, criteria_json, alert_frequency, last_alert_sent_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, name, criteria_json, alert_frequency, last_alert_sent_at, created_at, updated_at
        `,
        [req.user.userId, parsed.data.name, normalizedCriteria, parsed.data.alertFrequency, null],
      );

      return res.status(201).json({ savedSearch: mapSavedSearch(result.rows[0]) });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.patch("/api/recruiter/saved-searches/:id", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    const savedSearchId = parseIntegerId(req.params.id);

    if (!savedSearchId) {
      return res.status(400).json({ error: "validation_error" });
    }

    const parsed = updateSavedSearchSchema.safeParse(req.body);

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const existing = await pool.query(
        `
          SELECT
            id,
            name,
            criteria_json,
            COALESCE(alert_frequency, CASE WHEN alerts_enabled = false THEN 'disabled' ELSE 'daily' END) AS alert_frequency,
            COALESCE(last_alert_sent_at, last_digest_sent_at) AS last_alert_sent_at
          FROM saved_searches
          WHERE id = $1 AND recruiter_user_id = $2
          LIMIT 1
        `,
        [savedSearchId, req.user.userId],
      );

      if (!existing.rows.length) {
        return res.status(404).json({ error: "saved_search_not_found" });
      }

      const current = existing.rows[0];
      const nextName = parsed.data.name ?? current.name;
      const nextCriteria = parsed.data.criteria
        ? normalizeSavedSearchCriteria(parsed.data.criteria)
        : normalizeSavedSearchCriteria(current.criteria_json || {});

      if (hasAffirmativeFilters(nextCriteria)) {
        const hasAcceptedPolicy = await ensureRecruiterAffirmativePolicyAccepted(pool, req.user.userId);

        if (!hasAcceptedPolicy) {
          return res.status(403).json({
            error: "affirmative_policy_not_accepted",
            policyVersion: AFFIRMATIVE_POLICY_VERSION,
          });
        }
      }

      const currentAlertFrequency = normalizeSavedSearchAlertFrequencyValue(current.alert_frequency);
      const nextAlertFrequency = parsed.data.alertFrequency ?? currentAlertFrequency;
      const nextLastAlertSentAt =
        currentAlertFrequency === "disabled" && nextAlertFrequency !== "disabled"
          ? new Date()
          : current.last_alert_sent_at || null;

      const result = await pool.query(
        `
          UPDATE saved_searches
          SET name = $1,
              criteria_json = $2,
              alert_frequency = $3,
              last_alert_sent_at = $4,
              updated_at = NOW()
          WHERE id = $5 AND recruiter_user_id = $6
          RETURNING id, name, criteria_json, alert_frequency, last_alert_sent_at, created_at, updated_at
        `,
        [nextName, nextCriteria, nextAlertFrequency, nextLastAlertSentAt, savedSearchId, req.user.userId],
      );

      return res.json({ savedSearch: mapSavedSearch(result.rows[0]) });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.delete("/api/recruiter/saved-searches/:id", authMiddleware, recruiterContextMiddleware, async (req, res) => {
    const savedSearchId = parseIntegerId(req.params.id);

    if (!savedSearchId) {
      return res.status(400).json({ error: "validation_error" });
    }

    try {
      const result = await pool.query(
        "DELETE FROM saved_searches WHERE id = $1 AND recruiter_user_id = $2",
        [savedSearchId, req.user.userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "saved_search_not_found" });
      }

      return res.status(204).send();
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/admin/moderation/reports", authMiddleware, adminMiddleware, async (_req, res) => {
    try {
      const [reports, hiddenProfiles, suspendedAccounts, restrictedReporters, recentActions] = await Promise.all([
        listModerationReports(pool),
        listHiddenProfiles(pool, { reservedAdminEmail: config.internalOperationsAdminEmail }),
        listSuspendedAccounts(pool, { reservedAdminEmail: config.internalOperationsAdminEmail }),
        listRestrictedReporters(pool, new Date(), { reservedAdminEmail: config.internalOperationsAdminEmail }),
        listRecentModerationActions(pool),
      ]);

      return res.json({
        reports,
        hiddenProfiles,
        suspendedAccounts,
        restrictedReporters,
        recentActions,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/admin/moderation/reports/:id", authMiddleware, adminMiddleware, async (req, res) => {
    const reportId = parseIntegerId(req.params.id);

    if (!reportId) {
      return res.status(400).json({ error: "validation_error" });
    }

    try {
      const report = await loadModerationReportById(pool, reportId);

      if (!report) {
        return res.status(404).json({ error: "report_not_found" });
      }

      return res.json({ report });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/moderation/reports/:id/resolve", authMiddleware, adminMiddleware, async (req, res) => {
    const reportId = parseIntegerId(req.params.id);
    const parsed = resolveModerationReportSchema.safeParse(req.body);

    if (!reportId) {
      return res.status(400).json({ error: "validation_error" });
    }

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const currentReport = await loadModerationReportById(client, reportId);

      if (!currentReport) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "report_not_found" });
      }

      if (currentReport.status !== "open") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "report_already_resolved" });
      }

      if (
        parsed.data.decision === "hide_professional_profile"
        && currentReport.targetKind !== "professional_public_profile"
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "invalid_resolution_target" });
      }

      if (
        parsed.data.decision === "permanent_ban_target_account"
        && currentReport.targetKind !== "professional_public_profile"
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "invalid_resolution_target" });
      }

      if (
        !currentReport.targetUserId
        && parsed.data.decision !== "dismiss_false_report"
        && parsed.data.decision !== "dismiss_good_faith"
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "report_target_not_found" });
      }

      const targetStrikeCount = currentReport.targetKind === "professional_public_profile" && currentReport.targetUserId
        ? currentReport.targetStrikeCount ?? await countProfessionalProfileTargetStrikes(client, currentReport.targetUserId)
        : null;
      const nextSanction = resolveNextModerationSanction({
        targetKind: currentReport.targetKind,
        category: currentReport.category,
        targetStrikeCount: targetStrikeCount ?? 0,
      });
      const isPunitiveDecision = PUNITIVE_MODERATION_DECISIONS.has(parsed.data.decision);
      const isImmediatePermanentBan = createImmediatePermanentBanMode(currentReport);
      const targetSubjectFallback = buildFallbackModerationSubjectSnapshot({
        name: currentReport.targetName,
        emailHint: currentReport.targetEmailHint,
        publicSlug:
          typeof currentReport.targetSnapshot?.publicSlug === "string"
            ? currentReport.targetSnapshot.publicSlug
            : null,
      });
      const targetSubjectRow = currentReport.targetUserId
        ? await loadModerationSubjectUser(client, currentReport.targetUserId)
        : null;
      const targetSubjectSnapshot = targetSubjectRow
        ? createModerationSubjectSnapshot(targetSubjectRow)
        : targetSubjectFallback;

      if (isPunitiveDecision && !targetSubjectRow?.email) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "report_target_not_found" });
      }

      if (
        currentReport.targetKind === "professional_public_profile"
        && isPunitiveDecision
        && parsed.data.decision !== nextSanction
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "invalid_resolution_sequence",
          expectedDecision: nextSanction,
          targetStrikeCount,
        });
      }

      await client.query(
        `
          UPDATE moderation_reports
          SET status = 'resolved',
              resolution_code = $2,
              resolved_by = $3,
              resolved_at = $4,
              admin_notes = $5,
              updated_at = $4
          WHERE id = $1
        `,
        [reportId, parsed.data.decision, req.user.userId, now, parsed.data.adminNotes],
      );

      if (parsed.data.decision === "dismiss_false_report") {
        const restriction = await maybeApplyFalseReportRestriction(client, {
          reporterUserId: currentReport.reporterUserId,
          reason: parsed.data.adminNotes,
          now,
        });

        await recordModerationActionWithSnapshot(client, {
          actionType: "dismiss_false_report",
          subjectUserId: currentReport.reporterUserId,
          relatedReportId: reportId,
          createdByAdminUserId: req.user.userId,
          reason: parsed.data.adminNotes,
          currentReport,
          subjectFallback: {
            name: currentReport.reporterName,
          },
          sanctionMode: "false_report_enforcement",
          extraMetadata: {
            ...restriction,
            reporterUserId: currentReport.reporterUserId,
          },
          now,
        });
      }

      if (parsed.data.decision === "dismiss_good_faith") {
        await recordModerationActionWithSnapshot(client, {
          actionType: "dismiss_good_faith",
          subjectUserId: currentReport.targetUserId,
          relatedReportId: reportId,
          createdByAdminUserId: req.user.userId,
          reason: parsed.data.adminNotes,
          currentReport,
          subjectFallback: targetSubjectFallback,
          sanctionMode: "dismissed_after_review",
          now,
        });
      }

      if (parsed.data.decision === "hide_professional_profile") {
        await hideProfessionalProfile(client, {
          targetUserId: currentReport.targetUserId,
          reason: parsed.data.adminNotes,
          now,
        });

        await sendModerationDecisionEmail({
          executor: client,
          priority: ASYNC_EMAIL_PRIORITY.moderation,
          to: targetSubjectRow?.email,
          targetName: targetSubjectSnapshot.name,
          reportId,
          targetKind: currentReport.targetKind,
          category: currentReport.category,
          actionType: "hide_professional_profile",
          strikeCount: targetStrikeCount,
          appBaseUrl: config.appBaseUrl,
        });

        await recordModerationActionWithSnapshot(client, {
          actionType: "hide_professional_profile",
          subjectUserId: currentReport.targetUserId,
          relatedReportId: reportId,
          createdByAdminUserId: req.user.userId,
          reason: parsed.data.adminNotes,
          currentReport,
          subjectFallback: targetSubjectFallback,
          emailStatus: "sent",
          strikeCountBeforeAction: targetStrikeCount,
          sanctionMode: "strike_based",
          now,
        });
      }

      if (parsed.data.decision === "suspend_target_account") {
        const suspension = await suspendUserAccount(client, {
          targetUserId: currentReport.targetUserId,
          reason: parsed.data.adminNotes,
          now,
        });

        await sendModerationDecisionEmail({
          executor: client,
          priority: ASYNC_EMAIL_PRIORITY.moderation,
          to: targetSubjectRow?.email,
          targetName: targetSubjectSnapshot.name,
          reportId,
          targetKind: currentReport.targetKind,
          category: currentReport.category,
          actionType: "suspend_target_account",
          strikeCount: targetStrikeCount,
          appBaseUrl: config.appBaseUrl,
        });

        await recordModerationActionWithSnapshot(client, {
          actionType: "suspend_target_account",
          subjectUserId: currentReport.targetUserId,
          relatedReportId: reportId,
          createdByAdminUserId: req.user.userId,
          reason: parsed.data.adminNotes,
          currentReport,
          subjectFallback: targetSubjectFallback,
          emailStatus: "sent",
          strikeCountBeforeAction: targetStrikeCount,
          sanctionMode:
            currentReport.targetKind === "professional_public_profile"
              ? "strike_based"
              : "manual_recruiter_contact",
          extraMetadata: suspension,
          now,
        });
      }

      if (parsed.data.decision === "permanent_ban_target_account") {
        const targetEmail = targetSubjectRow?.email || null;

        if (!targetEmail || !currentReport.targetUserId) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "report_target_not_found" });
        }

        await sendModerationDecisionEmail({
          executor: client,
          priority: ASYNC_EMAIL_PRIORITY.moderation,
          to: targetEmail,
          targetName: targetSubjectSnapshot.name,
          reportId,
          targetKind: currentReport.targetKind,
          category: currentReport.category,
          actionType: "permanent_ban_target_account",
          strikeCount: targetStrikeCount,
          isImmediatePermanentBan,
          appBaseUrl: config.appBaseUrl,
        });

        const emailHash = hashModerationEmail(targetEmail, config.authCodePepper);
        const purgeMetadata = {
          deletedUserId: currentReport.targetUserId,
          deletedAt: now.toISOString(),
          legalRetention: "moderation_banned_email_hashes + legal_audit_ledger",
          emailHash,
        };

        await createModerationBanRecord(client, {
          emailHash,
          sourceUserId: currentReport.targetUserId,
          relatedReportId: reportId,
          createdByAdminUserId: req.user.userId,
          reason: parsed.data.adminNotes,
          metadata: {
            targetKind: currentReport.targetKind,
            category: currentReport.category,
            subjectSnapshot: targetSubjectSnapshot,
            strikeCountBeforeAction: targetStrikeCount,
            sanctionMode: isImmediatePermanentBan ? "immediate_permanent_ban" : "strike_based",
            purge: purgeMetadata,
          },
          now,
        });

        await recordLegalAuditLedgerEvent(client, {
          eventType: "moderation_account_purge",
          actorHash: hashPrivacyActor(targetEmail, config.authCodePepper),
          accountRole: targetSubjectRow?.role || targetSubjectSnapshot.accountRole || null,
          source: isImmediatePermanentBan
            ? "admin_moderation_immediate_permanent_ban"
            : "admin_moderation_permanent_ban",
          metadata: {
            reportId,
            targetKind: currentReport.targetKind,
            category: currentReport.category,
            subjectSnapshot: targetSubjectSnapshot,
            sanctionMode: isImmediatePermanentBan ? "immediate_permanent_ban" : "strike_based",
            purge: purgeMetadata,
          },
          occurredAt: now,
        });

        await recordModerationActionWithSnapshot(client, {
          actionType: "permanent_ban_target_account",
          subjectUserId: currentReport.targetUserId,
          relatedReportId: reportId,
          createdByAdminUserId: req.user.userId,
          reason: parsed.data.adminNotes,
          currentReport,
          subjectFallback: targetSubjectFallback,
          emailStatus: "sent",
          strikeCountBeforeAction: targetStrikeCount,
          sanctionMode: isImmediatePermanentBan ? "immediate_permanent_ban" : "strike_based",
          purge: purgeMetadata,
          extraMetadata: {
            emailHash,
          },
          now,
        });

        await client.query("DELETE FROM users WHERE id = $1", [currentReport.targetUserId]);
      }

      await client.query("COMMIT");

      const report = await loadModerationReportById(pool, reportId);
      return res.json({ report });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return handleAuthError(res, error, logger);
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/moderation/users/:id/restore-profile", authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseIntegerId(req.params.id);
    const parsed = adminModerationReasonSchema.safeParse(req.body);

    if (!userId) {
      return res.status(400).json({ error: "validation_error" });
    }

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await restoreProfessionalProfile(client, { targetUserId: userId, now });
      await recordModerationActionWithSnapshot(client, {
        actionType: "restore_professional_profile",
        subjectUserId: userId,
        createdByAdminUserId: req.user.userId,
        reason: parsed.data.reason,
        subjectFallback: {
          name: "Perfil restaurado",
        },
        sanctionMode: "administrative_restore",
        now,
      });
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/moderation/users/:id/restore-account", authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseIntegerId(req.params.id);
    const parsed = adminModerationReasonSchema.safeParse(req.body);

    if (!userId) {
      return res.status(400).json({ error: "validation_error" });
    }

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await restoreUserAccount(client, { targetUserId: userId });
      await recordModerationActionWithSnapshot(client, {
        actionType: "restore_target_account",
        subjectUserId: userId,
        createdByAdminUserId: req.user.userId,
        reason: parsed.data.reason,
        subjectFallback: {
          name: "Conta restaurada",
        },
        sanctionMode: "administrative_restore",
        now,
      });
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/moderation/users/:id/lift-reporting-restriction", authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseIntegerId(req.params.id);
    const parsed = adminModerationReasonSchema.safeParse(req.body);

    if (!userId) {
      return res.status(400).json({ error: "validation_error" });
    }

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    const now = new Date();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await liftReportingRestriction(client, { targetUserId: userId });
      await recordModerationActionWithSnapshot(client, {
        actionType: "lift_reporting_restriction",
        subjectUserId: userId,
        createdByAdminUserId: req.user.userId,
        reason: parsed.data.reason,
        subjectFallback: {
          name: "Canal de denúncias reativado",
        },
        sanctionMode: "administrative_restore",
        now,
      });
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    } finally {
      client.release();
    }
  });

  app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const response = await authService.listAdminUsers({
        query: typeof req.query.query === "string" ? req.query.query : "",
      });
      return res.json(response);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/users/:id/promote-admin", authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseIntegerId(req.params.id);
    const parsed = adminModerationReasonSchema.safeParse(req.body);

    if (!userId) {
      return res.status(400).json({ error: "validation_error" });
    }

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const response = await authService.promoteUserToAdministrator({
        targetUserId: userId,
        createdByAdminUserId: req.user.userId,
        reason: parsed.data.reason,
      });
      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  app.post("/api/admin/users/:id/revoke-admin", authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseIntegerId(req.params.id);
    const parsed = adminModerationReasonSchema.safeParse(req.body);

    if (!userId) {
      return res.status(400).json({ error: "validation_error" });
    }

    if (!parsed.success) {
      return createValidationResponse(res, parsed.error);
    }

    try {
      const response = await authService.revokeAdministratorFromUser({
        targetUserId: userId,
        createdByAdminUserId: req.user.userId,
        reason: parsed.data.reason,
      });
      return res.json(response);
    } catch (error) {
      return handleAuthError(res, error, logger);
    }
  });

  if (enableTestRoutes) {
    app.get("/api/test/verification-code", async (req, res) => {
      const email = normalizeEmail(req.query.email);

      if (!email) {
        return res.status(400).json({ error: "validation_error" });
      }

      const emails = testState?.emails?.list?.({ to: email }) || [];
      const authEmail = [...emails]
        .reverse()
        .find((emailRecord) => emailRecord?.metadata?.kind === "auth-code");

      if (!authEmail?.metadata?.code) {
        return res.status(404).json({ error: "code_not_found" });
      }

      return res.json({
        code: authEmail.metadata.code,
        purpose: authEmail.metadata.purpose,
        challengeId: authEmail.metadata.challengeId || null,
      });
    });

    app.get("/api/test/emails", (_req, res) => {
      return res.json({
        emails: testState?.emails?.list() || [],
      });
    });

    app.post("/api/test/emails/reset", (_req, res) => {
      testState?.emails?.clear?.();
      return res.json({ ok: true });
    });

    app.post("/api/test/auth/reset", async (_req, res) => {
      await pool.query("DELETE FROM auth_rate_limits");
      return res.json({ ok: true });
    });

    app.post("/api/test/users/promote-admin", async (req, res) => {
      const email = normalizeEmail(req.body?.email);

      if (!email) {
        return res.status(400).json({ error: "validation_error" });
      }

      const userResult = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
      const userId = userResult.rows[0]?.id;

      if (!userId) {
        return res.status(404).json({ error: "user_not_found" });
      }

      try {
        await authService.promoteUserToAdministrator({
          targetUserId: userId,
          createdByAdminUserId: null,
          reason: "Promoção pela rota de teste.",
        });
        return res.json({ ok: true });
      } catch (error) {
        return handleAuthError(res, error, logger);
      }
    });

    app.post("/api/test/alerts/dispatch", async (_req, res) => {
      if (!dispatchAlerts) {
        return res.status(501).json({ error: "alerts_dispatch_unavailable" });
      }

      const summary = await dispatchAlerts();
      return res.json(summary);
    });
  }

  app.use((_req, res) => {
    return res.status(404).json({ error: "not_found" });
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ error: "payload_too_large" });
    }

    logger.error(error);
    return res.status(500).json({ error: "server_error" });
  });

  return app;
}

export { createApp };
