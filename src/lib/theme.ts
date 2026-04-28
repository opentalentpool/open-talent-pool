export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "open-talent-pool-theme";

export const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Claro",
    description: "Prioriza superfícies claras e leitura aberta.",
  },
  {
    value: "dark",
    label: "Escuro",
    description: "Reduz brilho e reforça contraste em fundo escuro.",
  },
  {
    value: "system",
    label: "Sistema",
    description: "Segue a aparência configurada no dispositivo.",
  },
];

export function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}
