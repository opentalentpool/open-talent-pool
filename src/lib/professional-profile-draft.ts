import { z } from "zod";
import { WORK_MODEL_VALUES, normalizeWorkModelList } from "@/lib/profile-options";
import type { Experience, ProfileData } from "@/types/profile";

export const PROFESSIONAL_PROFILE_DRAFT_VERSION = 2;
export const PROFESSIONAL_PROFILE_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PROFESSIONAL_PROFILE_DRAFT_STORAGE_PREFIX = `professional_profile_draft:v${PROFESSIONAL_PROFILE_DRAFT_VERSION}:`;
const PROFESSIONAL_PROFILE_DRAFT_STORAGE_KEY_REGEX = /^professional_profile_draft:v\d+:\d+$/;

type ProfessionalProfileDraftStatus = "missing" | "invalid" | "expired" | "valid";
type PersistedProfessionalProfileDraftProfile = Omit<ProfileData, "affirmativeProfile">;

export interface ProfessionalProfileDraftSnapshot {
  profile: ProfileData;
  affirmativeConsentAccepted: boolean;
  newSkill: string;
  newExperience: Experience;
}

export interface ProfessionalProfileDraftPayload {
  profile: PersistedProfessionalProfileDraftProfile;
  newSkill: string;
  newExperience: Experience;
  version: number;
  userId: number;
  updatedAt: number;
  sourcePublicationUpdatedAt: string | null;
}

const senioritySchema = z.enum(["", "junior", "pleno", "senior"]);
const workModelSchema = z.enum(WORK_MODEL_VALUES as [string, ...string[]]);
const experienceSchema = z.object({
  id: z.string(),
  role_title: z.string(),
  company_name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  is_current: z.boolean(),
  seniority: senioritySchema.default(""),
  description: z.string(),
  positions: z.array(z.object({
    id: z.string(),
    role_title: z.string(),
    seniority: senioritySchema.default(""),
    start_date: z.string(),
    end_date: z.string(),
    is_current: z.boolean(),
    description: z.string(),
  })).default([]),
});
const educationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  description: z.string(),
});
const certificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  issued_at: z.string(),
  credential_url: z.string(),
  description: z.string(),
});
const languageSchema = z.object({
  id: z.string(),
  name: z.string(),
  proficiency: z.string(),
});
const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  url: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  description: z.string(),
  skills: z.array(z.string()),
});
const publicationSchema = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string(),
  published_at: z.string(),
  description: z.string(),
});
const volunteerExperienceSchema = z.object({
  id: z.string(),
  organization: z.string(),
  role: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  is_current: z.boolean(),
  description: z.string(),
});
const awardSchema = z.object({
  id: z.string(),
  title: z.string(),
  issuer: z.string(),
  awarded_at: z.string(),
  description: z.string(),
});
const courseSchema = z.object({
  id: z.string(),
  name: z.string(),
  institution: z.string(),
  completed_at: z.string(),
  description: z.string(),
});
const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  is_current: z.boolean(),
  description: z.string(),
});
const profileSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const profile = value as Record<string, unknown>;

  return {
    ...profile,
    workModels: normalizeWorkModelList(profile.workModels, profile.workModel),
  };
}, z.object({
  name: z.string(),
  city: z.string(),
  state: z.string(),
  bio: z.string(),
  headline: z.string(),
  linkedin: z.string(),
  github: z.string(),
  portfolio: z.string(),
  contactEmail: z.string(),
  showContactEmailToRecruiters: z.boolean(),
  skills: z.array(z.string()),
  experiences: z.array(experienceSchema),
  educations: z.array(educationSchema).default([]),
  certifications: z.array(certificationSchema).default([]),
  languages: z.array(languageSchema).default([]),
  projects: z.array(projectSchema).default([]),
  publications: z.array(publicationSchema).default([]),
  volunteerExperiences: z.array(volunteerExperienceSchema).default([]),
  awards: z.array(awardSchema).default([]),
  courses: z.array(courseSchema).default([]),
  organizations: z.array(organizationSchema).default([]),
  seniority: senioritySchema,
  workModels: z.array(workModelSchema),
  openToOpportunities: z.boolean(),
  isPublished: z.boolean(),
}));
const persistedProfessionalProfileDraftSnapshotSchema = z.object({
  profile: profileSchema,
  newSkill: z.string(),
  newExperience: experienceSchema,
});
const professionalProfileDraftPayloadSchema = persistedProfessionalProfileDraftSnapshotSchema.extend({
  version: z.literal(PROFESSIONAL_PROFILE_DRAFT_VERSION),
  userId: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  sourcePublicationUpdatedAt: z.string().nullable(),
});

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isExperienceDraftEmpty(experience: Experience) {
  return !(
    experience.role_title ||
    experience.company_name ||
    experience.start_date ||
    experience.end_date ||
    experience.description ||
    experience.is_current ||
    experience.seniority ||
    experience.positions.length > 0
  );
}

function createPersistedProfessionalProfileDraftProfile(profile: ProfileData): PersistedProfessionalProfileDraftProfile {
  const { affirmativeProfile: _ignoredAffirmativeProfile, ...persistedProfile } = profile;

  return persistedProfile;
}

function createPersistedProfessionalProfileDraftSnapshot(snapshot: ProfessionalProfileDraftSnapshot) {
  return {
    profile: createPersistedProfessionalProfileDraftProfile(snapshot.profile),
    newSkill: snapshot.newSkill,
    newExperience: snapshot.newExperience,
  };
}

function serializeProfessionalProfileDraftSnapshot(snapshot: ProfessionalProfileDraftSnapshot) {
  return JSON.stringify(createPersistedProfessionalProfileDraftSnapshot(snapshot));
}

function listProfessionalProfileDraftKeys() {
  if (!canUseLocalStorage()) {
    return [];
  }

  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((value): value is string => Boolean(value))
    .filter((key) => PROFESSIONAL_PROFILE_DRAFT_STORAGE_KEY_REGEX.test(key));
}

export function createEmptyExperienceDraft(): Experience {
  return {
    id: "",
    role_title: "",
    company_name: "",
    start_date: "",
    end_date: "",
    is_current: false,
    seniority: "",
    description: "",
    positions: [],
  };
}

export function createProfessionalProfileDraftSnapshot({
  profile,
  affirmativeConsentAccepted,
  newSkill,
  newExperience,
}: ProfessionalProfileDraftSnapshot): ProfessionalProfileDraftSnapshot {
  return {
    profile,
    affirmativeConsentAccepted,
    newSkill,
    newExperience,
  };
}

export function createProfessionalProfileDraftBaseline(profile: ProfileData, affirmativeConsentAccepted: boolean) {
  return createProfessionalProfileDraftSnapshot({
    profile,
    affirmativeConsentAccepted,
    newSkill: "",
    newExperience: createEmptyExperienceDraft(),
  });
}

export function getProfessionalProfileDraftStorageKey(userId: number) {
  return `${PROFESSIONAL_PROFILE_DRAFT_STORAGE_PREFIX}${userId}`;
}

export function hasProfessionalProfileDraftAuxiliaryState(snapshot: ProfessionalProfileDraftSnapshot) {
  return Boolean(snapshot.newSkill.trim()) || !isExperienceDraftEmpty(snapshot.newExperience);
}

export function clearProfessionalProfileDraft(userId: number) {
  if (!canUseLocalStorage()) {
    return;
  }

  listProfessionalProfileDraftKeys()
    .filter((key) => key.endsWith(`:${userId}`))
    .forEach((key) => {
      window.localStorage.removeItem(key);
    });
}

export function clearLegacyProfessionalProfileDrafts(userId: number) {
  if (!canUseLocalStorage()) {
    return;
  }

  const currentStorageKey = getProfessionalProfileDraftStorageKey(userId);

  listProfessionalProfileDraftKeys()
    .filter((key) => key.endsWith(`:${userId}`) && key !== currentStorageKey)
    .forEach((key) => {
      window.localStorage.removeItem(key);
    });
}

export function clearAllProfessionalProfileDrafts() {
  if (!canUseLocalStorage()) {
    return;
  }

  listProfessionalProfileDraftKeys().forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

export function loadProfessionalProfileDraft(
  userId: number,
  now = Date.now(),
): { status: ProfessionalProfileDraftStatus; draft: ProfessionalProfileDraftPayload | null } {
  if (!canUseLocalStorage()) {
    return { status: "missing", draft: null };
  }

  const storageKey = getProfessionalProfileDraftStorageKey(userId);
  const rawValue = window.localStorage.getItem(storageKey);

  if (!rawValue) {
    return { status: "missing", draft: null };
  }

  try {
    const parsed = professionalProfileDraftPayloadSchema.safeParse(JSON.parse(rawValue));

    if (!parsed.success || parsed.data.userId !== userId) {
      window.localStorage.removeItem(storageKey);
      return { status: "invalid", draft: null };
    }

    if (parsed.data.updatedAt + PROFESSIONAL_PROFILE_DRAFT_TTL_MS <= now) {
      window.localStorage.removeItem(storageKey);
      return { status: "expired", draft: null };
    }

    return { status: "valid", draft: parsed.data };
  } catch {
    window.localStorage.removeItem(storageKey);
    return { status: "invalid", draft: null };
  }
}

export function persistProfessionalProfileDraft({
  userId,
  currentSnapshot,
  baselineSnapshot,
  sourcePublicationUpdatedAt,
  now = Date.now(),
}: {
  userId: number;
  currentSnapshot: ProfessionalProfileDraftSnapshot;
  baselineSnapshot: ProfessionalProfileDraftSnapshot;
  sourcePublicationUpdatedAt: string | null;
  now?: number;
}) {
  if (!canUseLocalStorage()) {
    return false;
  }

  const storageKey = getProfessionalProfileDraftStorageKey(userId);

  if (
    serializeProfessionalProfileDraftSnapshot(currentSnapshot) ===
    serializeProfessionalProfileDraftSnapshot(baselineSnapshot)
  ) {
    window.localStorage.removeItem(storageKey);
    return false;
  }

  const payload: ProfessionalProfileDraftPayload = {
    version: PROFESSIONAL_PROFILE_DRAFT_VERSION,
    userId,
    updatedAt: now,
    sourcePublicationUpdatedAt,
    ...createPersistedProfessionalProfileDraftSnapshot(currentSnapshot),
  };

  window.localStorage.setItem(storageKey, JSON.stringify(payload));
  return true;
}
