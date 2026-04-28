import type { Seniority, WorkModel } from "@/types/profile";

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
] as const;

export const SENIORITY_LABEL: Record<Exclude<Seniority, "">, string> = {
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
};

export const WORK_MODEL_VALUES: WorkModel[] = ["remoto", "hibrido", "presencial"];

export const WORK_MODEL_LABEL: Record<WorkModel, string> = {
  remoto: "Remoto",
  hibrido: "Híbrido",
  presencial: "Presencial",
};

export function normalizeWorkModelList(value: unknown, legacyValue?: unknown): WorkModel[] {
  const source = Array.isArray(value) ? value : value === undefined ? [legacyValue] : [];

  return WORK_MODEL_VALUES.filter((workModel) => source.includes(workModel));
}

export function formatWorkModelList(workModels: readonly WorkModel[]) {
  return normalizeWorkModelList(workModels).map((workModel) => WORK_MODEL_LABEL[workModel]).join(", ");
}

export const STATE_LABEL: Record<(typeof BRAZILIAN_STATES)[number], string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};
