import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BookmarkPlus,
  Briefcase,
  ChevronsUpDown,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  Mail,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { AdminDashboard } from "@/components/AdminDashboard";
import { PageHeader } from "@/components/PageHeader";
import { ReportDialog } from "@/components/ReportDialog";
import { useAuth } from "@/hooks/useAuth";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { useIsMobile } from "@/hooks/use-mobile";
import api from "@/lib/api";
import {
  createEmptyExperienceDraft,
  clearLegacyProfessionalProfileDrafts,
  createProfessionalProfileDraftBaseline,
  createProfessionalProfileDraftSnapshot,
  loadProfessionalProfileDraft,
  persistProfessionalProfileDraft,
  clearProfessionalProfileDraft,
} from "@/lib/professional-profile-draft";
import { normalizeFavoriteProfileInput, normalizeProfileDataInput } from "@/lib/profile-normalization";
import {
  BRAZILIAN_STATES,
  SENIORITY_LABEL,
  STATE_LABEL,
  WORK_MODEL_LABEL,
  WORK_MODEL_VALUES,
  formatWorkModelList,
} from "@/lib/profile-options";
import {
  formatSavedSearchAlertBadge,
  formatSavedSearchCriteria,
  getPublicationIssues,
  getSavedSearchUpdatedToastMessage,
  SAVED_SEARCH_ALERT_FREQUENCIES,
  SAVED_SEARCH_ALERT_FREQUENCY_LABEL,
} from "@/lib/talent-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  AFFIRMATIVE_GROUP_LABEL,
  AFFIRMATIVE_GROUP_VALUES,
  AFFIRMATIVE_POLICY_VERSION,
} from "@/lib/affirmative-config.js";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal-policies.js";
import {
  createEmptyProfileData,
  type AffirmativeGroup,
  type Experience,
  type FavoriteProfile,
  type ProfileData,
  type ProfilePublication,
  type SavedSearchAlertFrequency,
  type SavedSearch,
} from "@/types/profile";
import type {
  ContactAccessLog,
  ModerationReportCategory,
  ReportSubmissionStatus,
} from "@/types/moderation";

function formatRelativeDateLabel(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

const EXPERIENCE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CONTACT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeDashboardEmail(value: string) {
  return value.trim().toLowerCase();
}

function formatExperienceDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

const Dashboard = () => {
  const { user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/entrar?next=%2Fdashboard");
    }
  }, [loading, navigate, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (user.activeRole === "professional") {
    return <ProfessionalDashboard refreshUser={refreshUser} />;
  }

  if (user.activeRole === "recruiter") {
    return <RecruiterDashboard />;
  }

  return (
    <AdminDashboard />
  );
};

const mergeProfileWithDefaults = (
  nextProfile: Partial<ProfileData> | undefined,
  fallbackName = "",
  fallbackContactEmail = "",
): ProfileData => {
  return normalizeProfileDataInput(nextProfile, fallbackName, fallbackContactEmail);
};

const ProfessionalDashboard = ({ refreshUser }: { refreshUser: () => Promise<void> }) => {
  const { user, signOut } = useAuth();
  const { canUseOptionalStorage } = useCookieConsent();
  const isMobile = useIsMobile();
  const accountEmail = user?.email || "";
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData>(createEmptyProfileData(user?.name || "", accountEmail));
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [workModelsPopoverOpen, setWorkModelsPopoverOpen] = useState(false);
  const [contactEmailChallengeId, setContactEmailChallengeId] = useState("");
  const [contactEmailChallengeTarget, setContactEmailChallengeTarget] = useState("");
  const [contactEmailVerificationCode, setContactEmailVerificationCode] = useState("");
  const [contactEmailVerifiedFor, setContactEmailVerifiedFor] = useState("");
  const [contactEmailCodeSending, setContactEmailCodeSending] = useState(false);
  const [contactEmailCodeVerifying, setContactEmailCodeVerifying] = useState(false);
  const [contactAccesses, setContactAccesses] = useState<ContactAccessLog[]>([]);
  const [reportSubmissionStatus, setReportSubmissionStatus] = useState<ReportSubmissionStatus | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedContactAccess, setSelectedContactAccess] = useState<ContactAccessLog | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [publication, setPublication] = useState<ProfilePublication>({
    isPublished: false,
    publicSlug: "",
    publishedAt: null,
    updatedAt: null,
    expiredAt: null,
    staleAfterAt: null,
    freshnessStatus: "active",
    isPublishable: false,
    issues: [],
    moderationBlockedAt: null,
    moderationBlockReason: null,
  });
  const [newSkill, setNewSkill] = useState("");
  const [affirmativeConsentAccepted, setAffirmativeConsentAccepted] = useState(false);
  const [newExperience, setNewExperience] = useState<Experience>(createEmptyExperienceDraft());
  const baselineDraftSnapshotRef = useRef(
    createProfessionalProfileDraftBaseline(createEmptyProfileData(user?.name || "", accountEmail), false),
  );
  const latestDraftSnapshotRef = useRef(
    createProfessionalProfileDraftBaseline(createEmptyProfileData(user?.name || "", accountEmail), false),
  );
  const latestPublicationUpdatedAtRef = useRef<string | null>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const autosaveReadyRef = useRef(false);
  const currentIssues = getPublicationIssues(profile);
  const canPublishProfile = currentIssues.length === 0;
  const publicProfileUrl = publication.publicSlug ? `/profissionais/${publication.publicSlug}` : "";
  const affirmativeGroups = profile.affirmativeProfile?.groups || [];
  const affirmativeConsentRecorded = Boolean(profile.affirmativeProfile?.consentAcceptedAt);
  const normalizedAccountEmail = normalizeDashboardEmail(accountEmail);
  const normalizedCurrentContactEmail = normalizeDashboardEmail(profile.contactEmail);
  const normalizedBaselineContactEmail = normalizeDashboardEmail(baselineDraftSnapshotRef.current.profile.contactEmail || accountEmail);
  const contactEmailUsesAccountEmail = normalizedCurrentContactEmail === normalizedAccountEmail;
  const contactEmailLooksValid = CONTACT_EMAIL_REGEX.test(normalizedCurrentContactEmail);
  const requiresContactEmailVerification =
    normalizedCurrentContactEmail !== normalizedAccountEmail &&
    normalizedCurrentContactEmail !== normalizedBaselineContactEmail;
  const hasVerifiedContactEmail = requiresContactEmailVerification && contactEmailVerifiedFor === normalizedCurrentContactEmail;
  const freshnessDeadlineLabel = formatRelativeDateLabel(publication.staleAfterAt);
  const isExpiredProfile = publication.freshnessStatus === "expired";
  const publicationStatus = isExpiredProfile
    ? {
        label: "Expirado",
        className: "border-destructive/20 bg-destructive/10 text-destructive",
        description: "Seu perfil saiu da descoberta pública por falta de atualização recente.",
      }
    : publication.isPublished
    ? {
        label: "Publicado",
        className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
        description: "Seu perfil já está disponível na descoberta pública.",
      }
    : canPublishProfile
      ? {
          label: "Pronto para publicar",
          className: "border-[hsl(var(--accent))]/20 bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]",
          description: "Checklist concluído. Você pode ligar a publicação quando quiser.",
        }
      : {
          label: "Checklist pendente",
          className: "border-destructive/20 bg-destructive/10 text-destructive",
          description: `${currentIssues.length} ${currentIssues.length === 1 ? "ajuste ainda falta" : "ajustes ainda faltam"} antes da publicação.`,
        };
  const availabilityStatus = profile.openToOpportunities
    ? {
        label: "Visível",
        className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
        description: "A busca mostra você como aberto a oportunidades.",
      }
      : {
          label: "Oculta",
          className: "border-border/80 bg-secondary/70 text-foreground",
          description: "A busca não destaca você como aberto a oportunidades.",
        };
  const selectedWorkModelsLabel = profile.workModels.length ? formatWorkModelList(profile.workModels) : "Selecione";
  const experienceDateInputClassName =
    "mt-2 block h-11 min-w-0 max-w-full rounded-2xl border-border/80 bg-white/85 text-sm sm:text-base";
  const usesPlainTextExperienceDates = isMobile;
  const draftStorageUserId = user?.id ?? null;

  const clearAutosaveTimeout = () => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
  };

  const resetContactEmailVerificationState = () => {
    setContactEmailChallengeId("");
    setContactEmailChallengeTarget("");
    setContactEmailVerificationCode("");
    setContactEmailVerifiedFor("");
  };

  const persistCurrentDraftSnapshot = (snapshot = latestDraftSnapshotRef.current) => {
    if (!canUseOptionalStorage || !draftStorageUserId || !autosaveReadyRef.current) {
      setHasLocalDraft(false);
      return false;
    }

    const hasDraft = persistProfessionalProfileDraft({
      userId: draftStorageUserId,
      currentSnapshot: snapshot,
      baselineSnapshot: baselineDraftSnapshotRef.current,
      sourcePublicationUpdatedAt: latestPublicationUpdatedAtRef.current,
    });

    setHasLocalDraft(hasDraft);
    return hasDraft;
  };

  useEffect(() => {
    let active = true;
    autosaveReadyRef.current = false;
    clearAutosaveTimeout();

    Promise.allSettled([
      api.profile.get(),
      api.profile.getContactAccesses(),
      api.reports.getMyStatus(),
    ])
      .then(([profileResult, contactAccessResult, reportStatusResult]) => {
        if (!active) return;

        if (profileResult.status !== "fulfilled") {
          toast.error("Não foi possível carregar seu perfil agora.");
          return;
        }

        const response = profileResult.value;
        const nextProfile = mergeProfileWithDefaults(response.profile, user?.name || "", accountEmail);
        const nextAffirmativeConsentAccepted = Boolean(nextProfile.affirmativeProfile.consentAcceptedAt);
        const baselineDraftSnapshot = createProfessionalProfileDraftBaseline(
          nextProfile,
          nextAffirmativeConsentAccepted,
        );

        if (canUseOptionalStorage && draftStorageUserId) {
          clearLegacyProfessionalProfileDrafts(draftStorageUserId);
        }

        const storedDraft = canUseOptionalStorage && draftStorageUserId
          ? loadProfessionalProfileDraft(draftStorageUserId)
          : { status: "missing" as const, draft: null };

        baselineDraftSnapshotRef.current = baselineDraftSnapshot;
        latestPublicationUpdatedAtRef.current = response.publication.updatedAt;

        if (!canUseOptionalStorage && draftStorageUserId) {
          clearProfessionalProfileDraft(draftStorageUserId);
        }

        if (storedDraft.status === "valid" && storedDraft.draft) {
          setProfile(
            mergeProfileWithDefaults(
              {
                ...nextProfile,
                ...storedDraft.draft.profile,
              },
              user?.name || "",
              accountEmail,
            ),
          );
          setAffirmativeConsentAccepted(nextAffirmativeConsentAccepted);
          setNewSkill(storedDraft.draft.newSkill);
          setNewExperience(storedDraft.draft.newExperience);
          setHasLocalDraft(true);
        } else {
          setProfile(nextProfile);
          setAffirmativeConsentAccepted(nextAffirmativeConsentAccepted);
          setNewSkill("");
          setNewExperience(createEmptyExperienceDraft());
          setHasLocalDraft(false);
        }

        setContactAccesses(
          contactAccessResult.status === "fulfilled" ? contactAccessResult.value.accesses : [],
        );
        setReportSubmissionStatus(
          reportStatusResult.status === "fulfilled" ? reportStatusResult.value : null,
        );
        resetContactEmailVerificationState();
        setPublication(response.publication);
        autosaveReadyRef.current = true;
      })
      .finally(() => {
        if (!active) return;
        setProfileLoading(false);
      });

    return () => {
      active = false;
      autosaveReadyRef.current = false;
      clearAutosaveTimeout();
    };
  }, [accountEmail, canUseOptionalStorage, draftStorageUserId, user?.name]);

  useEffect(() => {
    if (contactEmailChallengeTarget && contactEmailChallengeTarget !== normalizedCurrentContactEmail) {
      resetContactEmailVerificationState();
    }
  }, [contactEmailChallengeTarget, normalizedCurrentContactEmail]);

  useEffect(() => {
    const nextDraftSnapshot = createProfessionalProfileDraftSnapshot({
      profile,
      affirmativeConsentAccepted,
      newSkill,
      newExperience,
    });

    latestDraftSnapshotRef.current = nextDraftSnapshot;

    if (!canUseOptionalStorage || !draftStorageUserId || !autosaveReadyRef.current) {
      setHasLocalDraft(false);
      return;
    }

    clearAutosaveTimeout();
    autosaveTimeoutRef.current = window.setTimeout(() => {
      const hasDraft = persistProfessionalProfileDraft({
        userId: draftStorageUserId,
        currentSnapshot: nextDraftSnapshot,
        baselineSnapshot: baselineDraftSnapshotRef.current,
        sourcePublicationUpdatedAt: latestPublicationUpdatedAtRef.current,
      });

      setHasLocalDraft(hasDraft);
    }, 800);

    return () => {
      clearAutosaveTimeout();
    };
  }, [affirmativeConsentAccepted, canUseOptionalStorage, draftStorageUserId, newExperience, newSkill, profile]);

  useEffect(() => {
    latestPublicationUpdatedAtRef.current = publication.updatedAt;
  }, [publication.updatedAt]);

  useEffect(() => {
    if (!canUseOptionalStorage || !draftStorageUserId) {
      return;
    }

    const flushDraft = () => {
      clearAutosaveTimeout();

      if (!autosaveReadyRef.current) {
        return;
      }

      const hasDraft = persistProfessionalProfileDraft({
        userId: draftStorageUserId,
        currentSnapshot: latestDraftSnapshotRef.current,
        baselineSnapshot: baselineDraftSnapshotRef.current,
        sourcePublicationUpdatedAt: latestPublicationUpdatedAtRef.current,
      });

      setHasLocalDraft(hasDraft);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
      }
    };

    window.addEventListener("beforeunload", flushDraft);
    window.addEventListener("pagehide", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", flushDraft);
      window.removeEventListener("pagehide", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canUseOptionalStorage, draftStorageUserId]);

  const handleRequestContactEmailCode = async () => {
    if (!requiresContactEmailVerification || !contactEmailLooksValid) {
      toast.error("Informe um e-mail de contato válido para confirmar a troca.");
      return;
    }

    try {
      setContactEmailCodeSending(true);
      const response = await api.profile.requestContactEmailCode({
        nextContactEmail: normalizedCurrentContactEmail,
      });

      setContactEmailChallengeId(response.challengeId);
      setContactEmailChallengeTarget(normalizedCurrentContactEmail);
      setContactEmailVerificationCode("");
      setContactEmailVerifiedFor("");
      toast.success(response.message);
    } catch {
      toast.error("Não foi possível enviar o código de confirmação agora.");
    } finally {
      setContactEmailCodeSending(false);
    }
  };

  const handleVerifyContactEmailCode = async () => {
    if (!contactEmailChallengeId) {
      toast.error("Peça um código antes de confirmar o e-mail.");
      return;
    }

    if (!/^\d{6}$/.test(contactEmailVerificationCode.trim())) {
      toast.error("Use um código de 6 dígitos para confirmar o e-mail.");
      return;
    }

    try {
      setContactEmailCodeVerifying(true);
      await api.profile.verifyContactEmailCode({
        challengeId: contactEmailChallengeId,
        code: contactEmailVerificationCode.trim(),
      });
      setContactEmailVerifiedFor(normalizedCurrentContactEmail);
      toast.success("E-mail de contato confirmado para o próximo salvamento.");
    } catch {
      toast.error("Não foi possível confirmar esse código agora.");
    } finally {
      setContactEmailCodeVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!contactEmailLooksValid) {
      toast.error("Informe um e-mail de contato válido.");
      return;
    }

    if (requiresContactEmailVerification && !hasVerifiedContactEmail) {
      toast.error("Confirme o novo e-mail de contato antes de salvar.");
      return;
    }

    if (profile.affirmativeProfile.groups.length > 0 && !affirmativeConsentAccepted) {
      toast.error("Confirme o uso inclusivo desses dados antes de salvar a autodeclaração.");
      return;
    }

    try {
      setSaving(true);
      const requestedPublication = profile.isPublished;
      const wasExpired = publication.freshnessStatus === "expired";
      const response = await api.profile.update({
        ...profile,
        affirmativeConsentAccepted,
      });
      const nextProfile = mergeProfileWithDefaults(response.profile, user?.name || "", accountEmail);
      const nextAffirmativeConsentAccepted = Boolean(nextProfile.affirmativeProfile.consentAcceptedAt);

      baselineDraftSnapshotRef.current = createProfessionalProfileDraftBaseline(
        nextProfile,
        nextAffirmativeConsentAccepted,
      );
      latestPublicationUpdatedAtRef.current = response.publication.updatedAt;
      setProfile(nextProfile);
      setAffirmativeConsentAccepted(nextAffirmativeConsentAccepted);
      setPublication(response.publication);
      resetContactEmailVerificationState();
      persistCurrentDraftSnapshot(
        createProfessionalProfileDraftSnapshot({
          profile: nextProfile,
          affirmativeConsentAccepted: nextAffirmativeConsentAccepted,
          newSkill,
          newExperience,
        }),
      );
      await refreshUser();

      if (wasExpired && requestedPublication && !response.publication.isPublished) {
        toast.success("Perfil atualizado. Agora faça uma nova publicação manual para voltar à descoberta.");
        return;
      }

      toast.success(response.publication.isPublished ? "Perfil salvo e publicado com sucesso." : "Perfil salvo com sucesso.");
    } catch (error) {
      const apiError = error as { error?: string; issues?: Array<{ path?: string; message?: string }> };

      if (apiError.error === "profile_not_publishable") {
        toast.error("Seu perfil ainda não atende aos critérios mínimos de publicação.");
        return;
      }

      if (apiError.error === "validation_error" && apiError.issues?.some((issue) => issue.path === "affirmativeConsentAccepted")) {
        toast.error("Confirme o uso inclusivo desses dados antes de salvar a autodeclaração.");
        return;
      }

      if (apiError.error === "validation_error" && apiError.issues?.some((issue) => issue.path === "contactEmail")) {
        toast.error("Confirme o novo e-mail de contato antes de salvar.");
        return;
      }

      toast.error("Não foi possível salvar o perfil agora.");
    } finally {
      setSaving(false);
    }
  };

  const openRecruiterReportDialog = (access: ContactAccessLog) => {
    setSelectedContactAccess(access);
    setReportDialogOpen(true);
  };

  const handleSubmitRecruiterReport = async ({
    category,
    description,
  }: {
    category: ModerationReportCategory;
    description: string;
  }) => {
    if (!selectedContactAccess) {
      return;
    }

    try {
      setReportSubmitting(true);
      await api.reports.submit({
        targetKind: "recruiter_contact_access",
        targetRef: String(selectedContactAccess.id),
        category,
        description,
      });
      const nextStatus = await api.reports.getMyStatus().catch(() => null);

      if (nextStatus) {
        setReportSubmissionStatus(nextStatus);
      }

      setReportDialogOpen(false);
      setSelectedContactAccess(null);
      toast.success("Denúncia enviada.");
    } catch (error) {
      const apiError = error as { error?: string };

      if (apiError.error === "email_delivery_failed") {
        toast.error("Não foi possível confirmar a denúncia por e-mail agora. Tente novamente em instantes.");
        return;
      }

      if (apiError.error === "report_already_open") {
        toast.error("Já existe uma denúncia aberta para esse acesso.");
        return;
      }

      if (apiError.error === "reporting_restricted") {
        const nextStatus = await api.reports.getMyStatus().catch(() => null);

        if (nextStatus) {
          setReportSubmissionStatus(nextStatus);
        }

        toast.error("Seu acesso ao canal de denúncias está temporariamente restrito.");
        return;
      }

      toast.error("Não foi possível enviar a denúncia agora.");
    } finally {
      setReportSubmitting(false);
    }
  };

  const addSkill = () => {
    const normalizedSkill = newSkill.trim();

    if (!normalizedSkill || profile.skills.includes(normalizedSkill)) {
      return;
    }

    setProfile((current) => ({
      ...current,
      skills: [...current.skills, normalizedSkill],
    }));
    setNewSkill("");
  };

  const removeSkill = (skillToRemove: string) => {
    setProfile((current) => ({
      ...current,
      skills: current.skills.filter((skill) => skill !== skillToRemove),
    }));
  };

  const addExperience = () => {
    if (!newExperience.role_title || !newExperience.company_name || !newExperience.start_date) {
      toast.error("Preencha cargo, empresa e data de início antes de adicionar a experiência.");
      return;
    }

    if (!EXPERIENCE_DATE_REGEX.test(newExperience.start_date) || (newExperience.end_date && !EXPERIENCE_DATE_REGEX.test(newExperience.end_date))) {
      toast.error("Use o formato AAAA-MM-DD nas datas antes de adicionar a experiência.");
      return;
    }

    if (!newExperience.is_current && newExperience.end_date && newExperience.end_date < newExperience.start_date) {
      toast.error("A data de fim não pode ser anterior à data de início.");
      return;
    }

    setProfile((current) => ({
      ...current,
      experiences: [
        ...current.experiences,
        {
          ...newExperience,
          id: crypto.randomUUID(),
        },
      ],
    }));
    setNewExperience(createEmptyExperienceDraft());
  };

  const removeExperience = (id: string) => {
    setProfile((current) => ({
      ...current,
      experiences: current.experiences.filter((experience) => experience.id !== id),
    }));
  };

  const toggleWorkModel = (workModel: ProfileData["workModels"][number], checked: boolean) => {
    setProfile((current) => ({
      ...current,
      workModels: checked
        ? WORK_MODEL_VALUES.filter((item) => [...current.workModels, workModel].includes(item))
        : current.workModels.filter((item) => item !== workModel),
    }));
  };

  const toggleAffirmativeGroup = (group: AffirmativeGroup, checked: boolean) => {
    setProfile((current) => {
      const nextGroups = checked
        ? [...new Set([...current.affirmativeProfile.groups, group])]
        : current.affirmativeProfile.groups.filter((item) => item !== group);

      if (nextGroups.length === 0) {
        setAffirmativeConsentAccepted(false);
      }

      return {
        ...current,
        affirmativeProfile: {
          ...current.affirmativeProfile,
          groups: nextGroups,
        },
      };
    });
  };

  const revokeAffirmativeProfile = () => {
    setProfile((current) => ({
      ...current,
      affirmativeProfile: {
        groups: [],
        policyVersion: "",
        consentAcceptedAt: null,
      },
    }));
    setAffirmativeConsentAccepted(false);
    toast.success("Autodeclaração marcada para remoção. Salve o perfil para concluir.");
  };

  const discardLocalDraft = () => {
    clearAutosaveTimeout();

    if (draftStorageUserId) {
      clearProfessionalProfileDraft(draftStorageUserId);
    }

    setProfile(baselineDraftSnapshotRef.current.profile);
    setAffirmativeConsentAccepted(baselineDraftSnapshotRef.current.affirmativeConsentAccepted);
    setNewSkill(baselineDraftSnapshotRef.current.newSkill);
    setNewExperience(baselineDraftSnapshotRef.current.newExperience);
    resetContactEmailVerificationState();
    setHasLocalDraft(false);
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container py-10 md:py-14">
        <PageHeader
          eyebrow="Painel do profissional"
          title="Edite seu perfil, revise a publicação e mantenha seus dados privados fora da vitrine."
          description="O objetivo aqui é simples: deixar suas informações técnicas prontas para leitura pública sem perder controle sobre o que fica privado e o que só recrutadores autenticados podem ver."
          actions={
            <>
              <Button onClick={handleSave} disabled={saving} className="h-12 rounded-full px-5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar alterações
              </Button>
              {!canUseOptionalStorage ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>Rascunhos neste navegador exigem armazenamento opcional.</span>
                </div>
              ) : hasLocalDraft ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>Rascunho salvo neste navegador.</span>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm text-foreground"
                    onClick={discardLocalDraft}
                  >
                    Descartar rascunho local
                  </Button>
                </div>
              ) : null}
            </>
          }
          aside={
            <div className="space-y-4">
              <p className="eyebrow">Resumo do perfil</p>
              <div className="space-y-3">
                <div className="rounded-[1.5rem] border border-border/80 bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Publicação</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {publicationStatus.description}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${publicationStatus.className}`}
                    >
                      {publicationStatus.label}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-border/80 bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Recência do perfil</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {isExpiredProfile
                          ? "Atualize e salve seu currículo para liberar uma nova publicação manual."
                          : freshnessDeadlineLabel
                            ? `Perfis publicados precisam ser atualizados até ${freshnessDeadlineLabel} para continuar na descoberta.`
                            : "A recência passa a contar quando o perfil entra na descoberta pública."}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${
                        isExpiredProfile
                          ? "border-destructive/20 bg-destructive/10 text-destructive"
                          : "border-border/80 bg-secondary/70 text-foreground"
                      }`}
                    >
                      {isExpiredProfile ? "Atualização obrigatória" : "Em acompanhamento"}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-border/80 bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Disponibilidade na busca</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {availabilityStatus.description}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${availabilityStatus.className}`}
                    >
                      {availabilityStatus.label}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          }
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {publication.moderationBlockedAt ? (
              <section className="surface-panel border-destructive/20 bg-destructive/5 p-6">
                <p className="eyebrow text-destructive">Perfil ocultado</p>
                <h2 className="mt-4 text-2xl leading-tight">
                  Este perfil depende de restauração administrativa antes de nova publicação.
                </h2>
                {publication.moderationBlockReason ? (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {publication.moderationBlockReason}
                  </p>
                ) : null}
              </section>
            ) : null}

            {isExpiredProfile ? (
              <section className="surface-panel border-destructive/20 bg-destructive/5 p-6">
                <p className="eyebrow text-destructive">Perfil expirado</p>
                <h2 className="mt-4 text-2xl leading-tight">
                  Seu currículo saiu da descoberta pública por falta de atualização recente.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Faça qualquer ajuste real no perfil e salve. Depois disso, a publicação manual volta a ficar disponível no card lateral.
                </p>
              </section>
            ) : null}

            <section className="surface-panel p-7">
              <SectionTitle icon={User} title="Informações pessoais" />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                    value={profile.name}
                    onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" className="mt-2 h-11 rounded-2xl bg-secondary/80" value={user?.email || ""} disabled />
                </div>
                <div>
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                    value={profile.city}
                    onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="state">Estado</Label>
                  <Select
                    value={profile.state || "placeholder"}
                    onValueChange={(value) => setProfile((current) => ({ ...current, state: value === "placeholder" ? "" : value }))}
                  >
                    <SelectTrigger id="state" className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85">
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder">Selecione o estado</SelectItem>
                      {BRAZILIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {STATE_LABEL[state]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-5">
                <Label htmlFor="bio">Resumo profissional</Label>
                <Textarea
                  id="bio"
                  rows={5}
                  className="mt-2 rounded-[1.7rem] border-border/80 bg-white/85"
                  value={profile.bio}
                  onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))}
                  placeholder="Conte como você trabalha, em que tipo de ambiente rende melhor e quais problemas gosta de resolver."
                />
              </div>
            </section>

            <section className="surface-panel p-7">
              <SectionTitle icon={Briefcase} title="Informações técnicas" />
              <div className="mt-6 space-y-5">
                <div>
                  <Label htmlFor="headline">Headline profissional</Label>
                  <Input
                    id="headline"
                    className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                    value={profile.headline}
                    onChange={(event) => setProfile((current) => ({ ...current, headline: event.target.value }))}
                    placeholder="Ex: Staff Engineer | React, Node.js e produto digital"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="seniority">Senioridade</Label>
                    <Select
                      value={profile.seniority || "placeholder"}
                      onValueChange={(value) => setProfile((current) => ({ ...current, seniority: value === "placeholder" ? "" : value as ProfileData["seniority"] }))}
                    >
                      <SelectTrigger id="seniority" className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder">Selecione</SelectItem>
                        <SelectItem value="junior">Júnior</SelectItem>
                        <SelectItem value="pleno">Pleno</SelectItem>
                        <SelectItem value="senior">Sênior</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="work-models">Modelo de trabalho</Label>
                    <Popover open={workModelsPopoverOpen} onOpenChange={setWorkModelsPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="work-models"
                          type="button"
                          variant="outline"
                          aria-label={`Modelo de trabalho: ${selectedWorkModelsLabel}`}
                          className="mt-2 h-11 w-full justify-between rounded-2xl border-border/80 bg-white/85 px-4 font-normal text-foreground hover:bg-white/85"
                        >
                          <span className="truncate text-left">{selectedWorkModelsLabel}</span>
                          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[var(--radix-popover-trigger-width)] rounded-[1.5rem] border-border/80 p-2"
                      >
                        <div className="space-y-1">
                          {WORK_MODEL_VALUES.map((workModel) => (
                            <div
                              key={workModel}
                              className="flex items-center gap-3 rounded-[1.1rem] px-3 py-2 hover:bg-secondary/60"
                            >
                              <Checkbox
                                id={`work-model-${workModel}`}
                                checked={profile.workModels.includes(workModel)}
                                onCheckedChange={(checked) => toggleWorkModel(workModel, Boolean(checked))}
                              />
                              <Label
                                htmlFor={`work-model-${workModel}`}
                                className="flex-1 cursor-pointer text-sm text-foreground"
                              >
                                {WORK_MODEL_LABEL[workModel]}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="rounded-[1.5rem] border border-border/80 bg-secondary/65 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="availability" className="text-sm">
                          Aberto a oportunidades
                        </Label>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Este indicador aparece no resultado de busca.
                        </p>
                      </div>
                      <Switch
                        id="availability"
                        checked={profile.openToOpportunities}
                        onCheckedChange={(checked) =>
                          setProfile((current) => ({ ...current, openToOpportunities: checked }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Skills</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={newSkill}
                      className="h-11 rounded-2xl border-border/80 bg-white/85"
                      onChange={(event) => setNewSkill(event.target.value)}
                      placeholder="Ex: React, Node.js, Platform Engineering"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                    />
                    <Button type="button" onClick={addSkill} variant="outline" className="h-11 rounded-full border-border/80 gap-2">
                      <Plus className="h-4 w-4" />
                      Adicionar skill
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="rounded-full bg-secondary/80 px-3 py-1 text-foreground">
                        {skill}
                        <button
                          type="button"
                          className="ml-2 rounded-full"
                          onClick={() => removeSkill(skill)}
                          aria-label={`Remover ${skill}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="surface-panel p-7">
              <SectionTitle icon={ShieldCheck} title="Diversidade e inclusão" />
              <div className="mt-6 rounded-[1.6rem] border border-border/80 bg-secondary/60 p-5">
                <p className="text-sm leading-6 text-foreground">
                  Esta seção é opcional. Ela não bloqueia cadastro, edição nem publicação do seu perfil. Os dados abaixo
                  não aparecem na busca pública nem na página pública do perfil.
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Só preencha se quiser permitir que recrutadores autenticados encontrem seu perfil em vagas afirmativas
                  ou inclusivas com base na sua autodeclaração. Isso pode incluir mulheres, pessoas LGBTQIAPN+ e outros
                  recortes afirmativos previstos aqui, como raça/cor e PCD.
                </p>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {AFFIRMATIVE_GROUP_VALUES.map((group) => (
                    <div key={group} className="flex items-start gap-3 rounded-[1.2rem] border border-border/80 bg-white/80 p-4">
                      <Checkbox
                        id={`affirmative-profile-${group}`}
                        checked={affirmativeGroups.includes(group)}
                        onCheckedChange={(checked) => toggleAffirmativeGroup(group, Boolean(checked))}
                        className="mt-1"
                      />
                      <div>
                        <Label htmlFor={`affirmative-profile-${group}`} className="text-sm text-foreground">
                          {AFFIRMATIVE_GROUP_LABEL[group]}
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-[1.2rem] border border-border/80 bg-white/80 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="affirmative-profile-consent"
                      checked={affirmativeConsentAccepted}
                      onCheckedChange={(checked) => setAffirmativeConsentAccepted(Boolean(checked))}
                      disabled={affirmativeGroups.length === 0}
                      className="mt-1"
                    />
                    <div>
                      <Label htmlFor="affirmative-profile-consent" className="text-sm text-foreground">
                        Autorizo o uso desses dados em vagas afirmativas ou inclusivas.
                      </Label>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        O uso permitido é apenas inclusivo. Você não é obrigado a informar esses dados para manter seu
                        currículo publicado por critérios técnicos.
                      </p>
                      {affirmativeConsentRecorded ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          Consentimento registrado na política {profile.affirmativeProfile.policyVersion || AFFIRMATIVE_POLICY_VERSION}.
                        </p>
                      ) : null}
                      {affirmativeGroups.length > 0 || affirmativeConsentRecorded ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4 rounded-full"
                          onClick={revokeAffirmativeProfile}
                        >
                          Revogar autodeclaração
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="surface-panel p-7">
              <SectionTitle icon={Briefcase} title="Experiências profissionais" />
              <div className="mt-6 rounded-[1.6rem] border border-border/80 bg-secondary/60 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="role-title">Cargo</Label>
                    <Input
                      id="role-title"
                      className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                      value={newExperience.role_title}
                      onChange={(event) =>
                        setNewExperience((current) => ({ ...current, role_title: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="company-name">Empresa</Label>
                    <Input
                      id="company-name"
                      className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                      value={newExperience.company_name}
                      onChange={(event) =>
                        setNewExperience((current) => ({ ...current, company_name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="start-date">Data de início</Label>
                    <Input
                      id="start-date"
                      type={usesPlainTextExperienceDates ? "text" : "date"}
                      className={experienceDateInputClassName}
                      placeholder={usesPlainTextExperienceDates ? "AAAA-MM-DD" : undefined}
                      inputMode={usesPlainTextExperienceDates ? "numeric" : undefined}
                      maxLength={usesPlainTextExperienceDates ? 10 : undefined}
                      pattern={usesPlainTextExperienceDates ? "\\d{4}-\\d{2}-\\d{2}" : undefined}
                      autoComplete={usesPlainTextExperienceDates ? "off" : undefined}
                      value={newExperience.start_date}
                      onChange={(event) =>
                        setNewExperience((current) => ({
                          ...current,
                          start_date: usesPlainTextExperienceDates
                            ? formatExperienceDateInput(event.target.value)
                            : event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="end-date">Data de fim</Label>
                    <Input
                      id="end-date"
                      type={usesPlainTextExperienceDates ? "text" : "date"}
                      className={experienceDateInputClassName}
                      placeholder={usesPlainTextExperienceDates ? "AAAA-MM-DD" : undefined}
                      inputMode={usesPlainTextExperienceDates ? "numeric" : undefined}
                      maxLength={usesPlainTextExperienceDates ? 10 : undefined}
                      pattern={usesPlainTextExperienceDates ? "\\d{4}-\\d{2}-\\d{2}" : undefined}
                      autoComplete={usesPlainTextExperienceDates ? "off" : undefined}
                      value={newExperience.end_date}
                      disabled={newExperience.is_current}
                      onChange={(event) =>
                        setNewExperience((current) => ({
                          ...current,
                          end_date: usesPlainTextExperienceDates
                            ? formatExperienceDateInput(event.target.value)
                            : event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-4 rounded-[1.5rem] border border-border/80 bg-white/75 p-4">
                  <div>
                    <Label htmlFor="is-current">Experiência atual</Label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Marque quando essa experiência estiver em andamento.
                    </p>
                  </div>
                  <Switch
                    id="is-current"
                    checked={newExperience.is_current}
                    onCheckedChange={(checked) =>
                      setNewExperience((current) => ({
                        ...current,
                        is_current: checked,
                        end_date: checked ? "" : current.end_date,
                      }))
                    }
                  />
                </div>

                <div className="mt-4">
                  <Label htmlFor="experience-description">Descrição</Label>
                  <Textarea
                    id="experience-description"
                    rows={4}
                    className="mt-2 rounded-[1.6rem] border-border/80 bg-white/85"
                    value={newExperience.description}
                    onChange={(event) =>
                      setNewExperience((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </div>

                <Button type="button" onClick={addExperience} className="mt-4 rounded-full">
                  <Plus className="h-4 w-4" />
                  Adicionar experiência
                </Button>
              </div>

              <div className="mt-5 space-y-4">
                {profile.experiences.map((experience) => (
                  <div key={experience.id} className="rounded-[1.6rem] border border-border/80 bg-white/75 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl leading-tight">{experience.role_title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{experience.company_name}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {experience.start_date} {experience.is_current ? "• atual" : experience.end_date ? `• ${experience.end_date}` : ""}
                        </p>
                        {experience.description ? (
                          <p className="mt-3 text-sm leading-6 text-foreground">{experience.description}</p>
                        ) : null}
                      </div>
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => removeExperience(experience.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface-panel p-7">
              <SectionTitle icon={Mail} title="Contato para recrutadores" />
              <div className="mt-6 rounded-[1.6rem] border border-border/80 bg-secondary/60 p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div>
                    <Label htmlFor="contact-email">E-mail de contato</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                      value={profile.contactEmail}
                      onChange={(event) => setProfile((current) => ({ ...current, contactEmail: event.target.value }))}
                      placeholder="voce@empresa.com"
                    />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {contactEmailUsesAccountEmail
                        ? "Por padrão, usamos o e-mail da sua conta."
                        : "Esse endereço só aparece para recrutadores autenticados quando a visibilidade estiver ligada."}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-border/80 bg-white/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="show-contact-email" className="text-sm">
                          Exibir e-mail para recrutadores
                        </Label>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          O contato fica fora da busca pública e só aparece na página detalhada do perfil.
                        </p>
                      </div>
                      <Switch
                        id="show-contact-email"
                        checked={profile.showContactEmailToRecruiters}
                        onCheckedChange={(checked) =>
                          setProfile((current) => ({ ...current, showContactEmailToRecruiters: checked }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {requiresContactEmailVerification ? (
                  <div className="mt-5 rounded-[1.4rem] border border-border/80 bg-white/80 p-4">
                    <p className="text-sm leading-6 text-foreground">
                      Trocar para um e-mail diferente do da conta exige confirmação com código enviado para {accountEmail}.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={handleRequestContactEmailCode}
                        disabled={contactEmailCodeSending}
                      >
                        {contactEmailCodeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Enviar código para confirmar
                      </Button>
                      <Input
                        value={contactEmailVerificationCode}
                        onChange={(event) => setContactEmailVerificationCode(event.target.value)}
                        placeholder="000000"
                        inputMode="numeric"
                        maxLength={6}
                        className="h-11 rounded-2xl border-border/80 bg-white/85 md:max-w-[160px]"
                      />
                      <Button
                        type="button"
                        className="rounded-full"
                        onClick={handleVerifyContactEmailCode}
                        disabled={contactEmailCodeVerifying}
                      >
                        {contactEmailCodeVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Confirmar código
                      </Button>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {hasVerifiedContactEmail
                        ? "Endereço confirmado. Agora salve o perfil para aplicar a mudança."
                        : contactEmailChallengeId
                          ? `Código enviado para ${accountEmail}.`
                          : "A confirmação vale só para esta sessão e para este endereço."}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    {contactEmailUsesAccountEmail
                      ? "Se quiser usar outro endereço de contato, confirme a troca com código enviado para o e-mail da conta."
                      : "Esse e-mail já faz parte do perfil salvo e não precisa de nova confirmação enquanto continuar igual."}
                  </p>
                )}
              </div>
            </section>

            <section className="surface-panel p-7">
              <SectionTitle icon={Mail} title="Acessos ao seu e-mail de contato" />
              <div className="mt-6 space-y-4">
                {reportSubmissionStatus && !reportSubmissionStatus.canSubmit ? (
                  <div className="rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5 text-sm leading-6 text-destructive">
                    Seu acesso ao canal de denúncias está temporariamente restrito.
                  </div>
                ) : null}

                {contactAccesses.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-secondary/60 p-5 text-sm leading-6 text-muted-foreground">
                    Nenhum recrutador autenticado acessou seu e-mail de contato até agora.
                  </div>
                ) : (
                  contactAccesses.map((access) => (
                    <div key={access.id} className="rounded-[1.5rem] border border-border/80 bg-white/75 p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-xl leading-tight">{access.recruiterName}</h3>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{access.recruiterEmailHint}</p>
                          {access.accessedAt ? (
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              Acesso registrado em {formatRelativeDateLabel(access.accessedAt)}
                            </p>
                          ) : null}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => openRecruiterReportDialog(access)}
                        >
                          Denunciar recrutador
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="surface-panel p-7">
              <SectionTitle icon={ExternalLink} title="Links públicos" />
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="linkedin">LinkedIn</Label>
                  <Input
                    id="linkedin"
                    className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                    value={profile.linkedin}
                    onChange={(event) => setProfile((current) => ({ ...current, linkedin: event.target.value }))}
                    placeholder="https://linkedin.com/in/seu-perfil"
                  />
                </div>
                <div>
                  <Label htmlFor="github">GitHub</Label>
                  <Input
                    id="github"
                    className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                    value={profile.github}
                    onChange={(event) => setProfile((current) => ({ ...current, github: event.target.value }))}
                    placeholder="https://github.com/seu-usuario"
                  />
                </div>
                <div>
                  <Label htmlFor="portfolio">Portfólio</Label>
                  <Input
                    id="portfolio"
                    className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85"
                    value={profile.portfolio}
                    onChange={(event) => setProfile((current) => ({ ...current, portfolio: event.target.value }))}
                    placeholder="https://seu-portfolio.com"
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="surface-dark p-7">
              <p className="eyebrow surface-dark-eyebrow">Publicação do perfil</p>
              <h2 className="surface-dark-title mt-4 text-3xl leading-tight">
                Seu perfil só entra na descoberta quando você decide publicar.
              </h2>
              <p className="surface-dark-copy mt-4 text-sm leading-6">
                Links públicos continuam abertos para qualquer visitante. O e-mail de contato, quando ativado, só aparece para recrutadores autenticados.
              </p>

              {publication.isPublished && publicProfileUrl ? (
                <Button asChild variant="secondary" className="mt-5 rounded-full">
                  <Link to={publicProfileUrl}>
                    Ver perfil público
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}

              <div className="surface-dark-card mt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="publish-profile" className="surface-dark-label text-sm">
                      Tornar perfil público
                    </Label>
                    <p className="surface-dark-copy-muted mt-1 text-xs leading-5">
                      {isExpiredProfile
                        ? "Atualize e salve o perfil antes de liberar uma nova publicação."
                        : "Ative quando o checklist abaixo estiver atendido."}
                    </p>
                  </div>
                  <Switch
                    id="publish-profile"
                    checked={profile.isPublished}
                    onCheckedChange={(checked) => setProfile((current) => ({ ...current, isPublished: checked }))}
                    disabled={!profile.isPublished && (!canPublishProfile || isExpiredProfile)}
                  />
                </div>
              </div>
            </section>

            <section className="surface-panel p-6">
              <p className="eyebrow">Checklist de publicação</p>
              <p className={`mt-4 text-sm leading-6 ${canPublishProfile ? "text-muted-foreground" : "text-destructive"}`}>
                {currentIssues.length === 0
                  ? "Checklist pronto para publicação. Seu perfil já atende aos critérios mínimos."
                  : "Itens pendentes para publicar:"}
              </p>
              {currentIssues.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {currentIssues.map((issue) => (
                    <li key={issue} className="flex items-start gap-3 text-sm leading-6 text-destructive">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </aside>
        </div>

        <PrivacyActionsPanel
          accountEmail={accountEmail}
          onAccountDeleted={async () => {
            await signOut();
            navigate("/");
          }}
        />
      </main>

      <ReportDialog
        open={reportDialogOpen}
        onOpenChange={(open) => {
          setReportDialogOpen(open);

          if (!open) {
            setSelectedContactAccess(null);
          }
        }}
        title="Denunciar recrutador"
        description="Use este fluxo quando o acesso ao seu contato estiver ligado a assédio, scraping, fraude ou outra conduta indevida."
        status={reportSubmissionStatus}
        submitting={reportSubmitting}
        onSubmit={handleSubmitRecruiterReport}
      />
    </div>
  );
};

const RecruiterDashboard = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteProfile[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [busyFavoriteId, setBusyFavoriteId] = useState<number | null>(null);
  const [busySearchId, setBusySearchId] = useState<number | null>(null);
  const highlightedSavedSearchId = new URLSearchParams(location.search).get("savedSearch");

  useEffect(() => {
    let active = true;

    Promise.all([api.recruiter.getFavorites(), api.recruiter.getSavedSearches()])
      .then(([favoritesResponse, savedSearchesResponse]) => {
        if (!active) return;
        setFavorites(favoritesResponse.favorites.map(normalizeFavoriteProfileInput));
        setSavedSearches(savedSearchesResponse.savedSearches);
      })
      .catch(() => {
        if (!active) return;
        toast.error("Não foi possível carregar seu painel de recrutador agora.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!highlightedSavedSearchId || loading) {
      return;
    }

    const target = window.document.getElementById(`saved-search-${highlightedSavedSearchId}`);

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedSavedSearchId, loading]);

  const removeFavorite = async (profileId: number) => {
    try {
      setBusyFavoriteId(profileId);
      await api.recruiter.removeFavorite(profileId);
      setFavorites((current) => current.filter((favorite) => favorite.id !== profileId));
      toast.success("Perfil removido dos favoritos.");
    } catch {
      toast.error("Não foi possível remover o favorito agora.");
    } finally {
      setBusyFavoriteId(null);
    }
  };

  const updateAlertFrequency = async (savedSearch: SavedSearch, alertFrequency: SavedSearchAlertFrequency) => {
    if (savedSearch.alertFrequency === alertFrequency) {
      return;
    }

    try {
      setBusySearchId(savedSearch.id);
      const response = await api.recruiter.updateSavedSearch(savedSearch.id, {
        alertFrequency,
      });

      setSavedSearches((current) =>
        current.map((item) => (item.id === savedSearch.id ? response.savedSearch : item)),
      );
      toast.success(getSavedSearchUpdatedToastMessage(response.savedSearch.alertFrequency));
    } catch {
      toast.error("Não foi possível atualizar o alerta agora.");
    } finally {
      setBusySearchId(null);
    }
  };

  const deleteSavedSearch = async (savedSearchId: number) => {
    try {
      setBusySearchId(savedSearchId);
      await api.recruiter.deleteSavedSearch(savedSearchId);
      setSavedSearches((current) => current.filter((item) => item.id !== savedSearchId));
      toast.success("Busca salva removida.");
    } catch {
      toast.error("Não foi possível remover a busca salva agora.");
    } finally {
      setBusySearchId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container py-10 md:py-14">
        <PageHeader
          eyebrow="Painel do recrutador"
          title="Acompanhe sua curadoria sem perder o fio da busca."
          description="Favoritos e buscas salvas precisam funcionar como continuação da triagem, não como enfeite de dashboard."
          actions={
            <Button asChild className="h-12 rounded-full px-5">
              <Link to="/buscar">
                <Search className="h-4 w-4" />
                Buscar talentos
              </Link>
            </Button>
          }
          aside={
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">Favoritos atuais: {favorites.length}.</p>
              <p className="text-sm leading-6 text-muted-foreground">Buscas salvas: {savedSearches.length}.</p>
            </div>
          }
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="surface-panel p-7">
            <SectionTitle icon={Heart} title="Favoritos" />
            <div className="mt-6 space-y-4">
              {favorites.length === 0 ? (
                <div className="rounded-[1.6rem] border border-dashed border-border/80 bg-secondary/60 p-5 text-sm leading-6 text-muted-foreground">
                  Nenhum perfil favoritado ainda. Use a busca pública para começar sua shortlist.
                </div>
              ) : (
                favorites.map((favorite) => (
                  <div key={favorite.id} className="rounded-[1.6rem] border border-border/80 bg-white/75 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl leading-tight">{favorite.name}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{favorite.headline}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="secondary" className="rounded-full bg-secondary/80 px-3 py-1 text-foreground">
                            {SENIORITY_LABEL[favorite.seniority]}
                          </Badge>
                          <Badge variant="secondary" className="rounded-full bg-secondary/80 px-3 py-1 text-foreground">
                            {formatWorkModelList(favorite.workModels)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm" className="rounded-full">
                          <Link to={`/profissionais/${favorite.publicSlug}`}>Ver perfil</Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={busyFavoriteId === favorite.id}
                          onClick={() => removeFavorite(favorite.id)}
                        >
                          {busyFavoriteId === favorite.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="surface-panel p-7">
            <SectionTitle icon={BookmarkPlus} title="Buscas salvas" />
            <div className="mt-6 space-y-4">
              {savedSearches.length === 0 ? (
                <div className="rounded-[1.6rem] border border-dashed border-border/80 bg-secondary/60 p-5 text-sm leading-6 text-muted-foreground">
                  Nenhuma busca salva ainda. Salve filtros direto na página de busca para receber alertas por e-mail.
                </div>
              ) : (
                savedSearches.map((savedSearch) => (
                  <div
                    key={savedSearch.id}
                    id={`saved-search-${savedSearch.id}`}
                    className={`rounded-[1.6rem] border bg-white/75 p-5 ${
                      highlightedSavedSearchId === String(savedSearch.id)
                        ? "border-emerald-500/40 ring-2 ring-emerald-500/20"
                        : "border-border/80"
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl leading-tight">{savedSearch.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {formatSavedSearchCriteria(savedSearch.criteria)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={savedSearch.alertFrequency === "disabled" ? "secondary" : "default"} className="rounded-full px-3 py-1">
                            <Bell className="mr-1 h-3.5 w-3.5" />
                            {formatSavedSearchAlertBadge(savedSearch.alertFrequency)}
                          </Badge>
                          {savedSearch.lastAlertSentAt ? (
                            <Badge variant="outline" className="rounded-full px-3 py-1">
                              Último alerta enviado
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:w-[220px]">
                        <Select
                          value={savedSearch.alertFrequency}
                          onValueChange={(value) => updateAlertFrequency(savedSearch, value as SavedSearchAlertFrequency)}
                          disabled={busySearchId === savedSearch.id}
                        >
                          <SelectTrigger
                            aria-label={`Frequência do alerta da busca ${savedSearch.name}`}
                            className="h-9 rounded-full border-border/80 bg-white/90"
                          >
                            <SelectValue placeholder="Frequência do alerta" />
                          </SelectTrigger>
                          <SelectContent>
                            {SAVED_SEARCH_ALERT_FREQUENCIES.map((alertFrequency) => (
                              <SelectItem key={alertFrequency} value={alertFrequency}>
                                {SAVED_SEARCH_ALERT_FREQUENCY_LABEL[alertFrequency]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={busySearchId === savedSearch.id}
                          onClick={() => deleteSavedSearch(savedSearch.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="surface-dark mt-6 p-8">
          <p className="eyebrow surface-dark-eyebrow">Como operar no 1.0</p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="surface-dark-title text-3xl leading-tight">
                A descoberta continua pública; a curadoria agora é sua.
              </h2>
              <p className="surface-dark-copy mt-4 text-sm leading-6">
                Favorite perfis relevantes, salve filtros úteis e deixe os alertas acompanharem novos matches.
              </p>
            </div>
            <Button asChild variant="secondary" className="rounded-full">
              <Link to="/buscar">
                <Search className="h-4 w-4" />
                Abrir busca pública
              </Link>
            </Button>
          </div>
        </section>

        <PrivacyActionsPanel
          accountEmail={user?.email || ""}
          onAccountDeleted={async () => {
            await signOut();
            navigate("/");
          }}
        />
      </main>
    </div>
  );
};

const PrivacyActionsPanel = ({
  accountEmail,
  onAccountDeleted,
}: {
  accountEmail: string;
  onAccountDeleted: () => Promise<void>;
}) => {
  const [exporting, setExporting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      const payload = await api.auth.exportPrivacyData();
      const exportDate = new Date(payload.exportedAt).toISOString().slice(0, 10);

      downloadJsonFile(`opentalentpool-privacy-export-${exportDate}.json`, payload);
      toast.success("Exportação gerada com sucesso.");
    } catch {
      toast.error("Não foi possível exportar seus dados agora.");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);
      await api.auth.deleteAccount({
        confirmEmail: deleteConfirmationEmail.trim(),
      });
      setDeleteDialogOpen(false);
      setDeleteConfirmationEmail("");
      toast.success("Conta excluída com sucesso.");
      await onAccountDeleted();
    } catch (error) {
      const apiError = error as { issues?: Array<{ path?: string; message?: string }> };

      if (apiError.issues?.some((issue) => issue.path === "confirmEmail")) {
        toast.error("Digite exatamente o e-mail da conta para concluir a exclusão.");
      } else {
        toast.error("Não foi possível excluir sua conta agora.");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="surface-panel mt-6 p-7">
      <SectionTitle icon={Mail} title="Privacidade e LGPD" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[1.5rem] border border-border/80 bg-white/75 p-5">
          <p className="text-sm font-medium text-foreground">Exportação de dados</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Gere um JSON com os dados da conta, perfil, buscas salvas, favoritos, aceites e trilha auditável da busca inclusiva.
          </p>
          <Button type="button" className="mt-5 rounded-full" disabled={exporting} onClick={handleExport}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar meus dados
          </Button>
        </div>

        <div className="rounded-[1.5rem] border border-border/80 bg-white/75 p-5">
          <p className="text-sm font-medium text-foreground">Canal LGPD</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Se precisar de atendimento complementar, use o canal oficial para direitos do titular e dúvidas de privacidade.
          </p>
          <Button asChild type="button" variant="outline" className="mt-5 rounded-full">
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
              <Mail className="h-4 w-4" />
              {LEGAL_CONTACT_EMAIL}
            </a>
          </Button>
        </div>

        <div className="rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5">
          <p className="text-sm font-medium text-foreground">Exclusão permanente</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Exclui conta, perfil, sessão, favoritos e buscas salvas. A plataforma mantém apenas a trilha jurídica mínima anonimizada.
          </p>
          <Button type="button" variant="outline" className="mt-5 rounded-full" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Excluir conta
          </Button>
        </div>
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);

          if (!open) {
            setDeleteConfirmationEmail("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              Digite o e-mail da conta para confirmar a exclusão permanente de todos os dados operacionais do produto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              E-mail esperado: <span className="font-medium text-foreground">{accountEmail}</span>
            </p>
            <Input
              value={deleteConfirmationEmail}
              onChange={(event) => setDeleteConfirmationEmail(event.target.value)}
              placeholder={accountEmail}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || deleteConfirmationEmail.trim().toLowerCase() !== accountEmail.trim().toLowerCase()}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteAccount();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

const SectionTitle = ({
  icon: Icon,
  title,
}: {
  icon: typeof User;
  title: string;
}) => (
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground">
      <Icon className="h-5 w-5" />
    </div>
    <h2 className="text-3xl leading-tight">{title}</h2>
  </div>
);

export default Dashboard;
