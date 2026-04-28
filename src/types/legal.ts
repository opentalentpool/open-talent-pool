import type { AuthUser } from "@/types/auth";
import type {
  AffirmativeSearchUseCase,
  FavoriteProfile,
  OwnProfileResponse,
  SavedSearch,
  SavedSearchCriteria,
} from "@/types/profile";
import type {
  ContactAccessLog,
  ModerationReport,
  ReportSubmissionStatus,
} from "@/types/moderation";

export interface PolicyAcceptanceRecord {
  policyKey: string;
  policyVersion: string;
  policyHash: string;
  acceptedAt: string | null;
  acceptanceSource: string | null;
}

export interface InclusiveSearchAuditRecord {
  policyKey: string;
  policyVersion: string;
  policyHash: string;
  useCase: AffirmativeSearchUseCase;
  vacancyReference: string;
  criteria: SavedSearchCriteria;
  resultCount: number;
  createdAt: string | null;
}

export interface PrivacyExportResponse {
  exportedAt: string;
  account: AuthUser;
  profile: OwnProfileResponse | null;
  recruiter: {
    favorites: FavoriteProfile[];
    savedSearches: SavedSearch[];
  };
  policyAcceptances: {
    user: PolicyAcceptanceRecord[];
    recruiter: PolicyAcceptanceRecord[];
  };
  inclusiveSearchAudit: InclusiveSearchAuditRecord[];
  moderation: {
    contactAccessLogs: ContactAccessLog[];
    reportsMade: ModerationReport[];
    reportingStatus: ReportSubmissionStatus;
  };
}

export interface AccountDeleteResponse {
  ok: true;
  deletedAt: string;
}
