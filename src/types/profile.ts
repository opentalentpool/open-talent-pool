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
  seniority: Seniority;
  description: string;
  positions: ExperiencePosition[];
}

export interface ExperiencePosition {
  id: string;
  role_title: string;
  seniority: Seniority;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  description: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  issued_at: string;
  credential_url: string;
  description: string;
}

export interface Language {
  id: string;
  name: string;
  proficiency: string;
}

export interface Project {
  id: string;
  name: string;
  role: string;
  url: string;
  start_date: string;
  end_date: string;
  description: string;
  skills: string[];
}

export interface Publication {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  description: string;
}

export interface VolunteerExperience {
  id: string;
  organization: string;
  role: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
}

export interface Award {
  id: string;
  title: string;
  issuer: string;
  awarded_at: string;
  description: string;
}

export interface Course {
  id: string;
  name: string;
  institution: string;
  completed_at: string;
  description: string;
}

export interface Organization {
  id: string;
  name: string;
  role: string;
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
  educations: Education[];
  certifications: Certification[];
  languages: Language[];
  projects: Project[];
  publications: Publication[];
  volunteerExperiences: VolunteerExperience[];
  awards: Award[];
  courses: Course[];
  organizations: Organization[];
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
  educations: Education[];
  certifications: Certification[];
  languages: Language[];
  projects: Project[];
  publications: Publication[];
  volunteerExperiences: VolunteerExperience[];
  awards: Award[];
  courses: Course[];
  organizations: Organization[];
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
  language: string;
  certification: string;
  education: string;
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
  language: string;
  certification: string;
  education: string;
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
  educations: [],
  certifications: [],
  languages: [],
  projects: [],
  publications: [],
  volunteerExperiences: [],
  awards: [],
  courses: [],
  organizations: [],
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
  language: "",
  certification: "",
  education: "",
  page: 1,
  pageSize: 20,
});
