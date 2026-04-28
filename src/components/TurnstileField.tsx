import { useEffect, useId, useRef, useState } from "react";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { isLocalDevelopmentHostname } from "@/lib/development-hosts.js";

export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove?: (widgetId: string) => void;
    };
  }
}

interface TurnstileFieldProps {
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
  siteKey?: string;
  className?: string;
}

function isLocalHostname() {
  if (typeof window === "undefined") {
    return false;
  }

  return isLocalDevelopmentHostname(window.location.hostname);
}

function shouldUseLocalStub(siteKey?: string) {
  return !siteKey || siteKey === TURNSTILE_TEST_SITE_KEY || isLocalHostname();
}

export function TurnstileField({
  onTokenChange,
  resetKey = 0,
  siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY,
  className = "",
}: TurnstileFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptRequestedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fallbackId = useId();

  useEffect(() => {
    if (shouldUseLocalStub(siteKey)) {
      onTokenChange(TURNSTILE_DUMMY_TOKEN);
      return undefined;
    }

    if (!siteKey) {
      onTokenChange(null);
      setLoadError("Proteção anti-bot indisponível.");
      return undefined;
    }

    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) {
        return;
      }

      containerRef.current.innerHTML = "";
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          setLoadError(null);
          onTokenChange(token);
        },
        "expired-callback": () => {
          onTokenChange(null);
        },
        "error-callback": () => {
          onTokenChange(null);
          setLoadError("Não foi possível iniciar a proteção anti-bot.");
        },
        theme: "auto",
      });
    };

    const existingScript = document.getElementById("cloudflare-turnstile-script") as HTMLScriptElement | null;

    if (window.turnstile) {
      renderWidget();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderWidget);
      existingScript.addEventListener("error", () => {
        setLoadError("Não foi possível carregar a proteção anti-bot.");
      });
    } else if (!scriptRequestedRef.current) {
      scriptRequestedRef.current = true;
      const script = document.createElement("script");
      script.id = "cloudflare-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget);
      script.addEventListener("error", () => {
        setLoadError("Não foi possível carregar a proteção anti-bot.");
      });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;

      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [onTokenChange, siteKey]);

  useEffect(() => {
    if (shouldUseLocalStub(siteKey)) {
      onTokenChange(TURNSTILE_DUMMY_TOKEN);
      return;
    }

    onTokenChange(null);

    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [onTokenChange, resetKey, siteKey]);

  if (shouldUseLocalStub(siteKey)) {
    return (
      <div
        id={fallbackId}
        className={`mt-3 rounded-2xl border border-[hsl(var(--brand-teal))]/30 bg-[hsl(var(--brand-teal))]/10 px-4 py-3 text-sm text-foreground ${className}`.trim()}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-[hsl(var(--brand-teal))]" />
          <div>
            <p className="font-medium">Proteção anti-bot local ativa</p>
            <p className="mt-1 text-muted-foreground">
              Ambiente local ou de teste validado com a chave oficial de desenvolvimento do Turnstile.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="mt-3 min-h-16 overflow-hidden rounded-2xl" />
      {loadError ? (
        <div className="mt-2 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4" />
          <span>{loadError}</span>
        </div>
      ) : null}
    </div>
  );
}
