export const AFFIRMATIVE_POLICY_VERSION = "2026-04-27.v3";
export const AFFIRMATIVE_POLICY_KEY = "inclusive-search";

export const AFFIRMATIVE_GROUP_VALUES = [
  "women",
  "black_people",
  "indigenous_people",
  "lgbtqiapn_people",
  "pcd",
];

export const AFFIRMATIVE_GROUP_LABEL = {
  women: "Mulheres",
  black_people: "Pessoas negras",
  indigenous_people: "Pessoas indígenas",
  lgbtqiapn_people: "Pessoas LGBTQIAPN+",
  pcd: "Pessoas com deficiência",
};

export const AFFIRMATIVE_GENDER_GROUP_VALUES = [
  "women",
  "lgbtqiapn_people",
];

export const AFFIRMATIVE_RACE_GROUP_VALUES = [
  "black_people",
  "indigenous_people",
];

export const AFFIRMATIVE_USE_CASE_VALUES = [
  "vaga_afirmativa",
  "vaga_inclusiva",
];

export const AFFIRMATIVE_USE_CASE_LABEL = {
  vaga_afirmativa: "Vaga afirmativa",
  vaga_inclusiva: "Vaga inclusiva",
};

export function createEmptyAffirmativeProfile() {
  return {
    groups: [],
    policyVersion: "",
    consentAcceptedAt: null,
  };
}

export function createEmptyAffirmativeFilters() {
  return {
    genderGroups: [],
    raceGroups: [],
    pcdOnly: false,
  };
}

export function createEmptyAffirmativeContext() {
  return {
    useCase: "vaga_afirmativa",
    vacancyReference: "",
  };
}

export const AFFIRMATIVE_GROUP_LEGACY_ALIASES = {
  trans_people: "lgbtqiapn_people",
  non_binary_people: "lgbtqiapn_people",
};

export function normalizeAffirmativeGroupValue(value) {
  const normalized = String(value || "").trim();

  return AFFIRMATIVE_GROUP_LEGACY_ALIASES[normalized] || normalized;
}

export function normalizeAffirmativeGroupList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map(normalizeAffirmativeGroupValue).filter(Boolean))];
}

export function hasAffirmativeFilters(criteria = {}) {
  const filters = criteria?.affirmativeFilters;

  return Boolean(
    filters?.pcdOnly ||
      (Array.isArray(filters?.genderGroups) && filters.genderGroups.length > 0) ||
      (Array.isArray(filters?.raceGroups) && filters.raceGroups.length > 0),
  );
}

export function isAffirmativeSearchCriteria(criteria = {}) {
  return hasAffirmativeFilters(criteria) && Boolean(criteria?.affirmativeContext?.useCase);
}
