import { AFFIRMATIVE_POLICY_VERSION } from "./affirmative-config.js";

export const LEGAL_CONTROLLER_NAME = "Gabriel Lopes do Nascimento";
export const LEGAL_CONTROLLER_CNPJ = "64.001.808/0001-76";
export const LEGAL_CONTACT_EMAIL = "contato@opentalentpool.org";
export const LEGAL_DOCUMENT_EFFECTIVE_DATE_LABEL = "27/04/2026";

export const LEGAL_POLICY_KEY = {
  privacyPolicy: "privacy-policy",
  termsOfUse: "terms-of-use",
  cookiesPolicy: "cookies-policy",
  inclusiveUsePolicy: "inclusive-use-policy",
};

export const LEGAL_POLICY_ROUTE = {
  privacyPolicy: "/privacidade",
  termsOfUse: "/termos",
  cookiesPolicy: "/cookies",
  inclusiveUsePolicy: "/uso-inclusivo",
};

export const LEGAL_POLICY_VERSION = {
  privacyPolicy: "2026-04-27.v3",
  termsOfUse: "2026-04-27.v3",
  cookiesPolicy: "2026-04-27.v3",
  inclusiveUsePolicy: AFFIRMATIVE_POLICY_VERSION,
};

// SHA-256 of the canonical public document payload for each policy version.
export const LEGAL_POLICY_HASH = {
  privacyPolicy: "07f2b5fe1207a31a2c82dcf33fe4c5c13824bfe201cffa4264e68f8e68409b2e",
  termsOfUse: "ca0b88410be114a7963d4630e62955f7b42382e86ed6940a502525a44b4fec15",
  cookiesPolicy: "56cdc5f159a8184b3ee61b63147684e43b5429ef6cdc47d300be03141bb03380",
  inclusiveUsePolicy: "54a35a9460c6ef650a400f4aebcad21001b41835d95e984620ec482b5a10029d",
};

export const SIGNUP_POLICY_ACCEPTANCE_SOURCE = "signup";

export const SIGNUP_REQUIRED_POLICIES = [
  {
    key: LEGAL_POLICY_KEY.termsOfUse,
    version: LEGAL_POLICY_VERSION.termsOfUse,
    hash: LEGAL_POLICY_HASH.termsOfUse,
  },
  {
    key: LEGAL_POLICY_KEY.privacyPolicy,
    version: LEGAL_POLICY_VERSION.privacyPolicy,
    hash: LEGAL_POLICY_HASH.privacyPolicy,
  },
];

export const LEGAL_FOOTER_LINKS = [
  {
    label: "Política de Privacidade",
    href: LEGAL_POLICY_ROUTE.privacyPolicy,
  },
  {
    label: "Termos de Uso",
    href: LEGAL_POLICY_ROUTE.termsOfUse,
  },
  {
    label: "Política de Cookies",
    href: LEGAL_POLICY_ROUTE.cookiesPolicy,
  },
  {
    label: "Política de Uso Inclusivo",
    href: LEGAL_POLICY_ROUTE.inclusiveUsePolicy,
  },
];
