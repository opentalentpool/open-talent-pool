import { createEmptyProfileData, type FavoriteProfile, type ProfileData, type PublicProfileDetail, type PublicProfileSummary, type WorkModel } from "@/types/profile";
import { normalizeWorkModelList } from "@/lib/profile-options";

type LegacyWorkModelCarrier = {
  workModel?: unknown;
  workModels?: unknown;
};

type PartialProfileLike = Partial<ProfileData> & LegacyWorkModelCarrier;

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
    experiences: Array.isArray(nextProfile?.experiences) ? nextProfile.experiences : defaults.experiences,
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
  return normalizeRecordWorkModels(profile);
}

export function normalizeFavoriteProfileInput(profile: FavoriteProfile & LegacyWorkModelCarrier): FavoriteProfile {
  return normalizeRecordWorkModels(profile);
}
