export const DEFAULT_INTERNAL_OPERATIONS_ADMIN_EMAIL = "internal-admin@opentalentpool.local";
export const DEFAULT_INTERNAL_ACCOUNT_EMAIL_DOMAIN = "opentalentpool.local";
export const INTERNAL_OPERATIONS_ADMIN_EMAIL = DEFAULT_INTERNAL_OPERATIONS_ADMIN_EMAIL;
export const INTERNAL_ACCOUNT_EMAIL_DOMAIN = DEFAULT_INTERNAL_ACCOUNT_EMAIL_DOMAIN;
export const INTERNAL_OPERATIONS_ADMIN_ROLE = "administrator";
export const INTERNAL_OPERATIONS_ADMIN_NAME = "Operações internas";

export function normalizeInternalAccountPolicy(policy = {}) {
  const operationsAdminEmail = normalizeInternalAccountEmail(
    policy.operationsAdminEmail || policy.internalOperationsAdminEmail || DEFAULT_INTERNAL_OPERATIONS_ADMIN_EMAIL,
  );
  const accountEmailDomain = normalizeInternalAccountEmail(
    policy.accountEmailDomain || policy.internalAccountEmailDomain || DEFAULT_INTERNAL_ACCOUNT_EMAIL_DOMAIN,
  );

  return {
    operationsAdminEmail,
    accountEmailDomain,
  };
}

export function normalizeInternalAccountEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function getInternalAccountEmailDomain(email) {
  return normalizeInternalAccountEmail(email).split("@")[1] || "";
}

export function isInternalAccountDomainEmail(email, policy) {
  const internalPolicy = normalizeInternalAccountPolicy(policy);
  return getInternalAccountEmailDomain(email) === internalPolicy.accountEmailDomain;
}

export function isInternalOperationsAdminEmail(email, policy) {
  const internalPolicy = normalizeInternalAccountPolicy(policy);
  return normalizeInternalAccountEmail(email) === internalPolicy.operationsAdminEmail;
}

export function isEligibleInternalAdministratorEmail(email, policy) {
  return isInternalAccountDomainEmail(email, policy) && !isInternalOperationsAdminEmail(email, policy);
}

export function isInternalAccountUser(user, policy) {
  return isInternalAccountDomainEmail(user?.email, policy);
}

export function isInternalOperationsAdminUser(user, policy) {
  return isInternalOperationsAdminEmail(user?.email, policy);
}
