import { Link } from "react-router-dom";
import { ArrowRight, Bell, BriefcaseBusiness, Mail, Search, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { SectionIntro } from "@/components/SectionIntro";
import { SiteFooter } from "@/components/SiteFooter";

const professionalFlow = [
  "email com código, perfil editável e publicação manual",
  "stack, experiências, localização e disponibilidade descritos com clareza",
  "entrada na descoberta pública apenas quando o profissional decide publicar",
];

const recruiterFlow = [
  "busca pública por palavra-chave, senioridade, estado e modelo de trabalho",
  "favoritos, buscas salvas e alertas por e-mail para acompanhamento",
  "curadoria contínua com e-mail de contato só quando o profissional autoriza",
];

const trustRules = [
  {
    title: "Contato sob controle do profissional",
    description: "O e-mail da conta fica fora da busca pública, e o contato por e-mail só aparece para recrutadores autenticados quando o profissional ativa esse canal.",
  },
  {
    title: "Publicação manual",
    description: "Perfis não aparecem por padrão. O profissional publica quando quiser entrar no radar.",
  },
  {
    title: "Curadoria registrada",
    description: "Recrutadores autenticados podem continuar a triagem com favoritos e buscas salvas.",
  },
];

const HowItWorks = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pb-20 pt-10 md:pb-24 md:pt-14">
        <div className="container">
          <PageHeader
            eyebrow="Como funciona"
            title="Como o OpenTalentPool funciona na prática"
            description="A operação é simples de propósito: perfil editável, busca aberta, publicação manual e curadoria com limites claros de privacidade."
            aside={
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="mt-1 h-4 w-4 text-[hsl(var(--accent))]" />
                  <p className="text-sm leading-6 text-muted-foreground">
                    Autenticação por código enviado por e-mail, sem criar fricção extra de senha no primeiro acesso.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-4 w-4 text-[hsl(var(--accent))]" />
                  <p className="text-sm leading-6 text-muted-foreground">
                    A vitrine pública mostra informações técnicas. O contato por e-mail fica em uma camada separada, visível só para recrutadores autenticados quando o profissional quiser.
                  </p>
                </div>
              </div>
            }
          />

          <section className="mt-14 grid gap-6 lg:grid-cols-2">
            <article className="surface-panel p-7 md:p-8">
              <SectionIntro
                eyebrow="Profissionais"
                title="Publicar com clareza antes de aparecer no mercado."
                description="Nada entra na busca por acidente. O perfil é montado, revisado e publicado manualmente."
              />

              <div className="mt-8 space-y-4">
                {professionalFlow.map((item, index) => (
                  <div key={item} className="flex items-start gap-4 border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-foreground">
                      {index + 1}
                    </div>
                    <div>
                      <h2 className="text-xl leading-tight">{item}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        O objetivo aqui é aumentar a qualidade da primeira leitura, não empurrar volume vazio para a busca.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="surface-muted p-7 md:p-8">
              <SectionIntro
                eyebrow="Recrutadores"
                title="Buscar com filtro útil e continuar a triagem sem recomeçar do zero."
                description="O lado do recrutador é operacional: localizar melhor, favoritar rápido e acompanhar novos perfis aderentes."
              />

              <div className="mt-8 space-y-4">
                {recruiterFlow.map((item, index) => (
                  <div key={item} className="flex items-start gap-4 border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/85 font-semibold text-foreground shadow-sm">
                      {index + 1}
                    </div>
                    <div>
                      <h2 className="text-xl leading-tight">{item}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        O painel do recrutador existe para continuar a curadoria, não para esconder a busca atrás de paywall.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-14">
            <div className="surface-dark p-8 md:p-10">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <SectionIntro
                  eyebrow="Regras do produto"
                  title="Privacidade e clareza operam juntas."
                  description="O sistema foi desenhado para tornar a descoberta mais transparente sem transformar contato pessoal em moeda de navegação."
                  className="max-w-xl"
                  eyebrowClassName="surface-dark-eyebrow"
                  titleClassName="surface-dark-title text-4xl md:text-5xl"
                  descriptionClassName="surface-dark-copy-soft"
                />

                <div className="grid gap-4 md:grid-cols-3">
                  {trustRules.map((rule, index) => {
                    const Icon = index === 0 ? ShieldCheck : index === 1 ? BriefcaseBusiness : Bell;

                    return (
                      <div key={rule.title} className="surface-dark-card">
                        <div className="surface-dark-icon">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="surface-dark-title mt-5 text-2xl leading-tight">{rule.title}</h3>
                        <p className="surface-dark-copy-soft mt-3 text-sm leading-6">{rule.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-14">
            <div className="surface-panel flex flex-col gap-5 p-8 md:flex-row md:items-center md:justify-between md:p-10">
              <div className="max-w-2xl">
                <p className="eyebrow">Próximo passo</p>
                <h2 className="mt-4 text-3xl leading-tight md:text-4xl">
                  Entre para editar seu perfil ou abra a busca para começar a triagem.
                </h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className="rounded-full px-5">
                  <Link to="/buscar">
                    Abrir busca pública
                    <Search className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full border-border/80 px-5">
                  <Link to="/cadastro">
                    Entrar ou cadastrar
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default HowItWorks;
