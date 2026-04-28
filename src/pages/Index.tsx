import { Link } from "react-router-dom";
import { ArrowRight, Bell, BriefcaseBusiness, EyeOff, Heart, Search, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { SectionIntro } from "@/components/SectionIntro";
import { SiteFooter } from "@/components/SiteFooter";

const landingSignals = [
  {
    tag: "Perfis publicados",
    title: "Publicar perfil com critério",
    description: "O profissional entra na descoberta pública quando o perfil está pronto para sustentar uma boa leitura inicial.",
  },
  {
    tag: "Filtros claros",
    title: "Buscar com sinal real",
    description: "Recrutadores encontram perfis publicados com filtros úteis e leitura objetiva desde a primeira triagem.",
  },
  {
    tag: "Curadoria privada",
    title: "Curadoria sem ruído",
    description: "Favoritos, buscas salvas e contato liberado pelo profissional ajudam a continuar a triagem sem espalhar dados pessoais.",
  },
];

const audienceColumns = [
  {
    eyebrow: "Para profissionais",
    title: "Presença pública sob controle, sem pressão para aparecer de qualquer jeito.",
    description:
      "Seu perfil técnico reúne stack, experiência, forma de atuação e disponibilidade. Você escolhe quando ele entra na busca.",
    href: "/cadastro?tipo=profissional",
    cta: "Publicar perfil com critério",
    points: [
      "headline, stack e histórico com leitura clara",
      "e-mail de contato opcional só para recrutadores autenticados",
      "publicação e disponibilidade ajustadas ao seu momento",
    ],
  },
  {
    eyebrow: "Para recrutadores",
    title: "Busca aberta com filtros honestos e uma shortlist que não se perde.",
    description:
      "A plataforma favorece critérios explícitos, leitura rápida do perfil e continuidade real da curadoria.",
    href: "/cadastro?tipo=recrutador",
    cta: "Criar conta de recrutador",
    points: [
      "filtros por palavra-chave, senioridade, estado e modelo",
      "favoritos e buscas salvas no painel do recrutador",
      "alertas para acompanhar novas publicações aderentes",
    ],
  },
];

const proofColumns = [
  {
    icon: ShieldCheck,
    title: "Privacidade sem maquiagem",
    description: "O e-mail da conta não aparece na busca pública, e o contato por e-mail só surge para recrutadores autenticados quando o profissional ativa esse canal.",
  },
  {
    icon: Search,
    title: "Busca pública de verdade",
    description: "O catálogo público parte de perfis publicados, não de placeholders travestidos de produto pronto.",
  },
  {
    icon: Heart,
    title: "Curadoria que continua",
    description: "Recrutadores autenticados conseguem guardar perfis, salvar filtros e retomar a descoberta depois.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pb-20 md:pb-24">
        <section className="container pt-10 md:pt-16">
          <div className="max-w-5xl">
            <p className="eyebrow">Busca pública real para tecnologia</p>
            <h1 className="mt-5 text-5xl leading-[0.94] md:text-7xl">
              Descoberta técnica aberta, com leitura clara desde a primeira busca.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl">
              Busca aberta para recrutadores. Presença pública sob controle do profissional. Curadoria privada
              quando precisa continuar privada.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base shadow-sm">
                <Link to="/buscar">
                  Abrir busca pública
                  <Search className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-border/80 px-6 text-base">
                <Link to="/cadastro?tipo=profissional">
                  Publicar meu perfil
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-5">
              <span>Perfis publicados</span>
              <span>Busca aberta</span>
              <span>Contato controlado pelo profissional</span>
            </div>
          </div>
        </section>

        <section className="container mt-16 md:mt-20">
          <div className="surface-panel overflow-hidden">
            <div className="grid gap-8 px-6 py-7 md:px-8 md:py-9 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] lg:items-start">
              <SectionIntro
                eyebrow="Prova do modelo"
                title="O produto opera em três movimentos claros."
                description="Perfis publicados, filtros úteis e continuidade de curadoria formam o fluxo central da busca pública."
                className="max-w-none"
              />

              <div className="grid gap-5 md:grid-cols-3">
                {landingSignals.map((signal, index) => (
                  <article
                    key={signal.title}
                    className="border-t border-border/70 pt-5 first:border-t-0 first:pt-0 md:border-l md:border-t-0 md:pl-5 md:pt-0 md:first:border-l-0 md:first:pl-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        {signal.tag}
                      </p>
                    </div>
                    <h3 className="mt-4 text-2xl leading-tight">{signal.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{signal.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="border-t border-border/70 bg-secondary/55 px-6 py-5 md:px-8">
              <p className="max-w-2xl text-sm leading-6 text-foreground">
                O que entra na busca são informações profissionais. O contato por e-mail só aparece para recrutadores autenticados quando o profissional libera esse canal.
              </p>
            </div>
          </div>
        </section>

        <section className="container mt-20 md:mt-24">
          <div className="grid gap-6 lg:grid-cols-2">
            {audienceColumns.map((column, index) => (
              <article
                key={column.eyebrow}
                className={index === 0 ? "surface-panel p-7 md:p-8" : "surface-muted p-7 md:p-8"}
              >
                <p className="eyebrow">{column.eyebrow}</p>
                <h2 className="mt-4 text-4xl leading-tight">{column.title}</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">{column.description}</p>

                <div className="mt-8 space-y-4">
                  {column.points.map((point) => (
                    <div key={point} className="flex items-start gap-3 border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-primary shadow-sm">
                        {index === 0 ? <BriefcaseBusiness className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                      </div>
                      <p className="text-sm leading-6 text-foreground">{point}</p>
                    </div>
                  ))}
                </div>

                <Button asChild variant="ghost" className="mt-8 rounded-full px-0 text-sm text-foreground hover:bg-transparent hover:text-primary">
                  <Link to={column.href}>
                    {column.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </section>

        <section className="container mt-20 md:mt-24">
          <div className="surface-dark overflow-hidden p-8 md:p-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div>
                <p className="eyebrow surface-dark-eyebrow">Confiança operacional</p>
                <h2 className="surface-dark-title mt-4 text-4xl leading-tight md:text-5xl">
                  A leitura pública precisa ser útil sem transformar contato pessoal em isca.
                </h2>
                <p className="surface-dark-copy-soft mt-4 max-w-xl text-base leading-7">
                  A descoberta pública existe para diminuir atrito e ampliar acesso. O limite continua claro: critérios explícitos
                  de busca e contato por e-mail só com liberação do profissional para recrutadores autenticados.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {proofColumns.map((column) => {
                  const Icon = column.icon;

                  return (
                    <div key={column.title} className="surface-dark-card">
                      <div className="surface-dark-icon">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="surface-dark-title mt-5 text-2xl leading-tight">{column.title}</h3>
                      <p className="surface-dark-copy-soft mt-3 text-sm leading-6">{column.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="container mt-20 md:mt-24">
          <div className="surface-panel p-8 text-center md:p-10">
            <p className="eyebrow">Começar agora</p>
            <h2 className="mx-auto mt-4 max-w-4xl text-4xl leading-tight md:text-5xl">
              Abra a busca ou publique seu perfil com critérios claros desde o início.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              O centro do produto já está claro: encontrar melhor, aparecer com mais clareza e liberar contato só quando fizer sentido.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base shadow-sm">
                <Link to="/buscar">Abrir busca pública</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-border/80 px-6 text-base">
                <Link to="/cadastro?tipo=profissional">Publicar meu perfil</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Index;
