import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Briefcase,
  BookmarkPlus,
  CheckCircle2,
  EyeOff,
  Heart,
  Loader2,
  MapPin,
  Search as SearchIcon,
  ShieldCheck,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { RoleContextPromptDialog } from "@/components/RoleContextPromptDialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PageHeader } from "@/components/PageHeader";
import { SiteFooter } from "@/components/SiteFooter";
import api from "@/lib/api";
import {
  AFFIRMATIVE_GENDER_GROUP_VALUES,
  AFFIRMATIVE_GROUP_LABEL,
  AFFIRMATIVE_POLICY_VERSION,
  AFFIRMATIVE_RACE_GROUP_VALUES,
  AFFIRMATIVE_USE_CASE_LABEL,
  createEmptyAffirmativeContext,
  createEmptyAffirmativeFilters,
  hasAffirmativeFilters,
  isAffirmativeSearchCriteria,
} from "@/lib/affirmative-config.js";
import { LEGAL_POLICY_ROUTE } from "@/lib/legal-policies.js";
import {
  BRAZILIAN_STATES,
  SENIORITY_LABEL,
  STATE_LABEL,
  WORK_MODEL_LABEL,
  formatWorkModelList,
} from "@/lib/profile-options";
import { normalizePublicProfileSummaryInput } from "@/lib/profile-normalization";
import {
  buildRecruiterAuthPath,
  buildSearchParamsFromCriteria,
  buildSearchParamsObject,
  formatAppliedSearchFilters,
  formatSearchCount,
  getSavedSearchCreatedToastMessage,
  SAVED_SEARCH_ALERT_FREQUENCIES,
  SAVED_SEARCH_ALERT_FREQUENCY_LABEL,
} from "@/lib/talent-helpers";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ApiError } from "@/types/auth";
import type {
  AffirmativeSearchFilters,
  AffirmativeSearchPayload,
  AffirmativeSearchPolicyStatus,
  PublicProfileSummary,
  SavedSearchAlertFrequency,
  SavedSearchCriteria,
  SearchProfilesParams,
  SearchProfilesResponse,
} from "@/types/profile";

function createEmptySearchResponse(page = 1, pageSize = 20): SearchProfilesResponse {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
  };
}

function createSuggestedSearchName(criteria: SavedSearchCriteria) {
  if (hasAffirmativeFilters(criteria)) {
    const useCase = criteria.affirmativeContext?.useCase || "vaga_afirmativa";

    return `Priorização inclusiva: ${AFFIRMATIVE_USE_CASE_LABEL[useCase]}`;
  }

  const parts = [
    criteria.q ? criteria.q : null,
    criteria.seniority ? SENIORITY_LABEL[criteria.seniority] : null,
    criteria.workModel ? WORK_MODEL_LABEL[criteria.workModel] : null,
    criteria.state ? criteria.state : null,
    criteria.openToOpportunities ? "Abertos" : null,
  ].filter(Boolean);

  return parts.length ? `Busca: ${parts.join(" • ")}` : "Minha busca de talentos";
}

function buildDisplayFilters(criteria: SavedSearchCriteria) {
  const baseFilters = formatAppliedSearchFilters(criteria as SearchProfilesParams).map((item) => {
    if (item.startsWith("Senioridade: ")) {
      const key = item.replace("Senioridade: ", "") as keyof typeof SENIORITY_LABEL;
      return `Senioridade: ${SENIORITY_LABEL[key]}`;
    }

    if (item.startsWith("Modelo: ")) {
      const key = item.replace("Modelo: ", "") as keyof typeof WORK_MODEL_LABEL;
      return `Modelo: ${WORK_MODEL_LABEL[key]}`;
    }

    return item;
  });

  if (hasAffirmativeFilters(criteria)) {
    baseFilters.push("Priorização inclusiva ativa");
  }

  return baseFilters;
}

function toggleGroupSelection(current: string[], value: string, checked: boolean) {
  if (checked) {
    return [...new Set([...current, value])];
  }

  return current.filter((item) => item !== value);
}

function getApiErrorMessage(apiError: ApiError | null | undefined, fallback: string) {
  if (apiError?.issues?.length) {
    return apiError.issues[0].message;
  }

  return apiError?.message || apiError?.error || fallback;
}

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, switchActiveRole, enableRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const filters = useMemo(() => buildSearchParamsObject(searchParams), [searchParams]);
  const savedSearchId = searchParams.get("savedSearch");
  const [publicResults, setPublicResults] = useState<SearchProfilesResponse>(createEmptySearchResponse(filters.page, filters.pageSize));
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState("");
  const [affirmativeResults, setAffirmativeResults] = useState<SearchProfilesResponse>(createEmptySearchResponse(1, 20));
  const [affirmativeLoading, setAffirmativeLoading] = useState(false);
  const [affirmativeError, setAffirmativeError] = useState("");
  const [resultMode, setResultMode] = useState<"public" | "affirmative">("public");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [busyFavoriteId, setBusyFavoriteId] = useState<number | null>(null);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [saveSearchAlertFrequency, setSaveSearchAlertFrequency] = useState<SavedSearchAlertFrequency>("daily");
  const [savingSearch, setSavingSearch] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState(createSuggestedSearchName(filters));
  const [affirmativePolicyStatus, setAffirmativePolicyStatus] = useState<AffirmativeSearchPolicyStatus>({
    accepted: false,
    acceptedAt: null,
    policyVersion: AFFIRMATIVE_POLICY_VERSION,
  });
  const [acceptPolicyChecked, setAcceptPolicyChecked] = useState(false);
  const [acceptingPolicy, setAcceptingPolicy] = useState(false);
  const [affirmativeContext, setAffirmativeContext] = useState(createEmptyAffirmativeContext());
  const [affirmativeFilters, setAffirmativeFilters] = useState<AffirmativeSearchFilters>(createEmptyAffirmativeFilters());
  const [affirmativeRequest, setAffirmativeRequest] = useState<AffirmativeSearchPayload | null>(null);
  const [loadedSavedSearchId, setLoadedSavedSearchId] = useState<string | null>(null);
  const [recruiterPromptOpen, setRecruiterPromptOpen] = useState(false);
  const [recruiterPromptBusy, setRecruiterPromptBusy] = useState(false);
  const [inclusiveFiltersOpen, setInclusiveFiltersOpen] = useState(false);

  const nextPath = `${location.pathname}${location.search}`;
  const recruiterAuthPath = buildRecruiterAuthPath(nextPath);
  const hasRecruiterRole = Boolean(user?.availableRoles?.includes("recruiter"));
  const isRecruiter = user?.activeRole === "recruiter";
  const displayedResults = resultMode === "affirmative" ? affirmativeResults : publicResults;
  const displayedLoading = resultMode === "affirmative" ? affirmativeLoading : publicLoading;
  const displayedError = resultMode === "affirmative" ? affirmativeError : publicError;
  const totalPages = Math.max(1, Math.ceil(displayedResults.total / displayedResults.pageSize));
  const inclusiveFiltersActive =
    resultMode === "affirmative" ||
    Boolean(affirmativeContext.vacancyReference.trim()) ||
    hasAffirmativeFilters({ affirmativeFilters });
  const searchLayoutClassName = isRecruiter
    ? "mt-12 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]"
    : "mt-12 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]";

  function ensureRecruiterFlow() {
    if (!user) {
      navigate(recruiterAuthPath);
      return false;
    }

    setRecruiterPromptOpen(true);
    return false;
  }

  async function handleRecruiterPromptConfirm() {
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
  }

  const currentCriteriaForSaving: SavedSearchCriteria = useMemo(() => {
    if (resultMode === "affirmative" && affirmativeRequest) {
      return {
        ...buildSearchParamsFromCriteria(affirmativeRequest),
        affirmativeContext: affirmativeRequest.affirmativeContext,
        affirmativeFilters: affirmativeRequest.affirmativeFilters,
      };
    }

    return {
      q: filters.q,
      seniority: filters.seniority,
      workModel: filters.workModel,
      state: filters.state,
      openToOpportunities: filters.openToOpportunities,
    };
  }, [affirmativeRequest, filters, resultMode]);

  const activeFilters = useMemo(() => buildDisplayFilters(currentCriteriaForSaving), [currentCriteriaForSaving]);

  useEffect(() => {
    setSaveSearchName(createSuggestedSearchName(currentCriteriaForSaving));
  }, [currentCriteriaForSaving]);

  useEffect(() => {
    if (inclusiveFiltersActive) {
      setInclusiveFiltersOpen(true);
    }
  }, [inclusiveFiltersActive]);

  useEffect(() => {
    let active = true;

    setPublicLoading(true);
    setPublicError("");

    api.profiles
      .search(filters)
      .then((response) => {
        if (!active) return;
        setPublicResults({
          ...response,
          items: response.items.map(normalizePublicProfileSummaryInput),
        });
      })
      .catch((apiError: ApiError) => {
        if (!active) return;
        setPublicError(getApiErrorMessage(apiError, "Não foi possível carregar a busca agora."));
      })
      .finally(() => {
        if (!active) return;
        setPublicLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => {
    let active = true;

    if (!isRecruiter) {
      setFavorites([]);
      return () => {
        active = false;
      };
    }

    setFavoritesLoading(true);

    api.recruiter
      .getFavorites()
      .then((response) => {
        if (!active) return;
        setFavorites(response.favorites.map((favorite) => favorite.id));
      })
      .catch(() => {
        if (!active) return;
        setFavorites([]);
      })
      .finally(() => {
        if (!active) return;
        setFavoritesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isRecruiter]);

  useEffect(() => {
    let active = true;

    if (!isRecruiter) {
      setAffirmativePolicyStatus({
        accepted: false,
        acceptedAt: null,
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
      });
      return () => {
        active = false;
      };
    }

    api.recruiter
      .getAffirmativeSearchPolicyStatus()
      .then((response) => {
        if (!active) return;
        setAffirmativePolicyStatus(response);
      })
      .catch(() => {
        if (!active) return;
        setAffirmativePolicyStatus({
          accepted: false,
          acceptedAt: null,
          policyVersion: AFFIRMATIVE_POLICY_VERSION,
        });
      });

    return () => {
      active = false;
    };
  }, [isRecruiter]);

  useEffect(() => {
    if (!savedSearchId || !user) {
      return;
    }

    if (!isRecruiter) {
      setRecruiterPromptOpen(true);
    }
  }, [isRecruiter, savedSearchId, user]);

  useEffect(() => {
    let active = true;

    if (!savedSearchId || !isRecruiter || loadedSavedSearchId === savedSearchId) {
      return () => {
        active = false;
      };
    }

    api.recruiter
      .getSavedSearches()
      .then((response) => {
        if (!active) return;

        const targetSavedSearch = response.savedSearches.find((savedSearch) => String(savedSearch.id) === savedSearchId);

        if (!targetSavedSearch) {
          setLoadedSavedSearchId(savedSearchId);
          return;
        }

        const nextSearchParams = new URLSearchParams();
        const baseCriteria = buildSearchParamsFromCriteria(targetSavedSearch.criteria);

        Object.entries(baseCriteria).forEach(([key, value]) => {
          if (value === "" || value === false || value === undefined || value === null) {
            return;
          }

          nextSearchParams.set(key, String(value));
        });

        nextSearchParams.set("page", "1");
        nextSearchParams.set("pageSize", "20");
        setSearchParams(nextSearchParams, { replace: true });
        setLoadedSavedSearchId(savedSearchId);

        if (isAffirmativeSearchCriteria(targetSavedSearch.criteria)) {
          const nextContext = targetSavedSearch.criteria.affirmativeContext || createEmptyAffirmativeContext();
          const nextFilters = targetSavedSearch.criteria.affirmativeFilters || createEmptyAffirmativeFilters();

          setAffirmativeContext(nextContext);
          setAffirmativeFilters(nextFilters);
          setResultMode("affirmative");

          if (affirmativePolicyStatus.accepted) {
            executeAffirmativeSearch({
              ...baseCriteria,
              page: 1,
              pageSize: 20,
              affirmativeContext: nextContext,
              affirmativeFilters: nextFilters,
            });
          }
        } else {
          setResultMode("public");
        }
      })
      .catch(() => {
        if (!active) return;
        setLoadedSavedSearchId(savedSearchId);
      });

    return () => {
      active = false;
    };
  }, [affirmativePolicyStatus.accepted, isRecruiter, loadedSavedSearchId, savedSearchId, setSearchParams]);

  const updateFilters = (nextValues: Partial<typeof filters>) => {
    const nextSearchParams = new URLSearchParams(searchParams);

    nextSearchParams.delete("savedSearch");

    for (const [key, value] of Object.entries(nextValues)) {
      if (value === "" || value === false || value === undefined || value === null) {
        nextSearchParams.delete(key);
      } else {
        nextSearchParams.set(key, String(value));
      }
    }

    if (!("page" in nextValues)) {
      nextSearchParams.set("page", "1");
    }

    nextSearchParams.set("pageSize", String(filters.pageSize));
    setSearchParams(nextSearchParams, { replace: true });
  };

  const clearFilters = () => {
    setResultMode("public");
    setSearchParams({ page: "1", pageSize: String(filters.pageSize) }, { replace: true });
  };

  const executeAffirmativeSearch = async (payload: AffirmativeSearchPayload) => {
    try {
      setAffirmativeLoading(true);
      setAffirmativeError("");
      const response = await api.recruiter.searchAffirmativeProfiles(payload);
      setAffirmativeResults({
        ...response,
        items: response.items.map(normalizePublicProfileSummaryInput),
      });
      setAffirmativeRequest(payload);
      setResultMode("affirmative");
    } catch (error) {
      const apiError = error as ApiError;
      setAffirmativeError(getApiErrorMessage(apiError, "Não foi possível carregar a busca inclusiva agora."));
      setResultMode("affirmative");
    } finally {
      setAffirmativeLoading(false);
    }
  };

  const runCurrentAffirmativeSearch = async (page = 1) => {
    if (!isRecruiter) {
      ensureRecruiterFlow();
      return;
    }

    if (!affirmativePolicyStatus.accepted) {
      toast.error("Aceite a política de uso inclusivo antes de usar este modo.");
      return;
    }

    if (!hasAffirmativeFilters({ affirmativeFilters })) {
      toast.error("Selecione ao menos um critério afirmativo para a busca inclusiva.");
      return;
    }

    if (!affirmativeContext.vacancyReference.trim()) {
      toast.error("Informe uma referência curta da vaga antes de executar a busca inclusiva.");
      return;
    }

    if (affirmativeContext.vacancyReference.trim().length < 2) {
      toast.error("Informe uma referência curta com pelo menos 2 caracteres antes de executar a busca inclusiva.");
      return;
    }

    await executeAffirmativeSearch({
      ...buildSearchParamsFromCriteria(filters),
      page,
      pageSize: filters.pageSize,
      affirmativeContext: {
        useCase: affirmativeContext.useCase,
        vacancyReference: affirmativeContext.vacancyReference.trim(),
      },
      affirmativeFilters,
    });
  };

  const handleFavoriteToggle = async (profileId: number) => {
    if (!isRecruiter) {
      ensureRecruiterFlow();
      return;
    }

    try {
      setBusyFavoriteId(profileId);

      if (favorites.includes(profileId)) {
        await api.recruiter.removeFavorite(profileId);
        setFavorites((current) => current.filter((item) => item !== profileId));
        toast.success("Perfil removido dos favoritos.");
      } else {
        await api.recruiter.addFavorite(profileId);
        setFavorites((current) => [...current, profileId]);
        toast.success("Perfil favoritado com sucesso.");
      }
    } catch {
      toast.error("Não foi possível atualizar seus favoritos agora.");
    } finally {
      setBusyFavoriteId(null);
    }
  };

  const handleSaveSearch = async () => {
    if (!isRecruiter) {
      ensureRecruiterFlow();
      return;
    }

    try {
      setSavingSearch(true);

      const response = await api.recruiter.createSavedSearch({
        name: saveSearchName.trim() || createSuggestedSearchName(currentCriteriaForSaving),
        criteria: currentCriteriaForSaving,
        alertFrequency: saveSearchAlertFrequency,
      });

      toast.success(getSavedSearchCreatedToastMessage(response.savedSearch.alertFrequency));
      setSaveSearchOpen(false);
      setSaveSearchAlertFrequency("daily");
    } catch {
      toast.error("Não foi possível salvar esta busca agora.");
    } finally {
      setSavingSearch(false);
    }
  };

  const handleAcceptAffirmativePolicy = async () => {
    if (!isRecruiter) {
      ensureRecruiterFlow();
      return;
    }

    if (!acceptPolicyChecked) {
      toast.error("Confirme o uso apenas inclusivo antes de liberar a busca inclusiva.");
      return;
    }

    try {
      setAcceptingPolicy(true);
      const response = await api.recruiter.acceptAffirmativeSearchPolicy({
        policyVersion: AFFIRMATIVE_POLICY_VERSION,
      });
      setAffirmativePolicyStatus(response);
      setAcceptPolicyChecked(false);
      toast.success("Busca inclusiva liberada para sua conta.");
    } catch {
      toast.error("Não foi possível registrar o aceite agora.");
    } finally {
      setAcceptingPolicy(false);
    }
  };

  const inclusiveFiltersPanel = isRecruiter ? (
    <div className="surface-dark overflow-hidden">
      <Accordion
        type="single"
        collapsible
        value={inclusiveFiltersOpen ? "inclusive-search" : ""}
        onValueChange={(value) => setInclusiveFiltersOpen(value === "inclusive-search")}
      >
        <AccordionItem value="inclusive-search" className="border-none">
          <AccordionTrigger className="px-5 py-4 text-left hover:no-underline [&>svg]:text-white/70">
            <div className="pr-4">
              <p className="eyebrow surface-dark-eyebrow">Busca inclusiva</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="surface-dark-title text-lg leading-tight">
                  Vagas afirmativas e inclusivas
                </span>
                {inclusiveFiltersActive ? (
                  <Badge className="rounded-full border border-white/15 bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/12">
                    Em uso
                  </Badge>
                ) : null}
              </div>
              <p className="surface-dark-copy-soft mt-2 text-sm leading-6">
                Priorize o escopo afirmativo sem excluir os demais resultados técnicos aderentes.
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5">
            <p className="surface-dark-copy-soft text-sm leading-6">
              Consulte a{" "}
              <Link
                to={LEGAL_POLICY_ROUTE.inclusiveUsePolicy}
                className="font-semibold text-white underline underline-offset-4 transition hover:text-white/80"
              >
                Política de Uso Inclusivo
              </Link>{" "}
              para regras de uso e responsabilidade operacional.
            </p>

            {!affirmativePolicyStatus.accepted ? (
              <div className="surface-dark-card mt-5">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="affirmative-policy-confirmation"
                    checked={acceptPolicyChecked}
                    onCheckedChange={(checked) => setAcceptPolicyChecked(Boolean(checked))}
                    className="surface-dark-checkbox"
                  />
                  <div>
                    <Label htmlFor="affirmative-policy-confirmation" className="surface-dark-label text-sm">
                      Confirmo o uso apenas inclusivo desta ferramenta.
                    </Label>
                    <p className="surface-dark-copy-soft mt-2 text-xs leading-5">
                      Consulte a política antes de liberar este modo na conta.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-5 w-full rounded-full"
                  onClick={handleAcceptAffirmativePolicy}
                  disabled={acceptingPolicy}
                >
                  {acceptingPolicy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Liberar busca inclusiva
                </Button>
              </div>
            ) : (
              <div className="surface-dark-card mt-5 space-y-4">
                <div>
                  <Label className="surface-dark-label text-sm">Contexto da vaga</Label>
                  <RadioGroup
                    value={affirmativeContext.useCase}
                    onValueChange={(value) =>
                      setAffirmativeContext((current) => ({ ...current, useCase: value as typeof current.useCase }))
                    }
                    className="mt-3 grid gap-2"
                  >
                    {Object.entries(AFFIRMATIVE_USE_CASE_LABEL).map(([value, label]) => (
                      <label key={value} className="surface-dark-card-muted flex items-center gap-3 p-3">
                        <RadioGroupItem value={value} id={`affirmative-use-case-${value}`} className="border-white/50 text-white" />
                        <span className="surface-dark-label block text-sm">{label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="affirmative-vacancy-reference" className="surface-dark-label text-sm">
                    Referência da vaga
                  </Label>
                  <Input
                    id="affirmative-vacancy-reference"
                    className="surface-dark-input mt-3 !border-white/20 !bg-white/10 !text-white placeholder:!text-white/45 focus-visible:!ring-white/25 focus-visible:!ring-offset-0"
                    placeholder="Ex: RQ-123"
                    value={affirmativeContext.vacancyReference}
                    onChange={(event) =>
                      setAffirmativeContext((current) => ({
                        ...current,
                        vacancyReference: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <p className="surface-dark-label text-sm font-medium">Grupos afirmativos</p>

                  <div className="mt-3 space-y-3">
                    <div className="surface-dark-card-muted p-3">
                      <p className="surface-dark-label text-sm font-medium">LGBTQIAPN+ e gênero</p>
                      <div className="mt-3 space-y-2">
                        {AFFIRMATIVE_GENDER_GROUP_VALUES.map((group) => (
                          <div key={group} className="flex items-start gap-3">
                            <Checkbox
                              id={`affirmative-gender-${group}`}
                              checked={affirmativeFilters.genderGroups.includes(group)}
                              onCheckedChange={(checked) =>
                                setAffirmativeFilters((current) => ({
                                  ...current,
                                  genderGroups: toggleGroupSelection(current.genderGroups, group, Boolean(checked)) as AffirmativeSearchFilters["genderGroups"],
                                }))
                              }
                              className="surface-dark-checkbox"
                            />
                            <Label htmlFor={`affirmative-gender-${group}`} className="surface-dark-label text-sm">
                              {AFFIRMATIVE_GROUP_LABEL[group]}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="surface-dark-card-muted p-3">
                      <p className="surface-dark-label text-sm font-medium">Raça e pertencimento</p>
                      <div className="mt-3 space-y-2">
                        {AFFIRMATIVE_RACE_GROUP_VALUES.map((group) => (
                          <div key={group} className="flex items-start gap-3">
                            <Checkbox
                              id={`affirmative-race-${group}`}
                              checked={affirmativeFilters.raceGroups.includes(group)}
                              onCheckedChange={(checked) =>
                                setAffirmativeFilters((current) => ({
                                  ...current,
                                  raceGroups: toggleGroupSelection(current.raceGroups, group, Boolean(checked)) as AffirmativeSearchFilters["raceGroups"],
                                }))
                              }
                              className="surface-dark-checkbox"
                            />
                            <Label htmlFor={`affirmative-race-${group}`} className="surface-dark-label text-sm">
                              {AFFIRMATIVE_GROUP_LABEL[group]}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="surface-dark-card-muted p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="affirmative-pcd"
                          checked={affirmativeFilters.pcdOnly}
                          onCheckedChange={(checked) =>
                            setAffirmativeFilters((current) => ({
                              ...current,
                              pcdOnly: Boolean(checked),
                            }))
                          }
                          className="surface-dark-checkbox"
                        />
                        <div>
                          <Label htmlFor="affirmative-pcd" className="surface-dark-label text-sm">
                            {AFFIRMATIVE_GROUP_LABEL.pcd}
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Button type="button" className="w-full rounded-full" onClick={() => runCurrentAffirmativeSearch(1)}>
                    Executar busca inclusiva
                  </Button>
                  {resultMode === "affirmative" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="surface-dark-outline-button w-full justify-center"
                      onClick={() => setResultMode("public")}
                    >
                      Voltar para busca pública
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pb-20 pt-10 md:pb-24 md:pt-14">
        <div className="container">
          <PageHeader
            eyebrow="Busca pública"
            title="Buscar talentos publicados"
            description="Filtre por sinais reais: palavras-chave, senioridade, estado, modelo de trabalho e disponibilidade explícita."
            aside={
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-4 w-4 text-[hsl(var(--accent))]" />
                  <p className="text-sm leading-6 text-muted-foreground">
                    A vitrine pública mostra informações técnicas e disponibilidade. Contato privado segue protegido.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <EyeOff className="mt-1 h-4 w-4 text-[hsl(var(--accent))]" />
                  <p className="text-sm leading-6 text-muted-foreground">
                    Favoritos, buscas salvas e alertas por e-mail ficam como continuidade da curadoria para recrutadores.
                  </p>
                </div>
              </div>
            }
          />

          <section className={searchLayoutClassName}>
            <aside className="surface-panel self-start p-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
              <div>
                <p className="eyebrow">Filtros</p>
                <h2 className="mt-4 text-2xl leading-tight">Refine a leitura da base pública</h2>
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <Label htmlFor="search-query" className="text-sm font-medium text-foreground">
                    Palavras-chave
                  </Label>
                  <div className="relative mt-2">
                    <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="search-query"
                      placeholder="Buscar por stack, headline, bio ou experiências"
                      className="h-12 rounded-full border-border/80 bg-white/85 pl-11 pr-4"
                      value={filters.q}
                      onChange={(event) => updateFilters({ q: event.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-foreground">Senioridade</Label>
                    <Select value={filters.seniority || "all"} onValueChange={(value) => updateFilters({ seniority: value === "all" ? "" : value })}>
                      <SelectTrigger className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="junior">Júnior</SelectItem>
                        <SelectItem value="pleno">Pleno</SelectItem>
                        <SelectItem value="senior">Sênior</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Estado</Label>
                    <Select value={filters.state || "all"} onValueChange={(value) => updateFilters({ state: value === "all" ? "" : value })}>
                      <SelectTrigger className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {BRAZILIAN_STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {STATE_LABEL[state]} ({state})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Modelo de trabalho</Label>
                    <Select value={filters.workModel || "all"} onValueChange={(value) => updateFilters({ workModel: value === "all" ? "" : value })}>
                      <SelectTrigger className="mt-2 h-11 rounded-2xl border-border/80 bg-white/85">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="remoto">Remoto</SelectItem>
                        <SelectItem value="hibrido">Híbrido</SelectItem>
                        <SelectItem value="presencial">Presencial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-[1.5rem] border border-border/80 bg-white/85 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="open-only" className="text-sm font-medium text-foreground">
                          Apenas abertos a oportunidades
                        </Label>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Mantém na lista somente perfis com disponibilidade explícita.
                        </p>
                      </div>
                      <Switch
                        id="open-only"
                        checked={filters.openToOpportunities}
                        onCheckedChange={(checked) => updateFilters({ openToOpportunities: checked })}
                      />
                    </div>
                  </div>
                </div>

                {inclusiveFiltersPanel}

                <div className="flex flex-col gap-3">
                  <Button type="button" variant="outline" className="h-11 rounded-full" onClick={clearFilters} disabled={activeFilters.length === 0}>
                    Limpar filtros
                  </Button>
                  <Button
                    type="button"
                    className="h-11 rounded-full"
                    onClick={() => {
                      if (!isRecruiter) {
                        ensureRecruiterFlow();
                        return;
                      }

                      setSaveSearchOpen((current) => {
                        const next = !current;

                        if (next) {
                          setSaveSearchName(createSuggestedSearchName(currentCriteriaForSaving));
                          setSaveSearchAlertFrequency("daily");
                        }

                        return next;
                      });
                    }}
                  >
                    <BookmarkPlus className="h-4 w-4" />
                    Salvar busca
                  </Button>
                </div>
              </div>

              {saveSearchOpen ? (
                <div className="mt-5 rounded-[1.5rem] border border-[hsl(var(--accent))]/25 bg-[hsl(var(--accent))]/8 p-4">
                  <Label htmlFor="saved-search-name" className="text-sm font-medium text-foreground">
                    Nome da busca salva
                  </Label>
                  <Input
                    id="saved-search-name"
                    className="mt-2 h-11 rounded-2xl border-border/80 bg-white/90"
                    value={saveSearchName}
                    onChange={(event) => setSaveSearchName(event.target.value)}
                  />
                  <div className="mt-4">
                    <Label className="text-sm font-medium text-foreground">Frequência do alerta</Label>
                    <Select value={saveSearchAlertFrequency} onValueChange={(value) => setSaveSearchAlertFrequency(value as SavedSearchAlertFrequency)}>
                      <SelectTrigger
                        aria-label="Frequência do alerta"
                        className="mt-2 h-11 rounded-2xl border-border/80 bg-white/90"
                      >
                        <SelectValue placeholder="Diário" />
                      </SelectTrigger>
                      <SelectContent>
                        {SAVED_SEARCH_ALERT_FREQUENCIES.map((alertFrequency) => (
                          <SelectItem key={alertFrequency} value={alertFrequency}>
                            {SAVED_SEARCH_ALERT_FREQUENCY_LABEL[alertFrequency]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" onClick={handleSaveSearch} disabled={savingSearch} className="rounded-full">
                      {savingSearch ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Salvar busca
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setSaveSearchOpen(false);
                        setSaveSearchAlertFrequency("daily");
                      }}
                      className="rounded-full"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </aside>

            <section>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="eyebrow">{resultMode === "affirmative" ? "Resultados com priorização inclusiva" : "Resultados"}</p>
                  <h2 className="mt-4 text-4xl leading-tight md:text-5xl">{formatSearchCount(displayedResults.total)}</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Página {displayedResults.page} de {totalPages}
                  </p>
                  {resultMode === "affirmative" ? (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                      Os perfis dentro do escopo afirmativo aparecem primeiro. Os demais perfis tecnicamente aderentes
                      continuam listados em seguida.
                    </p>
                  ) : null}
                </div>

                {activeFilters.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeFilters.map((filterItem) => (
                      <Badge key={filterItem} variant="secondary" className="rounded-full bg-white/85 px-3 py-1 text-foreground">
                        {filterItem}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              {displayedLoading ? (
                <div className="surface-panel mt-6 flex items-center gap-3 p-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {resultMode === "affirmative" ? "Carregando busca com priorização inclusiva..." : "Carregando perfis públicos..."}
                </div>
              ) : displayedError ? (
                <div className="surface-panel mt-6 border-dashed border-destructive/30 p-6">
                  <h3 className="text-2xl leading-tight">
                    {resultMode === "affirmative"
                      ? "Não conseguimos carregar a busca com priorização inclusiva agora."
                      : "Não conseguimos carregar a busca agora."}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{displayedError}</p>
                </div>
              ) : displayedResults.items.length === 0 ? (
                <div className="surface-panel mt-6 border-dashed p-6 md:p-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-foreground">
                    <SearchIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-3xl leading-tight">
                    {resultMode === "affirmative"
                      ? "Nenhum perfil tecnicamente aderente corresponde à priorização inclusiva atual."
                      : "Nenhum perfil público corresponde aos filtros atuais."}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {resultMode === "affirmative"
                      ? "Revise o tipo da vaga, ajuste os filtros técnicos e confirme se os critérios afirmativos escolhidos refletem apenas uma finalidade inclusiva legítima. Mesmo com priorização ativa, a lista continua preservando os demais perfis tecnicamente aderentes quando existirem."
                      : "Tente simplificar a busca, trocar o estado ou explorar termos como React, Kubernetes, TypeScript ou Platform."}
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button type="button" className="rounded-full px-5" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                    <Button asChild variant="outline" className="rounded-full border-border/80 px-5">
                      <Link to="/cadastro?tipo=profissional">Quero publicar meu perfil profissional</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {displayedResults.items.map((profile) => (
                    <SearchResultCard
                      key={profile.id}
                      profile={profile}
                      isFavorite={favorites.includes(profile.id)}
                      favoritesLoading={favoritesLoading}
                      busyFavoriteId={busyFavoriteId}
                      onFavoriteToggle={handleFavoriteToggle}
                    />
                  ))}
                </div>
              )}

              {displayedResults.total > displayedResults.pageSize ? (
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Mostrando página {displayedResults.page} de {totalPages}.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full px-5"
                      onClick={() => {
                        if (resultMode === "affirmative") {
                          runCurrentAffirmativeSearch(Math.max(1, displayedResults.page - 1));
                          return;
                        }

                        updateFilters({ page: Math.max(1, displayedResults.page - 1) });
                      }}
                      disabled={displayedResults.page <= 1}
                    >
                      Página anterior
                    </Button>
                    <Button
                      type="button"
                      className="rounded-full px-5"
                      onClick={() => {
                        if (resultMode === "affirmative") {
                          runCurrentAffirmativeSearch(Math.min(totalPages, displayedResults.page + 1));
                          return;
                        }

                        updateFilters({ page: Math.min(totalPages, displayedResults.page + 1) });
                      }}
                      disabled={displayedResults.page >= totalPages}
                    >
                      Próxima página
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
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

      <SiteFooter />
    </div>
  );
};

const SearchResultCard = ({
  profile,
  isFavorite,
  favoritesLoading,
  busyFavoriteId,
  onFavoriteToggle,
}: {
  profile: PublicProfileSummary;
  isFavorite: boolean;
  favoritesLoading: boolean;
  busyFavoriteId: number | null;
  onFavoriteToggle: (profileId: number) => void;
}) => (
  <article className="surface-panel overflow-hidden p-6 md:p-7">
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-3xl leading-tight">{profile.name}</h3>
          {profile.openToOpportunities ? (
            <Badge className="rounded-full bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-600">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Aberto a oportunidades
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Perfil público ativo
            </Badge>
          )}
        </div>

        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">{profile.headline}</p>
        {profile.bioExcerpt ? (
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{profile.bioExcerpt}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-4 text-sm text-muted-foreground">
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

        <div className="mt-5 flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <Badge key={skill} variant="secondary" className="rounded-full bg-secondary/80 px-3 py-1 text-foreground">
              {skill}
            </Badge>
          ))}
        </div>
      </div>

      <div className="w-full xl:max-w-[272px]">
        <div className="rounded-[1.6rem] border border-border/80 bg-secondary/65 p-4">
          <p className="eyebrow">Ações</p>
          <div className="mt-4 space-y-3">
            <Button asChild className="w-full rounded-full">
              <Link to={`/profissionais/${profile.publicSlug}`}>Ver perfil público</Link>
            </Button>
            <Button
              type="button"
              variant={isFavorite ? "secondary" : "outline"}
              className="w-full rounded-full border-border/80"
              onClick={() => onFavoriteToggle(profile.id)}
              disabled={favoritesLoading || busyFavoriteId === profile.id}
            >
              {busyFavoriteId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
              {isFavorite ? "Remover favorito" : "Favoritar perfil"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </article>
);

export default Search;
