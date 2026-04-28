import type {
  AffirmativeSearchPayload,
  ProfileData,
  SavedSearchAlertFrequency,
  SavedSearchCriteria,
  SearchProfilesParams,
} from "@/types/profile";
import { hasAffirmativeFilters } from "@/lib/affirmative-config.js";

export const SAVED_SEARCH_ALERT_FREQUENCY_LABEL: Record<SavedSearchAlertFrequency, string> = {
  disabled: "Desativado",
  daily: "Diário",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

export const SAVED_SEARCH_ALERT_FREQUENCIES: SavedSearchAlertFrequency[] = [
  "disabled",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
];

const SAVED_SEARCH_ALERT_FREQUENCY_INLINE_LABEL: Record<SavedSearchAlertFrequency, string> = {
  disabled: "desativado",
  daily: "diário",
  weekly: "semanal",
  biweekly: "quinzenal",
  monthly: "mensal",
};

export function getPublicationIssues(profile: ProfileData) {
  const issues = [];

  if (!profile.name.trim()) issues.push("Informe o nome completo.");
  if (!profile.headline.trim()) issues.push("Adicione um headline profissional.");
  if (!profile.city.trim()) issues.push("Informe a cidade.");
  if (!profile.state.trim()) issues.push("Selecione o estado.");
  if (!profile.seniority) issues.push("Selecione a senioridade.");
  if (!profile.workModels.length) issues.push("Selecione ao menos um modelo de trabalho.");
  if (!profile.skills.length) issues.push("Adicione pelo menos uma skill.");
  if (!profile.bio.trim() && !profile.experiences.length) {
    issues.push("Preencha a bio ou adicione ao menos uma experiência.");
  }

  return issues;
}

export function formatSearchCount(total: number) {
  if (total === 1) {
    return "1 perfil público";
  }

  return `${total} perfis públicos`;
}

export function formatSavedSearchCriteria(criteria: SavedSearchCriteria) {
  if (hasAffirmativeFilters(criteria)) {
    return "Busca com priorização inclusiva e critérios afirmativos ativos.";
  }

  const parts = [
    criteria.q ? `Busca: ${criteria.q}` : null,
    criteria.seniority ? `Senioridade: ${criteria.seniority}` : null,
    criteria.workModel ? `Modelo: ${criteria.workModel}` : null,
    criteria.state ? `Estado: ${criteria.state}` : null,
    criteria.openToOpportunities ? "Abertos a oportunidades" : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" • ") : "Sem filtros adicionais";
}

export function formatSavedSearchAlertBadge(alertFrequency: SavedSearchAlertFrequency) {
  if (alertFrequency === "disabled") {
    return "Alerta desativado";
  }

  return `Alerta ${SAVED_SEARCH_ALERT_FREQUENCY_INLINE_LABEL[alertFrequency]}`;
}

export function getSavedSearchCreatedToastMessage(alertFrequency: SavedSearchAlertFrequency) {
  if (alertFrequency === "disabled") {
    return "Busca salva sem alerta.";
  }

  return `Busca salva com alerta ${SAVED_SEARCH_ALERT_FREQUENCY_INLINE_LABEL[alertFrequency]}.`;
}

export function getSavedSearchUpdatedToastMessage(alertFrequency: SavedSearchAlertFrequency) {
  if (alertFrequency === "disabled") {
    return "Alerta desativado para esta busca.";
  }

  return `Frequência do alerta atualizada para ${SAVED_SEARCH_ALERT_FREQUENCY_INLINE_LABEL[alertFrequency]}.`;
}

export function buildRecruiterAuthPath(nextPath: string) {
  return `/entrar?tipo=recrutador&next=${encodeURIComponent(nextPath)}`;
}

export function buildSearchParamsObject(searchParams: URLSearchParams): SearchProfilesParams {
  return {
    q: searchParams.get("q") ?? "",
    seniority: (searchParams.get("seniority") ?? "") as SearchProfilesParams["seniority"],
    workModel: (searchParams.get("workModel") ?? "") as SearchProfilesParams["workModel"],
    state: searchParams.get("state") ?? "",
    openToOpportunities: searchParams.get("openToOpportunities") === "true",
    page: Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1),
    pageSize: 20,
  };
}

export function buildSearchParamsFromCriteria(criteria: Pick<SearchProfilesParams, "q" | "seniority" | "workModel" | "state" | "openToOpportunities">) {
  return {
    q: criteria.q,
    seniority: criteria.seniority,
    workModel: criteria.workModel,
    state: criteria.state,
    openToOpportunities: criteria.openToOpportunities,
  };
}

export function formatAppliedSearchFilters(criteria: Pick<SearchProfilesParams, "q" | "seniority" | "workModel" | "state" | "openToOpportunities">) {
  return [
    criteria.q ? `Busca: ${criteria.q}` : null,
    criteria.seniority ? `Senioridade: ${criteria.seniority}` : null,
    criteria.workModel ? `Modelo: ${criteria.workModel}` : null,
    criteria.state ? `Estado: ${criteria.state}` : null,
    criteria.openToOpportunities ? "Abertos a oportunidades" : null,
  ].filter(Boolean) as string[];
}

export function isAffirmativeSearchPayload(value: SavedSearchCriteria | AffirmativeSearchPayload | null | undefined) {
  return hasAffirmativeFilters(value || {});
}
