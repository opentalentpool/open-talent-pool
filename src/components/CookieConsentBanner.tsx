import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { cn } from "@/lib/utils";

function getDecisionLabel(decision: ReturnType<typeof useCookieConsent>["decision"]) {
  if (decision === "accepted") {
    return "Escolha atual: armazenamento opcional ativo.";
  }

  if (decision === "rejected") {
    return "Escolha atual: só a sessão essencial permanece ativa no navegador.";
  }

  return null;
}

export const CookieConsentBanner = () => {
  const {
    decision,
    isBannerOpen,
    acceptOptionalStorage,
    rejectOptionalStorage,
  } = useCookieConsent();

  if (!isBannerOpen) {
    return null;
  }

  const decisionLabel = getDecisionLabel(decision);

  return (
    <section className="fixed inset-x-0 bottom-0 z-[260] px-4 pb-4 pt-2 sm:px-6">
      <div className="mx-auto max-w-5xl rounded-[1.7rem] border border-border/80 bg-background/96 p-5 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Preferências de cookies</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Usamos um cookie essencial para manter a sessão autenticada e outro para lembrar esta escolha. Tema,
              retomada local do código por e-mail e rascunhos neste navegador só funcionam com armazenamento opcional.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Link
                to="/cookies"
                className="font-medium text-foreground underline underline-offset-4 transition hover:text-primary"
              >
                Ler a Política de Cookies
              </Link>
              {decisionLabel ? <span className="text-muted-foreground">{decisionLabel}</span> : null}
            </div>
          </div>

          <div className={cn("flex flex-col gap-2 sm:flex-row", decision !== "unset" && "lg:pb-0.5")}>
            <Button type="button" className="h-11 rounded-full px-5" onClick={acceptOptionalStorage}>
              Aceitar armazenamento opcional
            </Button>
            <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={rejectOptionalStorage}>
              Continuar só com o essencial
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
