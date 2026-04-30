import {
  createEmptyProfileData,
  type Certification,
  type Education,
  type Experience,
  type ExperiencePosition,
  type FavoriteProfile,
  type Language,
  type ProfileData,
  type Project,
  type PublicProfileDetail,
  type PublicProfileSummary,
  type Seniority,
  type WorkModel,
} from "@/types/profile";
import { normalizeWorkModelList } from "@/lib/profile-options";

type LegacyWorkModelCarrier = {
  workModel?: unknown;
  workModels?: unknown;
};

type PartialProfileLike = Partial<ProfileData> & LegacyWorkModelCarrier;
const SENIORITY_VALUES: Seniority[] = ["", "junior", "pleno", "senior"];

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeSeniority(value: unknown): Seniority {
  return SENIORITY_VALUES.includes(value as Seniority) ? value as Seniority : "";
}

function normalizeExperiencePosition(value: unknown): ExperiencePosition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const position = value as Partial<ExperiencePosition>;

  if (!position.role_title || !position.start_date) return null;

  return {
    id: normalizeString(position.id),
    role_title: normalizeString(position.role_title),
    seniority: normalizeSeniority(position.seniority),
    start_date: normalizeString(position.start_date),
    end_date: position.is_current ? "" : normalizeString(position.end_date),
    is_current: Boolean(position.is_current),
    description: normalizeString(position.description),
  };
}

function normalizeExperiences(value: unknown): Experience[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;

      const experience = item as Partial<Experience>;
      const positions = Array.isArray(experience.positions)
        ? experience.positions.map(normalizeExperiencePosition).filter((position): position is ExperiencePosition => Boolean(position))
        : [];
      const fallbackPosition = normalizeExperiencePosition({
        id: experience.id,
        role_title: experience.role_title,
        seniority: experience.seniority,
        start_date: experience.start_date,
        end_date: experience.end_date,
        is_current: experience.is_current,
        description: experience.description,
      });
      const nextPositions = positions.length ? positions : fallbackPosition ? [fallbackPosition] : [];
      const currentPosition = nextPositions.find((position) => position.is_current);
      const primaryPosition = currentPosition || nextPositions.at(-1) || nextPositions[0] || null;

      if (!experience.company_name || !primaryPosition) return null;

      return {
        id: normalizeString(experience.id),
        role_title: normalizeString(experience.role_title) || primaryPosition.role_title,
        company_name: normalizeString(experience.company_name),
        start_date: normalizeString(experience.start_date) || nextPositions[0]?.start_date || "",
        end_date: experience.is_current || primaryPosition.is_current ? "" : normalizeString(experience.end_date) || primaryPosition.end_date,
        is_current: Boolean(experience.is_current) || Boolean(primaryPosition.is_current),
        seniority: normalizeSeniority(experience.seniority) || primaryPosition.seniority,
        description: normalizeString(experience.description) || primaryPosition.description,
        positions: nextPositions,
      };
    })
    .filter((experience): experience is Experience => Boolean(experience));
}

function normalizeEducations(value: unknown): Education[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => item as Partial<Education>)
    .filter((item) => typeof item?.institution === "string" && item.institution.length > 0)
    .map((education) => ({
      id: normalizeString(education.id),
      institution: normalizeString(education.institution),
      degree: normalizeString(education.degree),
      field: normalizeString(education.field),
      start_date: normalizeString(education.start_date),
      end_date: normalizeString(education.end_date),
      description: normalizeString(education.description),
    }));
}

function normalizeCertifications(value: unknown): Certification[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => item as Partial<Certification>)
    .filter((item) => typeof item?.name === "string" && item.name.length > 0)
    .map((certification) => ({
      id: normalizeString(certification.id),
      name: normalizeString(certification.name),
      issuer: normalizeString(certification.issuer),
      issued_at: normalizeString(certification.issued_at),
      credential_url: normalizeString(certification.credential_url),
      description: normalizeString(certification.description),
    }));
}

function normalizeLanguages(value: unknown): Language[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => item as Partial<Language>)
    .filter((item) => typeof item?.name === "string" && item.name.length > 0)
    .map((language) => ({
      id: normalizeString(language.id),
      name: normalizeString(language.name),
      proficiency: normalizeString(language.proficiency),
    }));
}

function normalizeProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => item as Partial<Project>)
    .filter((item) => typeof item?.name === "string" && item.name.length > 0)
    .map((project) => ({
      id: normalizeString(project.id),
      name: normalizeString(project.name),
      role: normalizeString(project.role),
      url: normalizeString(project.url),
      start_date: normalizeString(project.start_date),
      end_date: normalizeString(project.end_date),
      description: normalizeString(project.description),
      skills: normalizeStringList(project.skills),
    }));
}

function normalizeGenericItems<T extends { id: string } & Record<string, unknown>>(
  value: unknown,
  requiredField: keyof T,
  defaults: T,
): T[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => item as Partial<T>)
    .filter((item) => typeof item?.[requiredField] === "string" && String(item[requiredField]).length > 0)
    .map((item) => ({
      ...defaults,
      ...item,
      id: normalizeString(item.id),
    }) as T);
}

function normalizeRecordWorkModels<T extends LegacyWorkModelCarrier>(record: T): Omit<T, "workModel"> & { workModels: WorkModel[] } {
  const { workModel: _legacyWorkModel, ...nextRecord } = record;

  return {
    ...nextRecord,
    workModels: normalizeWorkModelList(record.workModels, record.workModel),
  };
}

export function normalizeProfileDataInput(
  nextProfile: PartialProfileLike | undefined,
  fallbackName = "",
  fallbackContactEmail = "",
): ProfileData {
  const { workModel: _legacyWorkModel, ...nextProfileWithoutLegacyWorkModel } = nextProfile || {};
  const defaults = createEmptyProfileData(
    typeof nextProfile?.name === "string" && nextProfile.name ? nextProfile.name : fallbackName,
    typeof nextProfile?.contactEmail === "string" && nextProfile.contactEmail ? nextProfile.contactEmail : fallbackContactEmail,
  );

  return {
    ...defaults,
    ...nextProfileWithoutLegacyWorkModel,
    name: typeof nextProfile?.name === "string" && nextProfile.name ? nextProfile.name : fallbackName,
    contactEmail:
      typeof nextProfile?.contactEmail === "string" && nextProfile.contactEmail
        ? nextProfile.contactEmail
        : defaults.contactEmail,
    skills: Array.isArray(nextProfile?.skills) ? nextProfile.skills : defaults.skills,
    experiences: normalizeExperiences(nextProfile?.experiences),
    educations: normalizeEducations(nextProfile?.educations),
    certifications: normalizeCertifications(nextProfile?.certifications),
    languages: normalizeLanguages(nextProfile?.languages),
    projects: normalizeProjects(nextProfile?.projects),
    publications: normalizeGenericItems(nextProfile?.publications, "title", {
      id: "",
      title: "",
      publisher: "",
      url: "",
      published_at: "",
      description: "",
    }),
    volunteerExperiences: normalizeGenericItems(nextProfile?.volunteerExperiences, "organization", {
      id: "",
      organization: "",
      role: "",
      start_date: "",
      end_date: "",
      is_current: false,
      description: "",
    }),
    awards: normalizeGenericItems(nextProfile?.awards, "title", {
      id: "",
      title: "",
      issuer: "",
      awarded_at: "",
      description: "",
    }),
    courses: normalizeGenericItems(nextProfile?.courses, "name", {
      id: "",
      name: "",
      institution: "",
      completed_at: "",
      description: "",
    }),
    organizations: normalizeGenericItems(nextProfile?.organizations, "name", {
      id: "",
      name: "",
      role: "",
      start_date: "",
      end_date: "",
      is_current: false,
      description: "",
    }),
    workModels: normalizeWorkModelList(nextProfile?.workModels, nextProfile?.workModel),
    affirmativeProfile: {
      ...defaults.affirmativeProfile,
      ...(nextProfile?.affirmativeProfile || {}),
      groups: Array.isArray(nextProfile?.affirmativeProfile?.groups)
        ? nextProfile.affirmativeProfile.groups
        : defaults.affirmativeProfile.groups,
    },
  };
}

export function normalizePublicProfileSummaryInput(profile: PublicProfileSummary & LegacyWorkModelCarrier): PublicProfileSummary {
  return normalizeRecordWorkModels(profile);
}

export function normalizePublicProfileDetailInput(profile: PublicProfileDetail & LegacyWorkModelCarrier): PublicProfileDetail {
  const normalizedProfile = normalizeRecordWorkModels(profile);

  return {
    ...normalizedProfile,
    experiences: normalizeExperiences(profile.experiences),
    educations: normalizeEducations(profile.educations),
    certifications: normalizeCertifications(profile.certifications),
    languages: normalizeLanguages(profile.languages),
    projects: normalizeProjects(profile.projects),
    publications: normalizeGenericItems(profile.publications, "title", {
      id: "",
      title: "",
      publisher: "",
      url: "",
      published_at: "",
      description: "",
    }),
    volunteerExperiences: normalizeGenericItems(profile.volunteerExperiences, "organization", {
      id: "",
      organization: "",
      role: "",
      start_date: "",
      end_date: "",
      is_current: false,
      description: "",
    }),
    awards: normalizeGenericItems(profile.awards, "title", {
      id: "",
      title: "",
      issuer: "",
      awarded_at: "",
      description: "",
    }),
    courses: normalizeGenericItems(profile.courses, "name", {
      id: "",
      name: "",
      institution: "",
      completed_at: "",
      description: "",
    }),
    organizations: normalizeGenericItems(profile.organizations, "name", {
      id: "",
      name: "",
      role: "",
      start_date: "",
      end_date: "",
      is_current: false,
      description: "",
    }),
  };
}

export function normalizeFavoriteProfileInput(profile: FavoriteProfile & LegacyWorkModelCarrier): FavoriteProfile {
  return normalizeRecordWorkModels(profile);
}
