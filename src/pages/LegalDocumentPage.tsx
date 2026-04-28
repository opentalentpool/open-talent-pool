import { useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTROLLER_CNPJ,
  LEGAL_CONTROLLER_NAME,
} from "@/lib/legal-policies.js";
import { getLegalDocument, type LegalDocumentKey } from "@/lib/legal-documents";

interface LegalDocumentPageProps {
  documentKey: LegalDocumentKey;
}

export const LegalDocumentPage = ({ documentKey }: LegalDocumentPageProps) => {
  const legalDocument = getLegalDocument(documentKey);
  const { reopenPreferences } = useCookieConsent();

  useEffect(() => {
    window.document.body.classList.add("legal-document-mode");

    return () => {
      window.document.body.classList.remove("legal-document-mode");
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar variant="document" />

      <main className="px-4 py-8 sm:px-6 md:py-10 print:px-0 print:py-0">
        <article
          data-testid="legal-document-page"
          className="legal-document-page mx-auto max-w-4xl rounded-sm border border-border/80 bg-card px-6 py-8 sm:px-10 sm:py-10 md:px-12 md:py-12 print:max-w-none print:border-0 print:bg-transparent print:px-0 print:py-0"
        >
          <header className="legal-document-meta border-b border-border/80 pb-8 print:pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">{legalDocument.eyebrow}</p>
            <h1 className="mt-3 font-sans text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {legalDocument.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{legalDocument.description}</p>

            <dl className="mt-8 grid gap-x-8 gap-y-4 text-sm leading-6 text-foreground sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-foreground">Versão pública</dt>
                <dd className="mt-1 text-muted-foreground">{legalDocument.version}</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Vigência desta versão</dt>
                <dd className="mt-1 text-muted-foreground">{legalDocument.effectiveDateLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Responsável / controlador</dt>
                <dd className="mt-1 text-muted-foreground">{LEGAL_CONTROLLER_NAME}</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Referência societária</dt>
                <dd className="mt-1 text-muted-foreground">CNPJ {LEGAL_CONTROLLER_CNPJ}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-semibold text-foreground">Contato</dt>
                <dd className="mt-1">
                  <a
                    href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                    className="inline-flex text-sm text-foreground underline underline-offset-4 transition hover:text-primary"
                  >
                    {LEGAL_CONTACT_EMAIL}
                  </a>
                </dd>
              </div>
            </dl>
          </header>

          <section
            data-testid="legal-document-summary"
            className="legal-document-summary border-b border-border/80 py-8 print:py-6"
            aria-labelledby="legal-document-summary-heading"
          >
            <h2 id="legal-document-summary-heading" className="font-sans text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Resumo
            </h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-[15px] leading-7 text-foreground marker:text-muted-foreground">
              {legalDocument.summary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {documentKey === "cookiesPolicy" ? (
              <div className="mt-6">
                <Button type="button" variant="outline" className="rounded-full px-5" onClick={reopenPreferences}>
                  Preferências de cookies
                </Button>
              </div>
            ) : null}
          </section>

          <div data-testid="legal-document-sections" className="mt-8 space-y-10">
            {legalDocument.sections.map((section) => (
              <section key={section.title} className="legal-document-section">
                <h2 className="font-sans text-2xl font-semibold tracking-tight text-foreground md:text-[1.9rem]">
                  {section.title}
                </h2>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-[15px] leading-7 text-foreground/90">
                      {paragraph}
                    </p>
                  ))}
                </div>
                {section.items?.length ? (
                  <ul className="mt-5 list-disc space-y-3 pl-5 text-[15px] leading-7 text-foreground/90 marker:text-muted-foreground">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </main>

      <SiteFooter variant="document" />
    </div>
  );
};
