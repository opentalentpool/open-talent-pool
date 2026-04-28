import {
  affirmativeSearchParamsSchema,
  searchProfilesParamsSchema,
  savedSearchCriteriaSchema,
  WORK_MODEL_VALUES,
} from "./contracts.js";
import {
  AFFIRMATIVE_POLICY_VERSION,
  createEmptyAffirmativeFilters,
  createEmptyAffirmativeProfile,
  hasAffirmativeFilters,
  normalizeAffirmativeGroupList,
  normalizeAffirmativeGroupValue,
} from "../src/lib/affirmative-config.js";

const PROFILE_STALE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;

export const PROFILE_DEFAULTS = Object.freeze({
  city: "",
  state: "",
  bio: "",
  headline: "",
  linkedin: "",
  github: "",
  portfolio: "",
  contactEmail: "",
  showContactEmailToRecruiters: false,
  skills: [],
  experiences: [],
  seniority: "",
  workModels: [],
  openToOpportunities: false,
  isPublished: false,
  affirmativeProfile: createEmptyAffirmativeProfile(),
});

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function normalizeWorkModelList(value, legacyValue) {
  const source = Array.isArray(value) ? value : value === undefined ? [legacyValue] : [];

  return WORK_MODEL_VALUES.filter((workModel) => source.includes(workModel));
}

function normalizeAffirmativeStringList(value) {
  return normalizeAffirmativeGroupList(Array.isArray(value) ? value.map(normalizeString) : []);
}

export function normalizeExperiences(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((experience) => ({
      id: normalizeString(experience?.id) || crypto.randomUUID(),
      role_title: normalizeString(experience?.role_title),
      company_name: normalizeString(experience?.company_name),
      start_date: normalizeString(experience?.start_date),
      end_date: normalizeString(experience?.end_date),
      is_current: Boolean(experience?.is_current),
      description: normalizeString(experience?.description),
    }))
    .filter((experience) => experience.role_title && experience.company_name && experience.start_date);
}

export function normalizeProfilePayload(payload = {}) {
  const affirmativeProfileInput = payload.affirmativeProfile || {};

  return {
    ...PROFILE_DEFAULTS,
    name: normalizeString(payload.name),
    city: normalizeString(payload.city),
    state: normalizeString(payload.state).toUpperCase(),
    bio: normalizeString(payload.bio),
    headline: normalizeString(payload.headline),
    linkedin: normalizeString(payload.linkedin),
    github: normalizeString(payload.github),
    portfolio: normalizeString(payload.portfolio),
    contactEmail: normalizeEmail(payload.contactEmail),
    showContactEmailToRecruiters: Boolean(payload.showContactEmailToRecruiters),
    skills: normalizeStringList(payload.skills),
    experiences: normalizeExperiences(payload.experiences),
    seniority: normalizeString(payload.seniority),
    workModels: normalizeWorkModelList(payload.workModels, payload.workModel),
    openToOpportunities: Boolean(payload.openToOpportunities),
    isPublished: Boolean(payload.isPublished),
    affirmativeProfile: {
      groups: normalizeAffirmativeStringList(affirmativeProfileInput.groups),
      policyVersion: normalizeString(affirmativeProfileInput.policyVersion),
      consentAcceptedAt: normalizeString(affirmativeProfileInput.consentAcceptedAt) || null,
    },
  };
}

export function resolveProfileContactEmail(profile, accountEmail) {
  return normalizeEmail(profile?.contactEmail) || normalizeEmail(accountEmail);
}

export function normalizeSearchCriteria(criteria = {}) {
  const parsed = searchProfilesParamsSchema.parse(criteria);

  return {
    q: parsed.q,
    seniority: parsed.seniority,
    workModel: parsed.workModel,
    state: parsed.state,
    openToOpportunities: parsed.openToOpportunities,
    page: parsed.page,
    pageSize: parsed.pageSize,
  };
}

export function normalizeSavedSearchCriteria(criteria = {}) {
  const parsed = savedSearchCriteriaSchema.parse(criteria);

  return {
    q: parsed.q,
    seniority: parsed.seniority,
    workModel: parsed.workModel,
    state: parsed.state,
    openToOpportunities: parsed.openToOpportunities,
    affirmativeContext: parsed.affirmativeContext
      ? {
          useCase: parsed.affirmativeContext.useCase,
          vacancyReference: parsed.affirmativeContext.vacancyReference,
        }
      : undefined,
    affirmativeFilters: parsed.affirmativeFilters
      ? {
          genderGroups: parsed.affirmativeFilters.genderGroups,
          raceGroups: parsed.affirmativeFilters.raceGroups,
          pcdOnly: parsed.affirmativeFilters.pcdOnly,
        }
      : undefined,
  };
}

export function normalizeAffirmativeSearchCriteria(criteria = {}) {
  const parsed = affirmativeSearchParamsSchema.parse(criteria);

  return {
    q: parsed.q,
    seniority: parsed.seniority,
    workModel: parsed.workModel,
    state: parsed.state,
    openToOpportunities: parsed.openToOpportunities,
    page: parsed.page,
    pageSize: parsed.pageSize,
    affirmativeContext: {
      useCase: parsed.affirmativeContext.useCase,
      vacancyReference: parsed.affirmativeContext.vacancyReference,
    },
    affirmativeFilters: {
      genderGroups: parsed.affirmativeFilters.genderGroups,
      raceGroups: parsed.affirmativeFilters.raceGroups,
      pcdOnly: parsed.affirmativeFilters.pcdOnly,
    },
  };
}

export function buildStoredAffirmativeProfile(profile, currentStoredProfile, consentAccepted, now = new Date()) {
  const groups = normalizeAffirmativeStringList(profile?.affirmativeProfile?.groups);
  const currentAffirmativeProfile = currentStoredProfile?.affirmativeProfile || createEmptyAffirmativeProfile();

  if (!groups.length) {
    return createEmptyAffirmativeProfile();
  }

  const hasCurrentConsent =
    currentAffirmativeProfile.policyVersion === AFFIRMATIVE_POLICY_VERSION &&
    Boolean(currentAffirmativeProfile.consentAcceptedAt);

  return {
    groups,
    policyVersion: AFFIRMATIVE_POLICY_VERSION,
    consentAcceptedAt: consentAccepted
      ? now.toISOString()
      : hasCurrentConsent
        ? currentAffirmativeProfile.consentAcceptedAt
        : null,
  };
}

export function validateAffirmativeProfileConsent(profile, currentStoredProfile, consentAccepted) {
  const groups = normalizeAffirmativeStringList(profile?.affirmativeProfile?.groups);

  if (!groups.length) {
    return null;
  }

  const currentAffirmativeProfile = currentStoredProfile?.affirmativeProfile || createEmptyAffirmativeProfile();
  const hasCurrentConsent =
    currentAffirmativeProfile.policyVersion === AFFIRMATIVE_POLICY_VERSION &&
    Boolean(currentAffirmativeProfile.consentAcceptedAt);

  if (consentAccepted || hasCurrentConsent) {
    return null;
  }

  return {
    path: "affirmativeConsentAccepted",
    message: "Confirme o uso inclusivo dos dados autodeclarados antes de salvar.",
  };
}

function getLatestExperienceDescription(profile) {
  return profile.experiences.find((experience) => experience.description)?.description || "";
}

function getBioExcerpt(profile) {
  const content = profile.bio || getLatestExperienceDescription(profile);

  if (!content) {
    return "";
  }

  return content.length > 180 ? `${content.slice(0, 177)}...` : content;
}

export function createPublicSlug(name, userId) {
  const base = normalizeString(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${base || "profissional"}-${userId}`;
}

export function getProfilePublicationIssues({ role, isVerified, profile, moderationBlockedAt = null }) {
  const issues = [];

  if (role !== "professional") {
    issues.push("Apenas profissionais podem publicar perfis públicos.");
  }

  if (!isVerified) {
    issues.push("Confirme o e-mail da conta antes de publicar o perfil.");
  }

  if (!profile.name) issues.push("Informe o nome completo.");
  if (!profile.headline) issues.push("Adicione um headline profissional.");
  if (!profile.city) issues.push("Informe a cidade.");
  if (!profile.state) issues.push("Selecione o estado.");
  if (!profile.seniority) issues.push("Selecione a senioridade.");
  if (!profile.workModels.length) issues.push("Selecione ao menos um modelo de trabalho.");
  if (!profile.skills.length) issues.push("Adicione pelo menos uma skill.");
  if (!profile.bio && !profile.experiences.length) {
    issues.push("Preencha a bio ou adicione ao menos uma experiência.");
  }

  if (moderationBlockedAt) {
    issues.push("Este perfil foi ocultado por moderação e depende de restauração administrativa antes de nova publicação.");
  }

  return issues;
}

export function hydrateOwnProfileRow(row) {
  const profile = normalizeProfilePayload({
    ...row?.profile_data,
    name: row?.profile_data?.name || row?.name || "",
    isPublished: Boolean(row?.is_published),
  });
  const hydratedProfile = {
    ...profile,
    contactEmail: resolveProfileContactEmail(profile, row?.email),
  };
  const publicationIssues = getProfilePublicationIssues({
    role: row?.role,
    isVerified: Boolean(row?.is_verified),
    profile: hydratedProfile,
    moderationBlockedAt: row?.moderation_blocked_at,
  });

  return {
    profile: hydratedProfile,
    publication: {
      isPublished: Boolean(row?.is_published),
      publicSlug: row?.public_slug || "",
      publishedAt: row?.published_at ? new Date(row.published_at).toISOString() : null,
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
      expiredAt: row?.expired_at ? new Date(row.expired_at).toISOString() : null,
      staleAfterAt: row?.updated_at
        ? new Date(new Date(row.updated_at).getTime() + PROFILE_STALE_AFTER_MS).toISOString()
        : null,
      freshnessStatus: row?.expired_at ? "expired" : "active",
      isPublishable: publicationIssues.length === 0,
      issues: publicationIssues,
      moderationBlockedAt: row?.moderation_blocked_at ? new Date(row.moderation_blocked_at).toISOString() : null,
      moderationBlockReason: row?.moderation_block_reason || null,
    },
  };
}

export function hydratePublicProfileRecord(row) {
  const profile = normalizeProfilePayload({
    ...row?.profile_data,
    name: row?.profile_data?.name || row?.name || "",
    isPublished: Boolean(row?.is_published),
  });

  return {
    id: Number(row.user_id),
    name: row.name || profile.name,
    publicSlug: row.public_slug || "",
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    profile,
  };
}

export function shapePublicProfileSummary(record) {
  return {
    id: record.id,
    name: record.name,
    publicSlug: record.publicSlug,
    headline: record.profile.headline,
    bioExcerpt: getBioExcerpt(record.profile),
    city: record.profile.city,
    state: record.profile.state,
    seniority: record.profile.seniority,
    workModels: record.profile.workModels,
    openToOpportunities: record.profile.openToOpportunities,
    skills: record.profile.skills,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
  };
}

export function shapePublicProfileDetail(record) {
  return {
    id: record.id,
    name: record.name,
    publicSlug: record.publicSlug,
    headline: record.profile.headline,
    bio: record.profile.bio,
    city: record.profile.city,
    state: record.profile.state,
    seniority: record.profile.seniority,
    workModels: record.profile.workModels,
    openToOpportunities: record.profile.openToOpportunities,
    skills: record.profile.skills,
    experiences: record.profile.experiences,
    links: {
      linkedin: record.profile.linkedin,
      github: record.profile.github,
      portfolio: record.profile.portfolio,
    },
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
  };
}

function buildSearchableContent(record) {
  const profile = record.profile;
  const experiences = profile.experiences
    .map((experience) =>
      [experience.role_title, experience.company_name, experience.description]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");

  return [
    record.name,
    profile.headline,
    profile.bio,
    profile.city,
    profile.state,
    profile.seniority,
    profile.workModels.join(" "),
    profile.skills.join(" "),
    experiences,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applyCriteria(records, criteria) {
  return records.filter((record) => {
    if (criteria.seniority && record.profile.seniority !== criteria.seniority) return false;
    if (criteria.workModel && !record.profile.workModels.includes(criteria.workModel)) return false;
    if (criteria.state && record.profile.state !== criteria.state) return false;
    if (criteria.openToOpportunities && !record.profile.openToOpportunities) return false;

    return true;
  });
}

function matchesAffirmativeCriteria(record, criteria) {
  if (!hasAffirmativeFilters(criteria)) {
    return true;
  }

  const normalizedFilters = criteria.affirmativeFilters || createEmptyAffirmativeFilters();
  const groups = normalizeAffirmativeStringList(record.profile.affirmativeProfile?.groups);

  if (normalizedFilters.genderGroups.length > 0) {
    const matchesGender = normalizedFilters.genderGroups.some((group) =>
      groups.includes(normalizeAffirmativeGroupValue(group)),
    );

    if (!matchesGender) {
      return false;
    }
  }

  if (normalizedFilters.raceGroups.length > 0) {
    const matchesRace = normalizedFilters.raceGroups.some((group) =>
      groups.includes(normalizeAffirmativeGroupValue(group)),
    );

    if (!matchesRace) {
      return false;
    }
  }

  if (normalizedFilters.pcdOnly && !groups.includes("pcd")) {
    return false;
  }

  return true;
}

function prioritizeAffirmativeRecords(records, criteria, getRecord = (item) => item) {
  if (!hasAffirmativeFilters(criteria)) {
    return records;
  }

  const prioritized = [];
  const fallback = [];

  for (const item of records) {
    if (matchesAffirmativeCriteria(getRecord(item), criteria)) {
      prioritized.push(item);
    } else {
      fallback.push(item);
    }
  }

  return [...prioritized, ...fallback];
}

function comparePublicationDates(left, right) {
  return new Date(right || 0).getTime() - new Date(left || 0).getTime();
}

function manualRankRecords(records, query) {
  const tokens = normalizeString(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  return records
    .map((record) => {
      const headline = record.profile.headline.toLowerCase();
      const name = record.name.toLowerCase();
      const bio = record.profile.bio.toLowerCase();
      const skills = record.profile.skills.join(" ").toLowerCase();
      const experiences = record.profile.experiences
        .map((experience) => `${experience.role_title} ${experience.company_name} ${experience.description}`.toLowerCase())
        .join(" ");

      let score = 0;

      for (const token of tokens) {
        if (name.includes(token)) score += 5;
        if (headline.includes(token)) score += 4;
        if (skills.includes(token)) score += 3;
        if (bio.includes(token)) score += 2;
        if (experiences.includes(token)) score += 2;
      }

      if (buildSearchableContent(record).includes(tokens.join(" "))) {
        score += 4;
      }

      return {
        record,
        rank: score,
      };
    })
    .filter((item) => item.rank > 0);
}

async function getFullTextRanks(pool, query) {
  const result = await pool.query(
    `
      WITH search_documents AS (
        SELECT
          up.user_id,
          (
            setweight(to_tsvector('simple', COALESCE(u.name, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(up.profile_data->>'headline', '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(up.profile_data->>'bio', '')), 'B') ||
            setweight(
              to_tsvector(
                'simple',
                COALESCE(
                  (
                    SELECT string_agg(skill, ' ')
                    FROM jsonb_array_elements_text(COALESCE(up.profile_data->'skills', '[]'::jsonb)) AS skill
                  ),
                  ''
                )
              ),
              'B'
            ) ||
            setweight(
              to_tsvector(
                'simple',
                COALESCE(
                  (
                    SELECT string_agg(
                      concat_ws(' ', experience->>'role_title', experience->>'company_name', experience->>'description'),
                      ' '
                    )
                    FROM jsonb_array_elements(COALESCE(up.profile_data->'experiences', '[]'::jsonb)) AS experience
                  ),
                  ''
                )
              ),
              'C'
            )
          ) AS document
        FROM user_profiles up
        INNER JOIN users u ON u.id = up.user_id
        INNER JOIN user_roles user_role ON user_role.user_id = u.id
        WHERE up.is_published = true
          AND up.moderation_blocked_at IS NULL
          AND u.account_status = 'active'
          AND user_role.role = 'professional'
          AND u.is_verified = true
      )
      SELECT
        user_id,
        ts_rank(document, plainto_tsquery('simple', $1)) AS rank
      FROM search_documents
      WHERE document @@ plainto_tsquery('simple', $1)
      ORDER BY rank DESC, user_id DESC
    `,
    [query],
  );

  return new Map(
    result.rows.map((row) => [Number(row.user_id), Number(row.rank)]),
  );
}

function rankRecords(records, ftsRanks, query) {
  if (ftsRanks && ftsRanks.size > 0) {
    return records
      .map((record) => ({
        record,
        rank: ftsRanks.get(record.id) || 0,
      }))
      .filter((item) => item.rank > 0);
  }

  return manualRankRecords(records, query);
}

function sortByRank(left, right) {
  return (
    right.rank - left.rank ||
    Number(right.record.profile.openToOpportunities) - Number(left.record.profile.openToOpportunities) ||
    comparePublicationDates(left.record.publishedAt, right.record.publishedAt) ||
    comparePublicationDates(left.record.updatedAt, right.record.updatedAt) ||
    right.record.id - left.record.id
  );
}

function sortWithoutQuery(left, right) {
  return (
    Number(right.profile.openToOpportunities) - Number(left.profile.openToOpportunities) ||
    comparePublicationDates(left.publishedAt, right.publishedAt) ||
    comparePublicationDates(left.updatedAt, right.updatedAt) ||
    right.id - left.id
  );
}

export async function listPublishedProfileRecords(pool) {
  const result = await pool.query(
    `
      SELECT
        u.id AS user_id,
        u.name,
        up.profile_data,
        up.is_published,
        up.public_slug,
        up.published_at,
        up.updated_at
      FROM users u
      INNER JOIN user_profiles up ON up.user_id = u.id
      INNER JOIN user_roles user_role ON user_role.user_id = u.id
      WHERE user_role.role = 'professional'
        AND u.is_verified = true
        AND u.account_status = 'active'
        AND up.is_published = true
        AND up.moderation_blocked_at IS NULL
      ORDER BY up.published_at DESC NULLS LAST, up.updated_at DESC NULLS LAST, u.id DESC
    `,
  );

  return result.rows.map(hydratePublicProfileRecord);
}

export async function searchPublishedProfiles(pool, rawCriteria = {}) {
  const criteria = normalizeSearchCriteria(rawCriteria);
  const allPublishedRecords = await listPublishedProfileRecords(pool);
  const filteredRecords = applyCriteria(allPublishedRecords, criteria);

  if (!criteria.q) {
    const orderedRecords = [...filteredRecords].sort(sortWithoutQuery);
    const start = (criteria.page - 1) * criteria.pageSize;
    const items = orderedRecords.slice(start, start + criteria.pageSize).map(shapePublicProfileSummary);

    return {
      items,
      total: orderedRecords.length,
      page: criteria.page,
      pageSize: criteria.pageSize,
    };
  }

  let ftsRanks = null;

  try {
    ftsRanks = await getFullTextRanks(pool, criteria.q);
  } catch {
    ftsRanks = null;
  }

  const rankedRecords = rankRecords(filteredRecords, ftsRanks, criteria.q).sort(sortByRank);
  const start = (criteria.page - 1) * criteria.pageSize;
  const items = rankedRecords.slice(start, start + criteria.pageSize).map((item) => shapePublicProfileSummary(item.record));

  return {
    items,
    total: rankedRecords.length,
    page: criteria.page,
    pageSize: criteria.pageSize,
  };
}

export async function searchAffirmativeProfiles(pool, rawCriteria = {}) {
  const criteria = normalizeAffirmativeSearchCriteria(rawCriteria);
  const allPublishedRecords = await listPublishedProfileRecords(pool);
  const filteredRecords = applyCriteria(allPublishedRecords, criteria);

  if (!criteria.q) {
    const orderedRecords = prioritizeAffirmativeRecords([...filteredRecords].sort(sortWithoutQuery), criteria);
    const start = (criteria.page - 1) * criteria.pageSize;
    const items = orderedRecords.slice(start, start + criteria.pageSize).map(shapePublicProfileSummary);

    return {
      items,
      total: orderedRecords.length,
      page: criteria.page,
      pageSize: criteria.pageSize,
    };
  }

  let ftsRanks = null;

  try {
    ftsRanks = await getFullTextRanks(pool, criteria.q);
  } catch {
    ftsRanks = null;
  }

  const rankedRecords = prioritizeAffirmativeRecords(
    rankRecords(filteredRecords, ftsRanks, criteria.q).sort(sortByRank),
    criteria,
    (item) => item.record,
  );
  const start = (criteria.page - 1) * criteria.pageSize;
  const items = rankedRecords.slice(start, start + criteria.pageSize).map((item) => shapePublicProfileSummary(item.record));

  return {
    items,
    total: rankedRecords.length,
    page: criteria.page,
    pageSize: criteria.pageSize,
  };
}
