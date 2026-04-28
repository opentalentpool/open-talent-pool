import { Link } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { LEGAL_FOOTER_LINKS } from "@/lib/legal-policies.js";

const productLinks = [
  { label: "Início", href: "/" },
  { label: "Buscar talentos", href: "/buscar" },
  { label: "Como funciona", href: "/como-funciona" },
];

const actionLinks = [
  { label: "Entrar", href: "/entrar" },
  { label: "Cadastrar perfil", href: "/cadastro?tipo=profissional" },
  { label: "Criar conta de recrutador", href: "/cadastro?tipo=recrutador" },
];

interface SiteFooterProps {
  variant?: "default" | "document";
}

function FooterLinkSection({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">{title}</h2>
      <div className="mt-4 space-y-3">
        {links.map((link) => (
          <Link key={link.href} to={link.href} className="block text-sm text-foreground transition-colors hover:text-primary">
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function FooterLegalSection({ showCookiePreferences = true }: { showCookiePreferences?: boolean }) {
  const { reopenPreferences } = useCookieConsent();

  return (
    <div className="min-w-0">
      <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Legal</h2>
      <div className="mt-4 space-y-3">
        {LEGAL_FOOTER_LINKS.map((link) => (
          <Link key={link.href} to={link.href} className="block text-sm text-foreground transition-colors hover:text-primary">
            {link.label}
          </Link>
        ))}
        {showCookiePreferences ? (
          <button
            type="button"
            className="block text-left text-sm text-foreground transition-colors hover:text-primary"
            onClick={reopenPreferences}
          >
            Preferências de cookies
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const SiteFooter = ({ variant = "default" }: SiteFooterProps) => {
  if (variant === "document") {
    return (
      <footer data-testid="site-footer" data-variant={variant} className="legal-print-hidden border-t border-border/80 bg-background">
        <div className="container py-8 md:py-10">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]">
            <div className="min-w-0 max-w-md">
              <BrandLockup subtitle="descoberta pública de talentos em tecnologia" />
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Documentos públicos, navegação essencial e acesso rápido às políticas do OpenTalentPool.
              </p>
            </div>

            <FooterLinkSection title="Produto" links={productLinks} />
            <FooterLinkSection title="Fluxos" links={actionLinks} />
            <FooterLegalSection showCookiePreferences={false} />
          </div>

          <div className="mt-8 border-t border-border/80 pt-4 text-sm text-muted-foreground">
            <p>&copy; 2026 OPENTALENTPOOL</p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer data-testid="site-footer" data-variant={variant} className="border-t border-border/80 bg-background/70 backdrop-blur-md">
      <div className="container py-10 md:py-12">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.65fr)_minmax(0,0.8fr)_minmax(0,0.85fr)]">
          <div className="min-w-0 max-w-lg">
            <BrandLockup subtitle="descoberta pública de talentos em tecnologia" />
            <h2 className="mt-5 text-2xl leading-tight">Descoberta técnica aberta, com contato sob controle do profissional.</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Busca pública para tecnologia com filtros úteis, publicação manual do perfil e e-mail de contato liberado só quando fizer sentido.
            </p>
          </div>

          <FooterLinkSection title="Produto" links={productLinks} />
          <FooterLinkSection title="Fluxos" links={actionLinks} />
          <FooterLegalSection />
        </div>

        <div className="mt-12 grid gap-4 border-t border-border/80 pt-8 text-sm text-muted-foreground md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-8">
          <p className="max-w-md leading-6">
            &copy; 2026 OPENTALENTPOOL
          </p>
          <p className="max-w-xl leading-6 md:border-l md:border-border/70 md:pl-8">
            DESCOBERTA PÚBLICA DE TALENTOS EM TECNOLOGIA
          </p>
        </div>
      </div>
    </footer>
  );
};
