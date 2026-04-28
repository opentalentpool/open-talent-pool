import { z } from "zod";
import {
  AFFIRMATIVE_GENDER_GROUP_VALUES,
  AFFIRMATIVE_GROUP_VALUES,
  AFFIRMATIVE_POLICY_VERSION,
  AFFIRMATIVE_RACE_GROUP_VALUES,
  AFFIRMATIVE_USE_CASE_VALUES,
  hasAffirmativeFilters,
  normalizeAffirmativeGroupList,
} from "../src/lib/affirmative-config.js";
import {
  ACCOUNT_ROLE_VALUES,
  PUBLIC_ACCOUNT_ROLE_VALUES,
} from "../src/lib/account-roles.js";
import { LEGAL_POLICY_KEY } from "../src/lib/legal-policies.js";
import {
  MODERATION_REPORT_CATEGORY_VALUES,
  MODERATION_RESOLUTION_CODE_VALUES,
  MODERATION_TARGET_KIND_VALUES,
} from "../src/lib/moderation.js";

export const PUBLIC_SIGNUP_ROLES = PUBLIC_ACCOUNT_ROLE_VALUES;
export const ALL_ROLES = ACCOUNT_ROLE_VALUES;
export const SENIORITY_VALUES = ["junior", "pleno", "senior"];
export const WORK_MODEL_VALUES = ["remoto", "hibrido", "presencial"];
export const SAVED_SEARCH_ALERT_FREQUENCY_VALUES = ["disabled", "daily", "weekly", "biweekly", "monthly"];
export const AFFIRMATIVE_GROUP_VALUES_PUBLIC = AFFIRMATIVE_GROUP_VALUES;
export const AFFIRMATIVE_USE_CASE_VALUES_PUBLIC = AFFIRMATIVE_USE_CASE_VALUES;
export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

function normalizeStringInput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSavedSearchAlertFrequencyInput(value) {
  if (value === undefined || value === null || value === "") {
    return "daily";
  }

  return normalizeStringInput(value).toLowerCase();
}

function normalizeBooleanInput(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") return true;
    if (normalized === "false" || normalized === "") return false;
  }

  return Boolean(value);
}

function normalizeIntegerInput(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAffirmativeGroupListInput(value) {
  return normalizeAffirmativeGroupList(Array.isArray(value) ? value.map((item) => normalizeStringInput(item)) : []);
}

const optionalText = z.preprocess(normalizeStringInput, z.string().max(280).default(""));
const optionalLongText = z.preprocess(normalizeStringInput, z.string().max(4000).default(""));
const optionalUrl = z.preprocess(normalizeStringInput, z.string().max(500).default(""));
const optionalEmail = z.preprocess(
  (value) => {
    const normalized = normalizeStringInput(value).toLowerCase();
    return normalized || "";
  },
  z.union([z.literal(""), z.string().email().max(320)]).default(""),
);
const optionalState = z.preprocess(
  (value) => normalizeStringInput(value).toUpperCase(),
  z.union([z.literal(""), z.enum(BRAZILIAN_STATES)]).default(""),
);
const optionalSeniority = z.preprocess(
  normalizeStringInput,
  z.union([z.literal(""), z.enum(SENIORITY_VALUES)]).default(""),
);
const optionalWorkModel = z.preprocess(
  normalizeStringInput,
  z.union([z.literal(""), z.enum(WORK_MODEL_VALUES)]).default(""),
);
const optionalWorkModels = z.preprocess(
  (value) => Array.isArray(value) ? value.map((item) => normalizeStringInput(item)) : [],
  z.array(z.enum(WORK_MODEL_VALUES)).default([]),
);
const optionalAffirmativeGroups = (allowedValues) =>
  z.preprocess(
    normalizeAffirmativeGroupListInput,
    z.array(z.enum(allowedValues)).default([]),
  );
const requiredCaptchaToken = z.preprocess(normalizeStringInput, z.string().min(1).max(4096));
const requiredLegalAcceptance = z.preprocess(
  normalizeBooleanInput,
  z.boolean().refine((value) => value === true, {
    message: `Aceite obrigatório para ${LEGAL_POLICY_KEY.termsOfUse} e ${LEGAL_POLICY_KEY.privacyPolicy}.`,
  }),
);

const affirmativeProfileSchema = z.object({
  groups: z.preprocess(
    normalizeAffirmativeGroupListInput,
    z.array(z.enum(AFFIRMATIVE_GROUP_VALUES)).default([]),
  ),
  policyVersion: z.preprocess(normalizeStringInput, z.string().max(40).default("")),
  consentAcceptedAt: z.preprocess(
    normalizeStringInput,
    z.union([z.literal(""), z.string().datetime({ offset: true })]).default(""),
  ),
});

const affirmativeContextSchema = z.object({
  useCase: z.preprocess(normalizeStringInput, z.enum(AFFIRMATIVE_USE_CASE_VALUES)),
  vacancyReference: z.preprocess(normalizeStringInput, z.string().min(2).max(160)),
});

const affirmativeFiltersSchema = z.object({
  genderGroups: optionalAffirmativeGroups(AFFIRMATIVE_GENDER_GROUP_VALUES),
  raceGroups: optionalAffirmativeGroups(AFFIRMATIVE_RACE_GROUP_VALUES),
  pcdOnly: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
});

const optionalAffirmativeContextSchema = affirmativeContextSchema.optional();
const optionalAffirmativeFiltersSchema = affirmativeFiltersSchema.optional();

export const authSignUpSchema = z.object({
  name: z.preprocess(normalizeStringInput, z.string().min(2).max(120)),
  email: z.preprocess(normalizeStringInput, z.string().email().max(320)),
  role: z.enum(PUBLIC_SIGNUP_ROLES),
  acceptedLegalPolicies: requiredLegalAcceptance,
  captchaToken: requiredCaptchaToken,
});

export const authRequestCodeSchema = z.object({
  email: z.preprocess(normalizeStringInput, z.string().email().max(320)),
  captchaToken: requiredCaptchaToken,
});

export const authVerifySchema = z.object({
  challengeId: z.preprocess(normalizeStringInput, z.string().regex(/^[a-f0-9]{32}$/)),
  code: z.preprocess(normalizeStringInput, z.string().regex(/^\d{6}$/)),
});

export const profileContactEmailRequestSchema = z.object({
  nextContactEmail: z.preprocess(
    (value) => normalizeStringInput(value).toLowerCase(),
    z.string().email().max(320),
  ),
});

export const authActiveRoleSchema = z.object({
  role: z.preprocess(normalizeStringInput, z.enum(PUBLIC_ACCOUNT_ROLE_VALUES)),
});

export const authEnableRoleSchema = z.object({
  role: z.preprocess(normalizeStringInput, z.enum(PUBLIC_ACCOUNT_ROLE_VALUES)),
  makeActive: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
});

export const accountDeletionSchema = z.object({
  confirmEmail: z.preprocess(
    (value) => normalizeStringInput(value).toLowerCase(),
    z.string().email().max(320),
  ),
});

export const experienceSchema = z.object({
  id: z.preprocess(normalizeStringInput, z.string().max(120).default("")),
  role_title: z.preprocess(normalizeStringInput, z.string().max(140)),
  company_name: z.preprocess(normalizeStringInput, z.string().max(140)),
  start_date: z.preprocess(normalizeStringInput, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  end_date: z.preprocess(normalizeStringInput, z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default("")),
  is_current: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
  description: optionalLongText,
});

export const profileInputSchema = z.object({
  name: z.preprocess(normalizeStringInput, z.string().min(2).max(120)),
  city: optionalText,
  state: optionalState,
  bio: optionalLongText,
  headline: optionalText,
  linkedin: optionalUrl,
  github: optionalUrl,
  portfolio: optionalUrl,
  contactEmail: optionalEmail,
  showContactEmailToRecruiters: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
  skills: z.array(z.preprocess(normalizeStringInput, z.string().min(1).max(60))).max(50).default([]),
  experiences: z.array(experienceSchema).max(30).default([]),
  seniority: optionalSeniority,
  workModels: optionalWorkModels,
  workModel: optionalWorkModel,
  openToOpportunities: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
  isPublished: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
  affirmativeProfile: affirmativeProfileSchema.default({
    groups: [],
    policyVersion: "",
    consentAcceptedAt: "",
  }),
  affirmativeConsentAccepted: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
});

export const searchProfilesParamsSchema = z.object({
  q: z.preprocess(normalizeStringInput, z.string().max(120).default("")),
  seniority: optionalSeniority,
  workModel: optionalWorkModel,
  state: optionalState,
  openToOpportunities: z.preprocess(normalizeBooleanInput, z.boolean().default(false)),
  page: z.preprocess((value) => normalizeIntegerInput(value, 1), z.number().int().min(1).max(10_000).default(1)),
  pageSize: z.preprocess((value) => normalizeIntegerInput(value, 20), z.number().int().min(1).max(50).default(20)),
});

export const affirmativeSearchParamsSchema = searchProfilesParamsSchema.extend({
  affirmativeContext: affirmativeContextSchema,
  affirmativeFilters: affirmativeFiltersSchema,
}).superRefine((value, ctx) => {
  if (!hasAffirmativeFilters(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["affirmativeFilters"],
      message: "Selecione ao menos um critério afirmativo.",
    });
  }
});

export const recruiterFavoriteSchema = z.object({
  profileId: z.preprocess((value) => normalizeIntegerInput(value, Number.NaN), z.number().int().positive()),
});

export const savedSearchCriteriaSchema = searchProfilesParamsSchema
  .omit({ page: true, pageSize: true })
  .extend({
    q: z.preprocess(normalizeStringInput, z.string().max(120).default("")),
    affirmativeContext: optionalAffirmativeContextSchema,
    affirmativeFilters: optionalAffirmativeFiltersSchema,
  })
  .superRefine((value, ctx) => {
    const hasContext = Boolean(value.affirmativeContext);
    const hasFilters = hasAffirmativeFilters(value);

    if (!hasContext && !hasFilters) {
      return;
    }

    if (!hasContext) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["affirmativeContext"],
        message: "Informe o tipo da vaga afirmativa ou inclusiva.",
      });
    }

    if (!hasFilters) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["affirmativeFilters"],
        message: "Selecione ao menos um critério afirmativo.",
      });
    }
  });

export const affirmativePolicyAcceptanceSchema = z.object({
  policyVersion: z.preprocess(
    normalizeStringInput,
    z.literal(AFFIRMATIVE_POLICY_VERSION),
  ),
});

export const createSavedSearchSchema = z.object({
  name: z.preprocess(normalizeStringInput, z.string().min(2).max(120)),
  criteria: savedSearchCriteriaSchema,
  alertFrequency: z.preprocess(
    normalizeSavedSearchAlertFrequencyInput,
    z.enum(SAVED_SEARCH_ALERT_FREQUENCY_VALUES),
  ),
});

export const updateSavedSearchSchema = z
  .object({
    name: z.preprocess(normalizeStringInput, z.string().min(2).max(120)).optional(),
    criteria: savedSearchCriteriaSchema.optional(),
    alertFrequency: z.preprocess(
      (value) => (value === undefined ? undefined : normalizeStringInput(value).toLowerCase()),
      z.enum(SAVED_SEARCH_ALERT_FREQUENCY_VALUES).optional(),
    ),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const createModerationReportSchema = z.object({
  targetKind: z.preprocess(normalizeStringInput, z.enum(MODERATION_TARGET_KIND_VALUES)),
  targetRef: z.preprocess(normalizeStringInput, z.string().min(1).max(160)),
  category: z.preprocess(normalizeStringInput, z.enum(MODERATION_REPORT_CATEGORY_VALUES)),
  description: z.preprocess(normalizeStringInput, z.string().min(5).max(2000)),
});

export const resolveModerationReportSchema = z.object({
  decision: z.preprocess(normalizeStringInput, z.enum(MODERATION_RESOLUTION_CODE_VALUES)),
  adminNotes: z.preprocess(normalizeStringInput, z.string().min(3).max(2000)),
});

export const adminModerationReasonSchema = z.object({
  reason: z.preprocess(normalizeStringInput, z.string().min(3).max(2000)),
});

export function collectValidationIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
