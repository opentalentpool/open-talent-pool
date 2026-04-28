export type ModerationTargetKind =
  | "professional_public_profile"
  | "recruiter_contact_access";

export type ModerationReportCategory =
  | "false_identity"
  | "third_party_data"
  | "sensitive_data_exposure"
  | "harassment_or_abuse"
  | "fraud_or_misleading"
  | "discrimination"
  | "spam_or_scraping"
  | "other";

export type ModerationReportStatus = "open" | "resolved";

export type ModerationResolutionCode =
  | "dismiss_good_faith"
  | "dismiss_false_report"
  | "hide_professional_profile"
  | "suspend_target_account"
  | "permanent_ban_target_account";

export type ModerationActionType =
  | "dismiss_good_faith"
  | "dismiss_false_report"
  | "hide_professional_profile"
  | "restore_professional_profile"
  | "suspend_target_account"
  | "permanent_ban_target_account"
  | "restore_target_account"
  | "lift_reporting_restriction";

export type ModerationNextSanction =
  | "hide_professional_profile"
  | "suspend_target_account"
  | "permanent_ban_target_account"
  | null;

export type AdminRoleActionType =
  | "grant_administrator"
  | "revoke_administrator";

export interface ReportSubmissionStatus {
  canSubmit: boolean;
  falseReportStrikeCount: number;
  reportingRestrictedUntil: string | null;
  reportingRestrictionReason: string | null;
}

export interface ContactAccessLog {
  id: number;
  recruiterUserId: number | null;
  recruiterName: string;
  recruiterEmailHint: string;
  professionalPublicSlug: string | null;
  accessedAt: string | null;
}

export interface ModerationReport {
  id: number;
  reporterUserId: number;
  reporterName: string;
  targetUserId: number | null;
  targetName: string;
  targetEmailHint: string | null;
  targetKind: ModerationTargetKind;
  category: ModerationReportCategory;
  description: string;
  targetSnapshot: Record<string, unknown>;
  status: ModerationReportStatus;
  resolutionCode: ModerationResolutionCode | null;
  adminNotes: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  targetStrikeCount: number | null;
  nextSanction: ModerationNextSanction;
}

export type ModerationReportSummary = Omit<
  ModerationReport,
  "description" | "targetSnapshot" | "adminNotes"
>;

export interface ModerationActionRecord {
  id: number;
  actionType: ModerationActionType;
  subjectUserId: number | null;
  subjectName: string;
  subjectEmailHint: string | null;
  relatedReportId: number | null;
  createdByName: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

export interface HiddenProfileRecord {
  userId: number;
  name: string;
  publicSlug: string | null;
  blockedAt: string | null;
  blockReason: string | null;
}

export interface SuspendedAccountRecord {
  userId: number;
  name: string;
  emailHint: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
}

export interface RestrictedReporterRecord {
  userId: number;
  name: string;
  emailHint: string;
  restrictedUntil: string | null;
  restrictionReason: string | null;
  falseReportStrikeCount: number;
}

export interface AdminModerationListResponse {
  reports: ModerationReportSummary[];
  hiddenProfiles: HiddenProfileRecord[];
  suspendedAccounts: SuspendedAccountRecord[];
  restrictedReporters: RestrictedReporterRecord[];
  recentActions: ModerationActionRecord[];
}

export interface AdminRoleActionRecord {
  actionType: AdminRoleActionType;
  reason: string;
  createdAt: string | null;
  createdByName: string | null;
}

export interface AdminManagedUser {
  id: number;
  name: string;
  email: string;
  isVerified: boolean;
  isAdministrator: boolean;
  isReservedInternalAdmin: boolean;
  canPromote: boolean;
  canRevoke: boolean;
  lastAdminAction: AdminRoleActionRecord | null;
}

export interface AdminUserListResponse {
  users: AdminManagedUser[];
}
