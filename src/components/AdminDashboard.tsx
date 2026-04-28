import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Search, Shield, ShieldAlert, ShieldCheck, UserCog } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import {
  MODERATION_ACTION_TYPE_LABEL,
  MODERATION_REPORT_CATEGORY_LABEL,
  MODERATION_RESOLUTION_CODE_LABEL,
  MODERATION_TARGET_KIND_LABEL,
} from "@/lib/moderation.js";
import { toast } from "sonner";
import type {
  AdminManagedUser,
  AdminModerationListResponse,
  ModerationReport,
} from "@/types/moderation";

function createEmptyAdminState(): AdminModerationListResponse {
  return {
    reports: [],
    hiddenProfiles: [],
    suspendedAccounts: [],
    restrictedReporters: [],
    recentActions: [],
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatAdminRoleAction(user: AdminManagedUser) {
  if (!user.lastAdminAction) {
    return null;
  }

  const actionLabel = user.lastAdminAction.actionType === "grant_administrator"
    ? "Última promoção"
    : "Última revogação";
  const actionDate = formatDate(user.lastAdminAction.createdAt);

  return `${actionLabel}: ${user.lastAdminAction.reason}${actionDate ? ` (${actionDate})` : ""}`;
}

function getModerationPunitiveAction(report: ModerationReport) {
  if (report.targetKind === "recruiter_contact_access") {
    return {
      decision: "suspend_target_account" as const,
      label: "Suspender conta",
      variant: "destructive" as const,
      hint: "Abuso do canal de contato exige decisão manual de suspensão.",
    };
  }

  if (report.targetKind !== "professional_public_profile" || !report.nextSanction) {
    return null;
  }

  if (report.nextSanction === "hide_professional_profile") {
    return {
      decision: "hide_professional_profile" as const,
      label: "Ocultar perfil",
      variant: "default" as const,
      hint: "Primeira sanção: retirar o perfil da vitrine para correção e revisão.",
    };
  }

  if (report.nextSanction === "suspend_target_account") {
    return {
      decision: "suspend_target_account" as const,
      label: "Suspender conta",
      variant: "destructive" as const,
      hint: "Segunda sanção: suspender o acesso à plataforma.",
    };
  }

  return {
    decision: "permanent_ban_target_account" as const,
    label: "Banir definitivamente",
    variant: "destructive" as const,
    hint:
      report.category === "discrimination"
        ? "Conteúdo discriminatório em perfil público segue banimento definitivo imediato."
        : "Terceira sanção: encerrar o acesso e iniciar a exclusão dos dados operacionais.",
  };
}

export const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminModerationListResponse>(createEmptyAdminState());
  const [selectedReport, setSelectedReport] = useState<ModerationReport | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminManagedUser[]>([]);
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [adminUserReason, setAdminUserReason] = useState("");

  const loadQueue = async () => {
    const response = await api.admin.getModerationReports();
    setData(response);
    return response;
  };

  const loadAdminUsers = async (query = adminUserQuery) => {
    const response = await api.admin.getUsers(query);
    setAdminUsers(response.users.filter((user) => !user.isReservedInternalAdmin));
    return response;
  };

  useEffect(() => {
    let active = true;

    async function loadInitialState() {
      try {
        const [moderationResponse, adminUsersResponse] = await Promise.all([
          api.admin.getModerationReports(),
          api.admin.getUsers(""),
        ]);

        if (!active) {
          return;
        }

        setData(moderationResponse);
        setAdminUsers(adminUsersResponse.users.filter((user) => !user.isReservedInternalAdmin));
      } catch {
        if (!active) return;
        toast.error("Não foi possível carregar o console administrativo agora.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadInitialState();

    return () => {
      active = false;
    };
  }, []);

  const openReport = async (reportId: number) => {
    try {
      setBusyAction(`open-${reportId}`);
      const response = await api.admin.getModerationReport(reportId);
      setSelectedReport(response.report);
      setDecisionNotes("");
    } catch {
      toast.error("Não foi possível abrir esse caso agora.");
    } finally {
      setBusyAction(null);
    }
  };

  const resolveReport = async (
    decision:
      | "dismiss_good_faith"
      | "dismiss_false_report"
      | "hide_professional_profile"
      | "suspend_target_account"
      | "permanent_ban_target_account",
  ) => {
    if (!selectedReport) {
      return;
    }

    if (decisionNotes.trim().length < 3) {
      toast.error("Registre notas curtas antes de concluir a decisão.");
      return;
    }

    try {
      setBusyAction(`resolve-${decision}`);
      const response = await api.admin.resolveModerationReport(selectedReport.id, {
        decision,
        adminNotes: decisionNotes.trim(),
      });
      setSelectedReport(response.report);
      await loadQueue();
      toast.success("Decisão registrada.");
    } catch {
      toast.error("Não foi possível registrar essa decisão agora.");
    } finally {
      setBusyAction(null);
    }
  };

  const restoreProfile = async (userId: number) => {
    try {
      setBusyAction(`restore-profile-${userId}`);
      await api.admin.restoreProfile(userId, {
        reason: "Perfil revisado e liberado novamente.",
      });
      await loadQueue();
      toast.success("Perfil liberado para nova publicação.");
    } catch {
      toast.error("Não foi possível restaurar esse perfil agora.");
    } finally {
      setBusyAction(null);
    }
  };

  const restoreAccount = async (userId: number) => {
    try {
      setBusyAction(`restore-account-${userId}`);
      await api.admin.restoreAccount(userId, {
        reason: "Conta restaurada após revisão administrativa.",
      });
      await loadQueue();
      toast.success("Conta restaurada.");
    } catch {
      toast.error("Não foi possível restaurar essa conta agora.");
    } finally {
      setBusyAction(null);
    }
  };

  const liftRestriction = async (userId: number) => {
    try {
      setBusyAction(`lift-restriction-${userId}`);
      await api.admin.liftReportingRestriction(userId, {
        reason: "Restrição removida após revisão administrativa.",
      });
      await loadQueue();
      toast.success("Restrição removida.");
    } catch {
      toast.error("Não foi possível remover essa restrição agora.");
    } finally {
      setBusyAction(null);
    }
  };

  const applyAdminRoleChange = async (user: AdminManagedUser, action: "promote" | "revoke") => {
    const reason = adminUserReason.trim();

    if (reason.length < 3) {
      toast.error("Informe o motivo da alteração administrativa.");
      return;
    }

    try {
      setBusyAction(`${action}-${user.id}`);

      if (action === "promote") {
        await api.admin.promoteUserToAdministrator(user.id, { reason });
      } else {
        await api.admin.revokeAdministratorFromUser(user.id, { reason });
      }

      await loadAdminUsers(adminUserQuery);
      toast.success(action === "promote" ? "Conta promovida para administração." : "Privilégios administrativos revogados.");
    } catch {
      toast.error("Não foi possível atualizar essa conta administrativa agora.");
    } finally {
      setBusyAction(null);
    }
  };

  const runAdminUserSearch = async () => {
    try {
      setBusyAction("search-admin-users");
      await loadAdminUsers(adminUserQuery);
    } catch {
      toast.error("Não foi possível carregar essa lista agora.");
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const promotionCandidates = adminUsers.filter((user) => !user.isAdministrator);
  const currentAdministrators = adminUsers.filter((user) => user.isAdministrator);
  const selectedPunitiveAction = selectedReport ? getModerationPunitiveAction(selectedReport) : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container py-10 md:py-14">
        <PageHeader
          eyebrow="Administração e curadoria"
          title="Fila de moderação"
          description="Revise denúncias abertas, aplique a decisão adequada e acompanhe perfis ocultados, contas suspensas e restrições do canal."
          aside={
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>Casos pendentes: {data.reports.length}.</p>
              <p>Perfis ocultados: {data.hiddenProfiles.length}.</p>
              <p>Contas suspensas: {data.suspendedAccounts.length}.</p>
            </div>
          }
        />

        <section className="surface-panel mt-10 p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <UserCog className="h-5 w-5 text-primary" />
                <h2 className="text-2xl leading-tight">Gestão de administradores internos</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Promova contas internas verificadas, revogue privilégios e mantenha a trilha operacional restrita ao domínio interno.
              </p>
            </div>

            <form
              className="flex w-full flex-col gap-3 lg:max-w-md"
              onSubmit={(event) => {
                event.preventDefault();
                void runAdminUserSearch();
              }}
            >
              <Label htmlFor="admin-user-search">Buscar conta interna</Label>
              <div className="flex gap-3">
                <Input
                  id="admin-user-search"
                  value={adminUserQuery}
                  onChange={(event) => setAdminUserQuery(event.target.value)}
                  placeholder="Nome ou e-mail"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="rounded-full"
                  disabled={busyAction === "search-admin-users"}
                >
                  {busyAction === "search-admin-users" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-6 space-y-3">
            <Label htmlFor="admin-role-change-reason">Motivo da alteração administrativa</Label>
            <Textarea
              id="admin-role-change-reason"
              value={adminUserReason}
              onChange={(event) => setAdminUserReason(event.target.value)}
              placeholder="Registre o motivo operacional da promoção ou revogação."
              className="min-h-[110px]"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-[1.5rem] border border-border/80 bg-white/75 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl leading-tight">Contas internas elegíveis</h3>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {promotionCandidates.length}
                </Badge>
              </div>

              <div className="mt-5 space-y-4">
                {promotionCandidates.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-border/80 bg-secondary/50 p-4 text-sm leading-6 text-muted-foreground">
                    Nenhuma conta interna elegível com os filtros atuais.
                  </div>
                ) : (
                  promotionCandidates.map((user) => (
                    <div key={user.id} className="rounded-[1.25rem] border border-border/80 bg-background/80 p-4">
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{user.email}</p>
                      {formatAdminRoleAction(user) ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{formatAdminRoleAction(user)}</p>
                      ) : null}
                      <Button
                        type="button"
                        className="mt-4 rounded-full"
                        aria-label={`Promover ${user.name}`}
                        disabled={!user.canPromote || Boolean(busyAction)}
                        onClick={() => applyAdminRoleChange(user, "promote")}
                      >
                        {busyAction === `promote-${user.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Promover
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border/80 bg-white/75 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl leading-tight">Administradores gerenciáveis</h3>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {currentAdministrators.length}
                </Badge>
              </div>

              <div className="mt-5 space-y-4">
                {currentAdministrators.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-border/80 bg-secondary/50 p-4 text-sm leading-6 text-muted-foreground">
                    Nenhum administrador adicional disponível para revogação.
                  </div>
                ) : (
                  currentAdministrators.map((user) => (
                    <div key={user.id} className="rounded-[1.25rem] border border-border/80 bg-background/80 p-4">
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{user.email}</p>
                      {formatAdminRoleAction(user) ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{formatAdminRoleAction(user)}</p>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 rounded-full"
                        aria-label={`Revogar ${user.name}`}
                        disabled={!user.canRevoke || Boolean(busyAction)}
                        onClick={() => applyAdminRoleChange(user, "revoke")}
                      >
                        {busyAction === `revoke-${user.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Revogar
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="surface-panel p-7">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h2 className="text-2xl leading-tight">Casos pendentes</h2>
            </div>

            <div className="mt-6 space-y-4">
              {data.reports.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-secondary/50 p-5 text-sm leading-6 text-muted-foreground">
                  Nenhuma denúncia pendente no momento.
                </div>
              ) : (
                data.reports.map((report) => (
                  <div key={report.id} className="rounded-[1.5rem] border border-border/80 bg-white/75 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            {MODERATION_TARGET_KIND_LABEL[report.targetKind]}
                          </Badge>
                          <Badge className="rounded-full px-3 py-1">
                            {MODERATION_REPORT_CATEGORY_LABEL[report.category]}
                          </Badge>
                        </div>
                        <div>
                          <h3 className="text-xl leading-tight">{report.targetName}</h3>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Denunciante: {report.reporterName}
                          </p>
                          {report.createdAt ? (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              Aberta em {formatDate(report.createdAt)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={busyAction === `open-${report.id}`}
                        onClick={() => openReport(report.id)}
                      >
                        {busyAction === `open-${report.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Abrir caso
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="surface-panel p-7">
            {selectedReport ? (
              <>
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl leading-tight">Detalhe do caso</h2>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="rounded-[1.5rem] border border-border/80 bg-white/75 p-5">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {MODERATION_TARGET_KIND_LABEL[selectedReport.targetKind]}
                      </Badge>
                      <Badge className="rounded-full px-3 py-1">
                        {MODERATION_REPORT_CATEGORY_LABEL[selectedReport.category]}
                      </Badge>
                      {selectedReport.resolutionCode ? (
                        <Badge variant="secondary" className="rounded-full px-3 py-1">
                          {MODERATION_RESOLUTION_CODE_LABEL[selectedReport.resolutionCode]}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="mt-4 text-2xl leading-tight">{selectedReport.targetName}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Denunciante: {selectedReport.reporterName}
                    </p>
                    {selectedReport.targetKind === "professional_public_profile" && selectedReport.category !== "discrimination" ? (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Histórico punitivo anterior: {selectedReport.targetStrikeCount ?? 0}.
                      </p>
                    ) : null}
                    {selectedPunitiveAction ? (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {selectedPunitiveAction.hint}
                      </p>
                    ) : null}
                    <p className="mt-4 text-sm leading-7 text-foreground">{selectedReport.description}</p>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="admin-decision-notes">Notas da decisão</Label>
                    <Textarea
                      id="admin-decision-notes"
                      value={decisionNotes}
                      onChange={(event) => setDecisionNotes(event.target.value)}
                      placeholder="Registre a análise administrativa do caso."
                      className="min-h-[130px]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      disabled={selectedReport.status !== "open" || Boolean(busyAction)}
                      onClick={() => resolveReport("dismiss_good_faith")}
                    >
                      Arquivar sem penalidade
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      disabled={selectedReport.status !== "open" || Boolean(busyAction)}
                      onClick={() => resolveReport("dismiss_false_report")}
                    >
                      Marcar denúncia falsa
                    </Button>
                    <Button
                      type="button"
                      variant={selectedPunitiveAction?.variant === "destructive" ? "destructive" : "default"}
                      className="rounded-full"
                      disabled={selectedReport.status !== "open" || !selectedPunitiveAction || Boolean(busyAction)}
                      onClick={() => {
                        if (selectedPunitiveAction) {
                          void resolveReport(selectedPunitiveAction.decision);
                        }
                      }}
                    >
                      {selectedPunitiveAction?.label || "Aplicar sanção"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-secondary/50 p-6 text-sm leading-6 text-muted-foreground">
                Selecione um caso pendente para revisar o relato e concluir a decisão administrativa.
              </div>
            )}
          </section>
        </div>

        <section className="surface-panel mt-6 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl leading-tight">Auditoria de moderação</h2>
          </div>

          <div className="mt-5 space-y-4">
            {data.recentActions.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-border/80 bg-secondary/50 p-4 text-sm leading-6 text-muted-foreground">
                Nenhuma ação administrativa recente registrada.
              </div>
            ) : (
              data.recentActions.map((action) => (
                <div key={action.id} className="rounded-[1.4rem] border border-border/80 bg-white/75 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{MODERATION_ACTION_TYPE_LABEL[action.actionType]}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {action.subjectName}
                        {action.subjectEmailHint ? ` · ${action.subjectEmailHint}` : ""}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.reason}</p>
                    </div>
                    <div className="text-sm leading-6 text-muted-foreground">
                      {action.createdAt ? formatDate(action.createdAt) : "Sem data"}
                      {action.createdByName ? ` · ${action.createdByName}` : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="surface-panel p-6">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-xl leading-tight">Perfis ocultados</h2>
            </div>
            <div className="mt-5 space-y-4">
              {data.hiddenProfiles.map((profile) => (
                <div key={profile.userId} className="rounded-[1.4rem] border border-border/80 bg-white/75 p-4">
                  <p className="font-medium text-foreground">{profile.name}</p>
                  {profile.blockReason ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{profile.blockReason}</p> : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 rounded-full"
                    disabled={busyAction === `restore-profile-${profile.userId}`}
                    onClick={() => restoreProfile(profile.userId)}
                  >
                    {busyAction === `restore-profile-${profile.userId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Restaurar perfil
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-panel p-6">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h2 className="text-xl leading-tight">Contas suspensas</h2>
            </div>
            <div className="mt-5 space-y-4">
              {data.suspendedAccounts.map((account) => (
                <div key={account.userId} className="rounded-[1.4rem] border border-border/80 bg-white/75 p-4">
                  <p className="font-medium text-foreground">{account.name}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{account.emailHint}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 rounded-full"
                    disabled={busyAction === `restore-account-${account.userId}`}
                    onClick={() => restoreAccount(account.userId)}
                  >
                    {busyAction === `restore-account-${account.userId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Restaurar conta
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-panel p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <h2 className="text-xl leading-tight">Denunciantes restritos</h2>
            </div>
            <div className="mt-5 space-y-4">
              {data.restrictedReporters.map((reporter) => (
                <div key={reporter.userId} className="rounded-[1.4rem] border border-border/80 bg-white/75 p-4">
                  <p className="font-medium text-foreground">{reporter.name}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{reporter.emailHint}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {reporter.falseReportStrikeCount} registros improcedentes na janela atual.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 rounded-full"
                    disabled={busyAction === `lift-restriction-${reporter.userId}`}
                    onClick={() => liftRestriction(reporter.userId)}
                  >
                    {busyAction === `lift-restriction-${reporter.userId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Reativar denúncias
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
