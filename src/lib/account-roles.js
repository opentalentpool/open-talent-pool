export const PUBLIC_ACCOUNT_ROLE_VALUES = ["professional", "recruiter"];
export const ACCOUNT_ROLE_VALUES = [...PUBLIC_ACCOUNT_ROLE_VALUES, "administrator", "admin"];

export const ACCOUNT_ROLE_LABEL = {
  professional: "Profissional",
  recruiter: "Recrutador",
  administrator: "Administrador",
  admin: "Administrador",
};

export function isAccountRole(value) {
  return ACCOUNT_ROLE_VALUES.includes(value);
}

export function isPublicAccountRole(value) {
  return PUBLIC_ACCOUNT_ROLE_VALUES.includes(value);
}

export function normalizeAccountRoleList(values = []) {
  return [...new Set(values.filter(isAccountRole))];
}

export function getDefaultActiveRole(legacyRole, availableRoles = []) {
  if (isAccountRole(legacyRole) && availableRoles.includes(legacyRole)) {
    return legacyRole;
  }

  return availableRoles[0] || null;
}
