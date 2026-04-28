export const MODERATION_TARGET_KIND_VALUES = [
  "professional_public_profile",
  "recruiter_contact_access",
];

export const MODERATION_REPORT_CATEGORY_VALUES = [
  "false_identity",
  "third_party_data",
  "sensitive_data_exposure",
  "harassment_or_abuse",
  "fraud_or_misleading",
  "discrimination",
  "spam_or_scraping",
  "other",
];

export const MODERATION_REPORT_STATUS_VALUES = ["open", "resolved"];

export const MODERATION_RESOLUTION_CODE_VALUES = [
  "dismiss_good_faith",
  "dismiss_false_report",
  "hide_professional_profile",
  "suspend_target_account",
  "permanent_ban_target_account",
];

export const MODERATION_ACTION_TYPE_VALUES = [
  "dismiss_good_faith",
  "dismiss_false_report",
  "hide_professional_profile",
  "restore_professional_profile",
  "suspend_target_account",
  "permanent_ban_target_account",
  "restore_target_account",
  "lift_reporting_restriction",
];

export const PROFESSIONAL_PROFILE_STRIKE_ACTION_VALUES = [
  "hide_professional_profile",
  "suspend_target_account",
  "permanent_ban_target_account",
];

export const IMMEDIATE_PERMANENT_BAN_CATEGORY_VALUES = [
  "discrimination",
];

export const MODERATION_REPORT_CATEGORY_LABEL = {
  false_identity: "Falsa identidade",
  third_party_data: "Dados de terceiros",
  sensitive_data_exposure: "Exposição de dados sensíveis",
  harassment_or_abuse: "Assédio ou abuso",
  fraud_or_misleading: "Fraude ou informação enganosa",
  discrimination: "Discriminação",
  spam_or_scraping: "Spam ou scraping",
  other: "Outro motivo",
};

export const MODERATION_TARGET_KIND_LABEL = {
  professional_public_profile: "Perfil profissional público",
  recruiter_contact_access: "Acesso de recrutador ao contato",
};

export const MODERATION_RESOLUTION_CODE_LABEL = {
  dismiss_good_faith: "Arquivada sem penalidade",
  dismiss_false_report: "Denúncia falsa confirmada",
  hide_professional_profile: "Perfil ocultado",
  suspend_target_account: "Conta suspensa",
  permanent_ban_target_account: "Banimento definitivo",
};

export const MODERATION_ACTION_TYPE_LABEL = {
  dismiss_good_faith: "Arquivamento sem penalidade",
  dismiss_false_report: "Denúncia falsa confirmada",
  hide_professional_profile: "Perfil ocultado",
  restore_professional_profile: "Perfil restaurado",
  suspend_target_account: "Conta suspensa",
  permanent_ban_target_account: "Banimento definitivo",
  restore_target_account: "Conta restaurada",
  lift_reporting_restriction: "Restrição de denúncias removida",
};

export const REPORTING_STRIKE_THRESHOLD = 3;
export const REPORTING_STRIKE_WINDOW_DAYS = 365;
export const REPORTING_RESTRICTION_DAYS = 90;
export const REPORT_SUBMISSION_LIMIT = 5;
export const REPORT_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;
