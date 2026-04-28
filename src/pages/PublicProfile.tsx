import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  ExternalLink,
  Heart,
  Loader2,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ReportDialog } from "@/components/ReportDialog";
import { RoleContextPromptDialog } from "@/components/RoleContextPromptDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";
import api from "@/lib/api";
import { SENIORITY_LABEL, formatWorkModelList } from "@/lib/profile-options";
import { normalizePublicProfileDetailInput } from "@/lib/profile-normalization";
import { buildRecruiterAuthPath } from "@/lib/talent-helpers";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ApiError } from "@/types/auth";
import type {
  ModerationReportCategory,
  ReportSubmissionStatus,
} from "@/types/moderation";
import type { PublicProfileDetail } from "@/types/profile";

function getPublicProfileErrorCopy(errorCode: string) {
  if (errorCode === "profile_not_found") {
    return {
      title: "Este perfil não está disponível.",
      description: "Ele pode ter saído da vitrine pública ou este link não estar mais ativo.",
    };
  }

  return {
    title: "Não foi possível abrir este perfil agora.",
    description: "Tente novamente em instantes.",
  };
}

const PublicProfile = () => {
  const { slug = "" } = useParams();
  const { user, switchActiveRole, enableRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<PublicProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [reportStatus, setReportStatus] = useState<ReportSubmissionStatus | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [recruiterPromptOpen, setRecruiterPromptOpen] = useState(false);
  const [recruiterPromptBusy, setRecruiterPromptBusy] = useState(false);
  const hasRecruiterRole = Boolean(user?.availableRoles?.includes("recruiter"));
  const isRecruiter = user?.activeRole === "recruiter";
  const recruiterAuthPath = buildRecruiterAuthPath(`${location.pathname}${location.search}`);

  const handleRequireRecruiterContext = () => {
    if (!user) {
      navigate(recruiterAuthPath);
      return false;
    }

    setRecruiterPromptOpen(true);
    return false;
  };

  const handleRecruiterPromptConfirm = async () => {
    try {
      setRecruiterPromptBusy(true);

      if (hasRecruiterRole) {
        await switchActiveRole("recruiter");
        toast.success("Perfil recrutador ativado nesta sessão.");
      } else {
        await enableRole("recruiter", { makeActive: true });
        toast.success("Perfil recrutador criado na sua conta.");
      }

      setRecruiterPromptOpen(false);
    } catch {
      toast.error("Não foi possível ativar o perfil recrutador agora.");
    } finally {
      setRecruiterPromptBusy(false);
    }
  };

  useEffect(() => {
    let active = true;

    setLoading(true);
    setErrorCode("");

    api.profiles
      .getPublicProfile(slug)
      .then((response) => {
        if (!active) return;
        setProfile(normalizePublicProfileDetailInput(response.profile));
      })
      .catch((apiError: ApiError) => {
        if (!active) return;
        setErrorCode(apiError.error || "unknown_error");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;

    if (!user) {
      setReportStatus(null);
      return () => {
        active = false;
      };
    }

    api.reports
      .getMyStatus()
      .then((response) => {
        if (!active) return;
        setReportStatus(response);
      })
      .catch(() => {
        if (!active) return;
        setReportStatus(null);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    if (!isRecruiter || !profile) {
      setIsFavorite(false);
      return () => {
        active = false;
      };
    }

    api.recruiter
      .getFavorites()
      .then((response) => {
        if (!active) return;
        setIsFavorite(response.favorites.some((favorite) => favorite.id === profile.id));
      })
      .catch(() => {
        if (!active) return;
        setIsFavorite(false);
      });

    return () => {
      active = false;
    };
  }, [isRecruiter, profile]);

  useEffect(() => {
    let active = true;

    if (!isRecruiter || !profile?.publicSlug) {
      setContactEmail("");
      return () => {
        active = false;
      };
    }

    api.recruiter
      .getProfileContact(profile.publicSlug)
      .then((response) => {
        if (!active) return;
        setContactEmail(response.email || "");
      })
      .catch(() => {
        if (!active) return;
        setContactEmail("");
      });

    return () => {
      active = false;
    };
  }, [isRecruiter, profile?.publicSlug]);

  const handleFavoriteToggle = async () => {
    if (!profile) return;

    if (!isRecruiter) {
      handleRequireRecruiterContext();
      return;
    }

    try {
      setFavoriteLoading(true);

      if (isFavorite) {
        await api.recruiter.removeFavorite(profile.id);
        setIsFavorite(false);
        toast.success("Perfil removido dos favoritos.");
      } else {
        await api.recruiter.addFavorite(profile.id);
        setIsFavorite(true);
        toast.success("Perfil favoritado com sucesso.");
      }
    } catch {
      toast.error("Não foi possível atualizar o favorito agora.");
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleReportProfile = async ({
    category,
    description,
  }: {
    category: ModerationReportCategory;
    description: string;
  }) => {
    if (!profile) {
      return;
    }

    try {
      setReportSubmitting(true);
      await api.reports.submit({
        targetKind: "professional_public_profile",
        targetRef: profile.publicSlug,
        category,
        description,
      });
      const nextStatus = await api.reports.getMyStatus().catch(() => null);

      if (nextStatus) {
        setReportStatus(nextStatus);
      }

      setReportDialogOpen(false);
      toast.success("Denúncia enviada.");
    } catch (error) {
      const apiError = error as { error?: string };

      if (apiError.error === "email_delivery_failed") {
        toast.error("Não foi possível confirmar a denúncia por e-mail agora. Tente novamente em instantes.");
        return;
      }

      if (apiError.error === "report_already_open") {
        toast.error("Já existe uma denúncia aberta para este perfil.");
        return;
      }

      if (apiError.error === "reporting_restricted") {
        const nextStatus = await api.reports.getMyStatus().catch(() => null);

        if (nextStatus) {
          setReportStatus(nextStatus);
        }

        toast.error("Seu acesso ao canal de denúncias está temporariamente restrito.");
        return;
      }

      toast.error("Não foi possível enviar a denúncia agora.");
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16">
          <div className="surface-panel flex items-center gap-3 p-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando perfil público...
          </div>
        </div>
      </div>
    );
  }

  if (errorCode || !profile) {
    const errorCopy = getPublicProfileErrorCopy(errorCode || "profile_not_found");

    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16">
          <div className="surface-panel border-dashed p-8">
            <h1 className="text-3xl leading-tight">{errorCopy.title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{errorCopy.description}</p>
            <Button asChild className="mt-6 rounded-full">
              <Link to="/buscar">Voltar para a busca</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pb-20 pt-10 md:pb-24 md:pt-14">
        <div className="container">
          <Button asChild variant="ghost" className="rounded-full px-0 text-muted-foreground hover:bg-transparent">
            <Link to="/buscar">
              <ArrowLeft className="h-4 w-4" />
              Voltar para a busca
            </Link>
          </Button>

          <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_340px]">
            <article className="surface-panel overflow-hidden p-8 md:p-10">
              <p className="eyebrow">Perfil publicado</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <h1 className="text-5xl leading-[0.96] md:text-6xl">{profile.name}</h1>
                {profile.openToOpportunities ? (
                  <Badge className="rounded-full bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-600">
                    Aberto a oportunidades
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    Perfil público ativo
                  </Badge>
                )}
              </div>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{profile.headline}</p>

              <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {profile.city}, {profile.state}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  {SENIORITY_LABEL[profile.seniority]}
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  {formatWorkModelList(profile.workModels)}
                </span>
              </div>

              {profile.bio ? (
                <div className="mt-8 max-w-3xl border-t border-border/70 pt-6">
                  <p className="eyebrow">Resumo</p>
                  <p className="mt-4 text-base leading-8 text-foreground">{profile.bio}</p>
                </div>
              ) : null}

              <div className="mt-8 border-t border-border/70 pt-6">
                <p className="eyebrow">Stack</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="rounded-full bg-secondary/75 px-3 py-1 text-foreground">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </article>

            <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <div className="surface-dark p-7">
                <p className="eyebrow surface-dark-eyebrow">Ações do recrutador</p>
                <h2 className="surface-dark-title mt-4 text-3xl leading-tight">
                  Guarde perfis promissores e avance o contato quando o profissional liberar esse canal.
                </h2>
                <p className="surface-dark-copy mt-4 text-sm leading-6">
                  Favoritos e buscas salvas continuam organizando a triagem. Quando o profissional liberar um e-mail para recrutadores autenticados, ele aparece aqui.
                </p>

                <div className="mt-6 space-y-3">
                  {contactEmail ? (
                    <Button asChild variant="secondary" className="w-full rounded-full">
                      <a href={`mailto:${contactEmail}`}>
                        <Mail className="h-4 w-4" />
                        Enviar e-mail
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full rounded-full"
                    onClick={handleFavoriteToggle}
                    disabled={favoriteLoading}
                  >
                    {favoriteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                    {isFavorite ? "Remover favorito" : "Favoritar perfil"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="surface-dark-outline-button w-full"
                    onClick={() => {
                      if (!user) {
                        navigate(`/entrar?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
                        return;
                      }

                      setReportDialogOpen(true);
                    }}
                    disabled={Boolean(user && reportStatus && !reportStatus.canSubmit)}
                  >
                    Denunciar perfil
                  </Button>
                  <Button asChild variant="ghost" className="surface-dark-outline-button w-full">
                    <Link to="/buscar">Voltar para a busca</Link>
                  </Button>
                </div>
                {contactEmail ? <p className="mt-4 text-sm text-white/80">{contactEmail}</p> : null}
                {user && reportStatus && !reportStatus.canSubmit ? (
                  <p className="mt-4 text-sm text-white/80">
                    Seu acesso ao canal de denúncias está temporariamente restrito.
                  </p>
                ) : null}
              </div>

              <div className="surface-panel p-6">
                <p className="eyebrow">Links públicos</p>
                <div className="mt-4 space-y-3">
                  {profile.links.linkedin ? <PublicLink href={profile.links.linkedin}>LinkedIn</PublicLink> : null}
                  {profile.links.github ? <PublicLink href={profile.links.github}>GitHub</PublicLink> : null}
                  {profile.links.portfolio ? <PublicLink href={profile.links.portfolio}>Portfólio</PublicLink> : null}
                  {!profile.links.linkedin && !profile.links.github && !profile.links.portfolio ? (
                    <p className="text-sm leading-6 text-muted-foreground">Este perfil ainda não adicionou links públicos.</p>
                  ) : null}
                </div>
              </div>
            </aside>
          </section>

          <section className="mt-8">
            <div className="surface-panel p-8 md:p-10">
              <p className="eyebrow">Experiência profissional</p>
              {profile.experiences.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Este perfil ainda não publicou experiências detalhadas.
                </p>
              ) : (
                <div className="mt-8 space-y-6">
                  {profile.experiences.map((experience) => (
                    <div key={experience.id} className="grid gap-4 border-t border-border/70 pt-6 first:border-t-0 first:pt-0 md:grid-cols-[180px_minmax(0,1fr)]">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {experience.start_date} {experience.is_current ? "• atual" : experience.end_date ? `• ${experience.end_date}` : ""}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{experience.company_name}</p>
                      </div>
                      <div>
                        <h3 className="text-2xl leading-tight">{experience.role_title}</h3>
                        {experience.description ? (
                          <p className="mt-3 text-sm leading-7 text-muted-foreground">{experience.description}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <RoleContextPromptDialog
        open={recruiterPromptOpen}
        onOpenChange={setRecruiterPromptOpen}
        targetRole="recruiter"
        hasTargetRole={hasRecruiterRole}
        busy={recruiterPromptBusy}
        onConfirm={handleRecruiterPromptConfirm}
      />

      <ReportDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        title="Denunciar perfil"
        description="Use este fluxo quando o perfil publicado envolver identidade falsa, dados de terceiros, fraude, assédio ou outra violação."
        status={reportStatus}
        submitting={reportSubmitting}
        onSubmit={handleReportProfile}
      />

      <SiteFooter />
    </div>
  );
};

const PublicLink = ({ href, children }: { href: string; children: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="flex items-center justify-between rounded-[1.35rem] border border-border/80 bg-white/85 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
  >
    <span>{children}</span>
    <ExternalLink className="h-4 w-4" />
  </a>
);

export default PublicProfile;
