export type Seniority = "" | "junior" | "pleno" | "senior";
export type WorkModel = "remoto" | "hibrido" | "presencial";
export type WorkModelFilter = "" | WorkModel;
export type AffirmativeGroup =
  | "women"
  | "black_people"
  | "indigenous_people"
  | "lgbtqiapn_people"
  | "pcd";
export type AffirmativeSearchUseCase = "vaga_afirmativa" | "vaga_inclusiva";

export interface Experience {
  id: string;
  role_title: string;
  company_name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
}

export interface AffirmativeProfile {
  groups: AffirmativeGroup[];
  policyVersion: string;
  consentAcceptedAt: string | null;
}

export interface AffirmativeSearchContext {
  useCase: AffirmativeSearchUseCase;
  vacancyReference: string;
}

export interface AffirmativeSearchFilters {
  genderGroups: Extract<AffirmativeGroup, "women" | "lgbtqiapn_people">[];
  raceGroups: Extract<AffirmativeGroup, "black_people" | "indigenous_people">[];
  pcdOnly: boolean;
}

export interface ProfileData {
  name: string;
  city: string;
  state: string;
  bio: string;
  headline: string;
  linkedin: string;
  github: string;
  portfolio: string;
  contactEmail: string;
  showContactEmailToRecruiters: boolean;
  skills: string[];
  experiences: Experience[];
  seniority: Seniority;
  workModels: WorkModel[];
  openToOpportunities: boolean;
  isPublished: boolean;
  affirmativeProfile: AffirmativeProfile;
}

export interface ProfilePublication {
  isPublished: boolean;
  publicSlug: string;
  publishedAt: string | null;
  updatedAt: string | null;
  expiredAt: string | null;
  staleAfterAt: string | null;
  freshnessStatus: "active" | "expired";
  isPublishable: boolean;
  issues: string[];
  moderationBlockedAt: string | null;
  moderationBlockReason: string | null;
}

export interface OwnProfileResponse {
  profile: ProfileData;
  publication: ProfilePublication;
}

export interface PublicProfileSummary {
  id: number;
  name: string;
  publicSlug: string;
  headline: string;
  bioExcerpt: string;
  city: string;
  state: string;
  seniority: Exclude<Seniority, "">;
  workModels: WorkModel[];
  openToOpportunities: boolean;
  skills: string[];
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface PublicProfileDetail extends Omit<PublicProfileSummary, "bioExcerpt"> {
  bio: string;
  experiences: Experience[];
  links: {
    linkedin: string;
    github: string;
    portfolio: string;
  };
}

export interface SearchProfilesParams {
  q: string;
  seniority: Seniority;
  workModel: WorkModelFilter;
  state: string;
  openToOpportunities: boolean;
  page: number;
  pageSize: number;
}

export interface AffirmativeSearchPayload extends SearchProfilesParams {
  affirmativeContext: AffirmativeSearchContext;
  affirmativeFilters: AffirmativeSearchFilters;
}

export interface SearchProfilesResponse {
  items: PublicProfileSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FavoriteProfile extends PublicProfileSummary {
  favoritedAt: string | null;
}

export interface SavedSearchCriteria {
  q: string;
  seniority: Seniority;
  workModel: WorkModelFilter;
  state: string;
  openToOpportunities: boolean;
  affirmativeContext?: AffirmativeSearchContext;
  affirmativeFilters?: AffirmativeSearchFilters;
}

export type SavedSearchAlertFrequency = "disabled" | "daily" | "weekly" | "biweekly" | "monthly";

export interface SavedSearch {
  id: number;
  name: string;
  criteria: SavedSearchCriteria;
  alertFrequency: SavedSearchAlertFrequency;
  createdAt: string | null;
  updatedAt: string | null;
  lastAlertSentAt: string | null;
}

export interface AffirmativeSearchPolicyStatus {
  accepted: boolean;
  acceptedAt: string | null;
  policyVersion: string;
  policyHash?: string;
}

export const createEmptyProfileData = (name = "", contactEmail = ""): ProfileData => ({
  name,
  city: "",
  state: "",
  bio: "",
  headline: "",
  linkedin: "",
  github: "",
  portfolio: "",
  contactEmail,
  showContactEmailToRecruiters: false,
  skills: [],
  experiences: [],
  seniority: "",
  workModels: [],
  openToOpportunities: false,
  isPublished: false,
  affirmativeProfile: {
    groups: [],
    policyVersion: "",
    consentAcceptedAt: null,
  },
});

export const createDefaultSearchParams = (): SearchProfilesParams => ({
  q: "",
  seniority: "",
  workModel: "",
  state: "",
  openToOpportunities: false,
  page: 1,
  pageSize: 20,
});
