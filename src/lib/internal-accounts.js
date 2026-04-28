export const INTERNAL_OPERATIONS_ADMIN_EMAIL = "administrator@opentalentpool.org";
export const INTERNAL_OPERATIONS_ADMIN_ROLE = "administrator";
export const INTERNAL_OPERATIONS_ADMIN_NAME = "Operações internas";
export const INTERNAL_ACCOUNT_EMAIL_DOMAIN = "opentalentpool.org";

export function normalizeInternalAccountEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function getInternalAccountEmailDomain(email) {
  return normalizeInternalAccountEmail(email).split("@")[1] || "";
}

export function isInternalAccountDomainEmail(email) {
  return getInternalAccountEmailDomain(email) === INTERNAL_ACCOUNT_EMAIL_DOMAIN;
}

export function isInternalOperationsAdminEmail(email) {
  return normalizeInternalAccountEmail(email) === INTERNAL_OPERATIONS_ADMIN_EMAIL;
}

export function isEligibleInternalAdministratorEmail(email) {
  return isInternalAccountDomainEmail(email) && !isInternalOperationsAdminEmail(email);
}

export function isInternalAccountUser(user) {
  return isInternalAccountDomainEmail(user?.email);
}

export function isInternalOperationsAdminUser(user) {
  return isInternalOperationsAdminEmail(user?.email);
}
