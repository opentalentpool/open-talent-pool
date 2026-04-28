import { BriefcaseBusiness, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PublicAccountRole } from "@/types/auth";
import { ACCOUNT_ROLE_LABEL } from "@/lib/account-roles.js";

const ROLE_PROMPT_COPY = {
  professional: {
    icon: UserRound,
    enableTitle: "Criar perfil profissional?",
    enableDescription:
      "Sua conta continua a mesma. Isso libera edição do currículo, publicação manual e atualização do perfil técnico sem novo cadastro.",
    enableConfirmLabel: "Criar e trocar",
    switchTitle: "Trocar para perfil profissional?",
    switchDescription:
      "Sua conta já tem esse perfil. A troca ativa o painel profissional nesta sessão sem encerrar seu login.",
    switchConfirmLabel: "Trocar perfil",
  },
  recruiter: {
    icon: BriefcaseBusiness,
    enableTitle: "Criar perfil recrutador?",
    enableDescription:
      "Sua conta continua a mesma. Isso libera favoritos, buscas salvas, alertas e curadoria autenticada sem novo cadastro.",
    enableConfirmLabel: "Criar e trocar",
    switchTitle: "Trocar para perfil recrutador?",
    switchDescription:
      "Sua conta já tem esse perfil. A troca ativa o painel do recrutador nesta sessão sem encerrar seu login.",
    switchConfirmLabel: "Trocar perfil",
  },
} satisfies Record<PublicAccountRole, {
  icon: typeof UserRound;
  enableTitle: string;
  enableDescription: string;
  enableConfirmLabel: string;
  switchTitle: string;
  switchDescription: string;
  switchConfirmLabel: string;
}>;

interface RoleContextPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetRole: PublicAccountRole | null;
  hasTargetRole: boolean;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
}

export const RoleContextPromptDialog = ({
  open,
  onOpenChange,
  targetRole,
  hasTargetRole,
  busy = false,
  onConfirm,
}: RoleContextPromptDialogProps) => {
  if (!targetRole) {
    return null;
  }

  const copy = ROLE_PROMPT_COPY[targetRole];
  const Icon = copy.icon;
  const title = hasTargetRole ? copy.switchTitle : copy.enableTitle;
  const description = hasTargetRole ? copy.switchDescription : copy.enableDescription;
  const confirmLabel = hasTargetRole ? copy.switchConfirmLabel : copy.enableConfirmLabel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[1.8rem] border-border/80 bg-background px-6 py-6 sm:px-7">
        <DialogHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <DialogTitle className="text-2xl leading-tight">{title}</DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-[1.4rem] border border-border/80 bg-secondary/55 p-4">
          <p className="text-sm font-medium text-foreground">Perfil selecionado</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {ACCOUNT_ROLE_LABEL[targetRole]}. A conta e o e-mail continuam os mesmos; o que muda é o perfil ativo da sessão.
          </p>
        </div>

        <DialogFooter className="mt-2 gap-2 sm:justify-start">
          <Button type="button" className="rounded-full px-5" onClick={() => void onConfirm()} disabled={busy}>
            {confirmLabel}
          </Button>
          <Button type="button" variant="ghost" className="rounded-full px-5" onClick={() => onOpenChange(false)} disabled={busy}>
            Agora não
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
