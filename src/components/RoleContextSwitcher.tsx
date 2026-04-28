import { useMemo, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, Loader2, Repeat2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { ACCOUNT_ROLE_LABEL, PUBLIC_ACCOUNT_ROLE_VALUES } from "@/lib/account-roles.js";
import type { PublicAccountRole } from "@/types/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleContextPromptDialog } from "@/components/RoleContextPromptDialog";

interface RoleContextSwitcherProps {
  variant: "dropdown" | "list";
  className?: string;
}

const roleIconMap = {
  professional: UserRound,
  recruiter: BriefcaseBusiness,
} satisfies Record<PublicAccountRole, typeof UserRound>;

export const RoleContextSwitcher = ({ variant, className }: RoleContextSwitcherProps) => {
  const { user, switchActiveRole, enableRole } = useAuth();
  const [busyRole, setBusyRole] = useState<PublicAccountRole | null>(null);
  const [promptRole, setPromptRole] = useState<PublicAccountRole | null>(null);

  const publicRoles = useMemo(
    () =>
      PUBLIC_ACCOUNT_ROLE_VALUES.filter((role) =>
        user?.availableRoles?.includes(role),
      ) as PublicAccountRole[],
    [user?.availableRoles],
  );

  const activePublicRole = (PUBLIC_ACCOUNT_ROLE_VALUES.includes(user?.activeRole as PublicAccountRole)
    ? user?.activeRole
    : publicRoles[0] || null) as PublicAccountRole | null;

  if (!user || (!publicRoles.length && user.activeRole !== "professional" && user.activeRole !== "recruiter")) {
    return null;
  }

  const executeRoleChange = async (role: PublicAccountRole) => {
    const hasTargetRole = user.availableRoles.includes(role);

    try {
      setBusyRole(role);

      if (hasTargetRole) {
        await switchActiveRole(role);
        toast.success(`Perfil ativo: ${ACCOUNT_ROLE_LABEL[role]}.`);
      } else {
        await enableRole(role, { makeActive: true });
        toast.success(`Perfil ${ACCOUNT_ROLE_LABEL[role]} habilitado na sua conta.`);
      }

      setPromptRole(null);
    } catch {
      toast.error("Não foi possível atualizar o perfil da conta agora.");
    } finally {
      setBusyRole(null);
    }
  };

  const handleRoleSelection = (role: PublicAccountRole) => {
    if (busyRole || role === user.activeRole) {
      return;
    }

    if (user.availableRoles.includes(role)) {
      void executeRoleChange(role);
      return;
    }

    setPromptRole(role);
  };

  const promptHasTargetRole = promptRole ? user.availableRoles.includes(promptRole) : false;
  const CurrentIcon = activePublicRole ? roleIconMap[activePublicRole] : Repeat2;

  if (variant === "list") {
    return (
      <>
        <section className={cn("rounded-[1.6rem] border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur-md", className)}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Perfis da conta</p>
          <div role="group" aria-label="Trocar perfil da conta" className="mt-4 space-y-2">
            {PUBLIC_ACCOUNT_ROLE_VALUES.map((role) => {
              const Icon = roleIconMap[role];
              const enabled = user.availableRoles.includes(role);
              const active = user.activeRole === role;
              const loading = busyRole === role;

              return (
                <button
                  key={role}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[1.2rem] border px-4 py-3 text-left transition-colors",
                    active
                      ? "border-border bg-background/88 text-foreground shadow-sm ring-1 ring-ring/15"
                      : "border-border/70 bg-background/40 text-muted-foreground hover:bg-background/70 hover:text-foreground",
                  )}
                  onClick={() => handleRoleSelection(role)}
                  disabled={loading}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/70 text-foreground">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{ACCOUNT_ROLE_LABEL[role]}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      {active
                        ? "Perfil ativo nesta sessão."
                        : enabled
                          ? "Trocar para este perfil sem novo login."
                          : "Criar este perfil na sua conta e ativá-lo agora."}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <RoleContextPromptDialog
          open={Boolean(promptRole)}
          onOpenChange={(open) => {
            if (!open) {
              setPromptRole(null);
            }
          }}
          targetRole={promptRole}
          hasTargetRole={promptHasTargetRole}
          busy={Boolean(busyRole)}
          onConfirm={() => (promptRole ? executeRoleChange(promptRole) : undefined)}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("hidden rounded-full px-4 md:inline-flex", className)}
          >
            {busyRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <CurrentIcon className="h-4 w-4" />}
            {activePublicRole ? ACCOUNT_ROLE_LABEL[activePublicRole] : "Perfil"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-[1.35rem] border-border/80 bg-popover/95 p-2 shadow-lg backdrop-blur-xl">
          <DropdownMenuLabel className="px-3 pb-2 pt-1 text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">
            Perfis da conta
          </DropdownMenuLabel>
          {PUBLIC_ACCOUNT_ROLE_VALUES.map((role) => {
            const Icon = roleIconMap[role];
            const enabled = user.availableRoles.includes(role);
            const active = user.activeRole === role;

            return (
              <DropdownMenuItem
                key={role}
                className="rounded-[1rem] px-3 py-3 focus:bg-secondary/85"
                onSelect={(event) => {
                  event.preventDefault();
                  handleRoleSelection(role);
                }}
              >
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/70 text-foreground">
                    {busyRole === role ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{ACCOUNT_ROLE_LABEL[role]}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {active
                        ? "Perfil ativo."
                        : enabled
                          ? "Trocar para este perfil sem novo login."
                          : "Criar este perfil na sua conta."}
                    </span>
                  </span>
                  {active ? <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-[hsl(var(--accent))]" /> : null}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <div className="px-3 pb-2 pt-1 text-xs leading-5 text-muted-foreground">
            A identidade da conta continua a mesma. O que muda é o perfil ativo da sessão.
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <RoleContextPromptDialog
        open={Boolean(promptRole)}
        onOpenChange={(open) => {
          if (!open) {
            setPromptRole(null);
          }
        }}
        targetRole={promptRole}
        hasTargetRole={promptHasTargetRole}
        busy={Boolean(busyRole)}
        onConfirm={() => (promptRole ? executeRoleChange(promptRole) : undefined)}
      />
    </>
  );
};
