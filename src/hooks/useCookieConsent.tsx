import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  clearOptionalBrowserStorage,
  getCookieConsentDecision,
  persistCookieConsentDecision,
  type CookieConsentDecision,
} from "@/lib/cookie-consent";

interface CookieConsentContextValue {
  decision: CookieConsentDecision;
  canUseOptionalStorage: boolean;
  isBannerOpen: boolean;
  acceptOptionalStorage: () => void;
  rejectOptionalStorage: () => void;
  reopenPreferences: () => void;
}

const noop = () => {};

const CookieConsentContext = createContext<CookieConsentContextValue>({
  decision: "accepted",
  canUseOptionalStorage: true,
  isBannerOpen: false,
  acceptOptionalStorage: noop,
  rejectOptionalStorage: noop,
  reopenPreferences: noop,
});

function resolveInitialDecision(initialDecision?: CookieConsentDecision) {
  if (initialDecision) {
    return initialDecision;
  }

  return getCookieConsentDecision();
}

export const CookieConsentProvider = ({
  children,
  initialDecision,
}: PropsWithChildren<{ initialDecision?: CookieConsentDecision }>) => {
  const [decision, setDecision] = useState<CookieConsentDecision>(() => resolveInitialDecision(initialDecision));
  const [isBannerOpen, setIsBannerOpen] = useState(() => resolveInitialDecision(initialDecision) === "unset");

  useEffect(() => {
    if (decision === "rejected") {
      clearOptionalBrowserStorage();
    }
  }, [decision]);

  const acceptOptionalStorage = () => {
    persistCookieConsentDecision("accepted");
    setDecision("accepted");
    setIsBannerOpen(false);
  };

  const rejectOptionalStorage = () => {
    clearOptionalBrowserStorage();
    persistCookieConsentDecision("rejected");
    setDecision("rejected");
    setIsBannerOpen(false);
  };

  const reopenPreferences = () => {
    setIsBannerOpen(true);
  };

  const value = useMemo<CookieConsentContextValue>(
    () => ({
      decision,
      canUseOptionalStorage: decision === "accepted",
      isBannerOpen,
      acceptOptionalStorage,
      rejectOptionalStorage,
      reopenPreferences,
    }),
    [decision, isBannerOpen],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
};

export function useCookieConsent() {
  return useContext(CookieConsentContext);
}
