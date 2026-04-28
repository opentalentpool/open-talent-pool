import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { useAppTheme } from "@/components/AppThemeProvider";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, isThemeMode, type ThemeMode } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ThemeModeControlProps {
  variant: "dropdown" | "list";
  className?: string;
}

const iconByThemeMode = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} satisfies Record<ThemeMode, typeof Sun>;

function getThemeModeLabel(value: ThemeMode) {
  return THEME_OPTIONS.find((option) => option.value === value)?.label ?? "Claro";
}

export const ThemeModeControl = ({ variant, className }: ThemeModeControlProps) => {
  const { theme, resolvedTheme, setTheme, canPersistPreference } = useAppTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedTheme = mounted && isThemeMode(theme) ? theme : "light";
  const appliedTheme = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const CurrentIcon = mounted ? iconByThemeMode[selectedTheme] : SunMoon;
  const selectedLabel = getThemeModeLabel(selectedTheme);
  const appliedLabel = appliedTheme === "dark" ? "escuro" : "claro";
  const storageNotice = "Lembrar o tema neste navegador exige armazenamento opcional.";
  const buttonLabel = !canPersistPreference
    ? `Abrir opções de tema. ${storageNotice}`
    : mounted
      ? `Abrir opções de tema. Seleção atual: ${selectedLabel.toLowerCase()}. Tema aplicado: ${appliedLabel}.`
      : "Abrir opções de tema.";

  if (variant === "list") {
    return (
      <section className={cn("rounded-[1.6rem] border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur-md", className)}>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Tema</p>
        {!canPersistPreference ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{storageNotice}</p>
        ) : null}
        <div role="radiogroup" aria-label="Tema da interface" className="mt-4 space-y-2">
          {THEME_OPTIONS.map((option) => {
            const OptionIcon = iconByThemeMode[option.value];
            const checked = selectedTheme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[1.2rem] border px-4 py-3 text-left transition-colors",
                  checked
                    ? "border-border bg-background/88 text-foreground shadow-sm ring-1 ring-ring/15"
                    : "border-border/70 bg-background/40 text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
                disabled={!canPersistPreference}
                onClick={() => canPersistPreference && setTheme(option.value)}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                    checked
                      ? "border-border bg-secondary text-foreground"
                      : "border-border/70 bg-background/70 text-muted-foreground",
                  )}
                >
                  <OptionIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "h-10 w-10 rounded-full border-border/80 bg-background/75 shadow-sm backdrop-blur-md hover:bg-secondary/70",
            className,
          )}
          disabled={!canPersistPreference}
          aria-label={buttonLabel}
          title={buttonLabel}
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="sr-only">Tema da interface</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-[1.35rem] border-border/80 bg-popover/95 p-2 shadow-lg backdrop-blur-xl">
        <DropdownMenuLabel className="px-3 pb-2 pt-1 text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">
          Aparência
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selectedTheme} onValueChange={(value) => isThemeMode(value) && setTheme(value)}>
          {THEME_OPTIONS.map((option) => {
            const OptionIcon = iconByThemeMode[option.value];

            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="rounded-[1rem] px-10 py-3 focus:bg-secondary/85 focus:text-foreground"
              >
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/70 text-foreground">
                    <OptionIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
