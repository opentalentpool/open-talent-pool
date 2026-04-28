import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Controller, type UseFormReturn, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, BriefcaseBusiness, CircleAlert, CircleCheckBig, Info, Mail, Search, ShieldCheck, Sparkles, Users2, type LucideIcon } from "lucide-react";
import api from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { useIsMobile } from "@/hooks/use-mobile";
import { SiteFooter } from "@/components/SiteFooter";
import { TurnstileField } from "@/components/TurnstileField";
import { LEGAL_POLICY_ROUTE } from "@/lib/legal-policies.js";
import { INTERNAL_OPERATIONS_ADMIN_ROLE, isInternalOperationsAdminUser } from "@/lib/internal-accounts.js";
import {
  clearPendingAuthSession,
  loadPendingAuthSession,
  PENDING_AUTH_TTL_MS,
  savePendingAuthSession,
} from "@/lib/pending-auth-session";
import { toast } from "sonner";
import type { ApiError, AuthUser } from "@/types/auth";

const signUpSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(["professional", "recruiter"]),
  acceptedLegalPolicies: z.boolean().refine((value) => value === true, {
    message: "Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar a conta.",
  }),
});

const signInSchema = z.object({
  email: z.string().email("Email inválido"),
});

type SignUpFormData = z.infer<typeof signUpSchema>;
type SignInFormData = z.infer<typeof signInSchema>;
type AuthStep = "welcome" | "auth";
type AuthEntryIntent = "signin" | "signup";
type AuthNoticeTone = "success" | "info" | "error";

interface StepCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface AuthNotice {
  tone: AuthNoticeTone;
  title: string;
  description: string;
}

interface WelcomeStepProps {
  eyebrow: string;
  title: string;
  description: string;
  cards: StepCard[];
  primaryActionLabel: string;
  secondaryActionLabel: string;
  onContinue: () => void;
  onSkip: () => void;
}

const defaultWelcomeCards: StepCard[] = [
  {
    title: "Explorar primeiro",
    description: "A busca pública funciona sem cadastro obrigatório para a primeira visita.",
    icon: Search,
  },
  {
    title: "Autenticar quando fizer sentido",
    description: "E-mail com código, perfil editável, favoritos e buscas salvas entram só quando você precisa deles.",
    icon: ShieldCheck,
  },
];

const mobileSignupWelcomeCards: StepCard[] = [
  {
    title: "Explorar sem conta",
    description: "A busca pública já funciona na primeira visita.",
    icon: Search,
  },
  {
    title: "Entrar quando precisar",
    description: "Código por e-mail para editar perfil e salvar buscas.",
    icon: ShieldCheck,
  },
];

const heroFeatureCards: StepCard[] = [
  {
    title: "Profissionais",
    description: "Perfil editável, publicação manual e contato por e-mail controlado pelo profissional.",
    icon: Users2,
  },
  {
    title: "Recrutadores",
    description: "Favoritos, buscas salvas e alertas por e-mail para continuar a curadoria.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Entrada leve",
    description: "Sem senha inicial, sem onboarding inchado e sem esconder a busca atrás da autenticação.",
    icon: Sparkles,
  },
];

const WelcomeStep = ({
  eyebrow,
  title,
  description,
  cards,
  primaryActionLabel,
  secondaryActionLabel,
  onContinue,
  onSkip,
}: WelcomeStepProps) => (
  <div className="space-y-8">
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-4xl leading-tight">{title}</h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground">{description}</p>
    </div>

    <div className="grid gap-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div key={card.title} className="rounded-[1.6rem] border border-border/80 bg-white/85 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl leading-tight">{card.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>

    <div className="flex flex-col gap-3">
      <Button onClick={onContinue} size="lg" className="h-12 rounded-full">
        <Mail className="h-4 w-4" />
        {primaryActionLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" onClick={onSkip} className="h-12 rounded-full border-border/80">
        {secondaryActionLabel}
      </Button>
    </div>
  </div>
);

interface AuthFormsStepProps {
  signUpForm: UseFormReturn<SignUpFormData>;
  signInForm: UseFormReturn<SignInFormData>;
  activeTab: "signin" | "signup";
  onTabChange: (value: AuthEntryIntent) => void;
  onSignUp: (data: SignUpFormData) => Promise<void>;
  onSignIn: (data: SignInFormData) => Promise<void>;
  onVerifyCode: () => Promise<string | number | void>;
  onResendCode: () => Promise<void>;
  loading: boolean;
  pendingEmail: string | null;
  code: string;
  setCode: (code: string) => void;
  onBack: () => void;
  authNotice: AuthNotice | null;
  signInCaptchaResetKey: number;
  signInCaptchaReady: boolean;
  onSignInCaptchaChange: (token: string | null) => void;
  signUpCaptchaResetKey: number;
  signUpCaptchaReady: boolean;
  onSignUpCaptchaChange: (token: string | null) => void;
  resendCaptchaResetKey: number;
  resendCaptchaReady: boolean;
  onResendCaptchaChange: (token: string | null) => void;
  showOptionalStorageNotice: boolean;
}

const noticeToneMap: Record<
  AuthNoticeTone,
  {
    icon: typeof CircleCheckBig;
    className: string;
  }
> = {
  success: {
    icon: CircleCheckBig,
    className:
      "border-[hsl(var(--brand-teal))]/30 bg-[hsl(var(--brand-teal))]/10 text-foreground [&>svg]:text-[hsl(var(--brand-teal))]",
  },
  info: {
    icon: Info,
    className:
      "border-[hsl(var(--brand-blue))]/25 bg-[hsl(var(--brand-blue))]/10 text-foreground [&>svg]:text-[hsl(var(--brand-blue))]",
  },
  error: {
    icon: CircleAlert,
    className: "border-destructive/35 bg-destructive/5 text-foreground [&>svg]:text-destructive",
  },
};

const AuthNoticeCard = ({ notice, className = "" }: { notice: AuthNotice | null; className?: string }) => {
  if (!notice) return null;

  const tone = noticeToneMap[notice.tone];
  const Icon = tone.icon;

  return (
    <Alert className={`${tone.className} ${className}`.trim()}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.description}</AlertDescription>
    </Alert>
  );
};

function resolvePostAuthPath(user: AuthUser | null | undefined, safeNextPath: string | null) {
  if (user && (isInternalOperationsAdminUser(user) || user.activeRole === INTERNAL_OPERATIONS_ADMIN_ROLE)) {
    return "/dashboard";
  }

  return safeNextPath || "/dashboard";
}

const AuthFormsStep = ({
  signUpForm,
  signInForm,
  activeTab,
  onTabChange,
  onSignUp,
  onSignIn,
  onVerifyCode,
  onResendCode,
  loading,
  pendingEmail,
  code,
  setCode,
  onBack,
  authNotice,
  signInCaptchaResetKey,
  signInCaptchaReady,
  onSignInCaptchaChange,
  signUpCaptchaResetKey,
  signUpCaptchaReady,
  onSignUpCaptchaChange,
  resendCaptchaResetKey,
  resendCaptchaReady,
  onResendCaptchaChange,
  showOptionalStorageNotice,
}: AuthFormsStepProps) => (
  <div>
    <div>
      <p className="eyebrow">Autenticação</p>
      <h2 className="mt-4 text-4xl leading-tight">Entrar, cadastrar ou verificar código</h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        Sem senha inicial e sem fricção extra. O acesso acontece pelo seu e-mail.
      </p>
      {!pendingEmail ? <AuthNoticeCard notice={authNotice} className="mt-6" /> : null}
    </div>

    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as AuthEntryIntent)} className="mt-8">
      <TabsList className="grid h-12 w-full grid-cols-2 rounded-full bg-secondary/85 p-1">
        <TabsTrigger value="signin" className="rounded-full">
          Entrar
        </TabsTrigger>
        <TabsTrigger value="signup" className="rounded-full">
          Cadastrar
        </TabsTrigger>
      </TabsList>

      <TabsContent value="signin" className="mt-6">
        {!pendingEmail ? (
          <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-4">
            <div>
              <Label htmlFor="signin-email">Email</Label>
              <Input id="signin-email" type="email" placeholder="seu@email.com" className="mt-2 h-12 rounded-2xl border-border/80 bg-white/85" {...signInForm.register("email")} />
              {signInForm.formState.errors.email ? (
                <p className="mt-1 text-sm text-destructive">{signInForm.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div>
              <Label>Validação anti-bot</Label>
              <TurnstileField onTokenChange={onSignInCaptchaChange} resetKey={signInCaptchaResetKey} className="mt-2" />
            </div>
            <Button type="submit" className="h-12 w-full rounded-full" disabled={loading}>
              {loading ? "Enviando código..." : signInCaptchaReady ? "Enviar código" : "Conclua a validação anti-bot"}
            </Button>
          </form>
        ) : (
          <VerificationStep
            pendingEmail={pendingEmail}
            code={code}
            setCode={setCode}
            loading={loading}
            onVerifyCode={onVerifyCode}
            onResendCode={onResendCode}
            authNotice={authNotice}
            resendCaptchaResetKey={resendCaptchaResetKey}
            resendCaptchaReady={resendCaptchaReady}
            onResendCaptchaChange={onResendCaptchaChange}
            showOptionalStorageNotice={showOptionalStorageNotice}
          />
        )}
      </TabsContent>

      <TabsContent value="signup" className="mt-6">
        {!pendingEmail ? (
          <form
            onSubmit={signUpForm.handleSubmit(onSignUp, (errors) => {
              const errorMessages = Object.values(errors).map((err) => err.message).filter(Boolean);
              toast.error(`Por favor, corrija os erros: ${errorMessages.join(", ")}`);
            })}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome"
                required
                className="mt-2 h-12 rounded-2xl border-border/80 bg-white/85"
                {...signUpForm.register("name")}
              />
              {signUpForm.formState.errors.name ? (
                <p className="mt-1 text-sm text-destructive">{signUpForm.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                placeholder="seu@email.com"
                className="mt-2 h-12 rounded-2xl border-border/80 bg-white/85"
                {...signUpForm.register("email")}
              />
              {signUpForm.formState.errors.email ? (
                <p className="mt-1 text-sm text-destructive">{signUpForm.formState.errors.email.message}</p>
              ) : null}
            </div>

            <div>
              <Label>Tipo de conta</Label>
              <Controller
                control={signUpForm.control}
                name="role"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={(value) => field.onChange(value as "professional" | "recruiter")}
                    className="mt-3 grid gap-3"
                  >
                    <label className="flex items-start gap-3 rounded-[1.35rem] border border-border/80 bg-white/85 p-4">
                      <RadioGroupItem value="professional" id="professional" className="mt-1" />
                      <div>
                        <Label htmlFor="professional" className="cursor-pointer text-sm font-semibold text-foreground">
                          Sou profissional de TI
                        </Label>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Quero montar meu perfil técnico e decidir quando ele entra na busca pública.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-[1.35rem] border border-border/80 bg-white/85 p-4">
                      <RadioGroupItem value="recruiter" id="recruiter" className="mt-1" />
                      <div>
                        <Label htmlFor="recruiter" className="cursor-pointer text-sm font-semibold text-foreground">
                          Sou recrutador(a)
                        </Label>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Quero favoritar perfis, salvar buscas e acompanhar novas publicações aderentes.
                        </p>
                      </div>
                    </label>
                  </RadioGroup>
                )}
              />
            </div>

            <div className="rounded-[1.35rem] border border-border/80 bg-white/85 p-4">
              <Controller
                control={signUpForm.control}
                name="acceptedLegalPolicies"
                render={({ field }) => (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="accepted-legal-policies"
                      checked={Boolean(field.value)}
                      onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                      className="mt-1"
                    />
                    <div>
                      <Label htmlFor="accepted-legal-policies" className="cursor-pointer text-sm font-semibold text-foreground">
                        Aceito os Termos de Uso e a Política de Privacidade
                      </Label>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        O cadastro exige este aceite combinado para registrar a trilha legal da conta.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Leia{" "}
                        <Link
                          to={LEGAL_POLICY_ROUTE.termsOfUse}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline underline-offset-4 transition hover:text-primary/80"
                        >
                          Termos de Uso
                        </Link>{" "}
                        e{" "}
                        <Link
                          to={LEGAL_POLICY_ROUTE.privacyPolicy}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline underline-offset-4 transition hover:text-primary/80"
                        >
                          Política de Privacidade
                        </Link>
                        .
                      </p>
                    </div>
                  </div>
                )}
              />
              {signUpForm.formState.errors.acceptedLegalPolicies ? (
                <p className="mt-3 text-sm text-destructive">{signUpForm.formState.errors.acceptedLegalPolicies.message}</p>
              ) : null}
            </div>

            <div>
              <Label>Validação anti-bot</Label>
              <TurnstileField onTokenChange={onSignUpCaptchaChange} resetKey={signUpCaptchaResetKey} className="mt-2" />
            </div>

            <Button type="submit" className="h-12 w-full rounded-full" disabled={loading}>
              {loading ? "Enviando código..." : signUpCaptchaReady ? "Criar conta e enviar código" : "Conclua a validação anti-bot"}
            </Button>
          </form>
        ) : (
          <VerificationStep
            pendingEmail={pendingEmail}
            code={code}
            setCode={setCode}
            loading={loading}
            onVerifyCode={onVerifyCode}
            onResendCode={onResendCode}
            authNotice={authNotice}
            resendCaptchaResetKey={resendCaptchaResetKey}
            resendCaptchaReady={resendCaptchaReady}
            onResendCaptchaChange={onResendCaptchaChange}
            showOptionalStorageNotice={showOptionalStorageNotice}
          />
        )}
      </TabsContent>
    </Tabs>

    <Button variant="ghost" onClick={onBack} className="mt-4 w-full rounded-full">
      Voltar ao início
    </Button>
  </div>
);

const VerificationStep = ({
  pendingEmail,
  code,
  setCode,
  loading,
  onVerifyCode,
  onResendCode,
  authNotice,
  resendCaptchaResetKey,
  resendCaptchaReady,
  onResendCaptchaChange,
  showOptionalStorageNotice,
}: {
  pendingEmail: string;
  code: string;
  setCode: (code: string) => void;
  loading: boolean;
  onVerifyCode: () => Promise<string | number | void>;
  onResendCode: () => Promise<void>;
  authNotice: AuthNotice | null;
  resendCaptchaResetKey: number;
  resendCaptchaReady: boolean;
  onResendCaptchaChange: (token: string | null) => void;
  showOptionalStorageNotice: boolean;
}) => (
  <div className="rounded-[1.7rem] border border-border/80 bg-white/88 p-5">
    <AuthNoticeCard notice={authNotice} />
    <p className="mt-4 text-sm leading-6 text-muted-foreground">
      Use o código enviado para <strong className="text-foreground">{pendingEmail}</strong>. Se ele não chegar,
      revise o aviso acima antes de reenviar.
    </p>
    {showOptionalStorageNotice ? (
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Sem armazenamento opcional, este código não será retomado se você recarregar ou fechar a página.
      </p>
    ) : null}
    <Input
      value={code}
      onChange={(e) => setCode(e.target.value)}
      placeholder="000000"
      className="mt-4 h-12 rounded-2xl border-border/80 bg-background"
    />
    <div className="mt-4">
      <Label>Validar novo envio</Label>
      <TurnstileField onTokenChange={onResendCaptchaChange} resetKey={resendCaptchaResetKey} className="mt-2" />
    </div>
    <div className="mt-4 flex gap-2">
      <Button onClick={onVerifyCode} className="h-12 flex-1 rounded-full" disabled={loading}>
        {loading ? "Verificando..." : "Verificar código"}
      </Button>
      <Button variant="ghost" onClick={onResendCode} disabled={loading} className="h-12 rounded-full px-5">
        {resendCaptchaReady ? "Reenviar" : "Conclua o anti-bot"}
      </Button>
    </div>
  </div>
);

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { user, refreshUser } = useAuth();
  const { canUseOptionalStorage } = useCookieConsent();
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null);
  const [signInCaptchaToken, setSignInCaptchaToken] = useState<string | null>(null);
  const [signUpCaptchaToken, setSignUpCaptchaToken] = useState<string | null>(null);
  const [resendCaptchaToken, setResendCaptchaToken] = useState<string | null>(null);
  const [signInCaptchaResetKey, setSignInCaptchaResetKey] = useState(0);
  const [signUpCaptchaResetKey, setSignUpCaptchaResetKey] = useState(0);
  const [resendCaptchaResetKey, setResendCaptchaResetKey] = useState(0);
  const nextParam = searchParams.get("next");
  const paramTipo = searchParams.get("tipo");
  const safeNextPath = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const isSignupEntry = location.pathname === "/cadastro";
  const authEntryIntent: AuthEntryIntent = isSignupEntry ? "signup" : "signin";
  const isMobileSignupEntry = isMobile && isSignupEntry;
  const [currentStep, setCurrentStep] = useState<AuthStep>(paramTipo || safeNextPath ? "auth" : "welcome");
  const [activeTab, setActiveTab] = useState<AuthEntryIntent>(authEntryIntent);
  const defaultRole = paramTipo === "recrutador" ? "recruiter" : "professional";
  const welcomeCopy = isMobileSignupEntry
    ? {
        eyebrow: "Criar conta",
        title: "Criar conta sem etapa sobrando",
        description: "A busca já está aberta. A conta entra quando você quiser editar perfil, salvar buscas ou organizar favoritos.",
        cards: mobileSignupWelcomeCards,
        primaryActionLabel: "Criar conta com e-mail",
        secondaryActionLabel: "Explorar agora",
      }
    : {
        eyebrow: "Entrar ou criar conta",
        title: "Siga para a próxima etapa sem cair em um fluxo desnecessário.",
        description: "A navegação pública já está aberta. A conta entra quando você precisa editar perfil, favoritar ou salvar buscas.",
        cards: defaultWelcomeCards,
        primaryActionLabel: "Quero me autenticar agora",
        secondaryActionLabel: "Explorar sem me cadastrar",
      };
  const heroCopy = isMobileSignupEntry
    ? {
        title: "Conta quando fizer sentido. Busca continua aberta.",
        description: "Edite perfil, salve buscas e organize favoritos sem bloquear a primeira exploração.",
      }
    : {
        title: "A mesma plataforma serve quem quer aparecer melhor e quem precisa encontrar melhor.",
        description:
          "Use a conta quando precisar editar perfil, organizar shortlist ou salvar filtros. A busca pública continua aberta como porta de entrada.",
      };

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      role: defaultRole,
      acceptedLegalPolicies: false,
    },
  });

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  });

  useEffect(() => {
    if (user) {
      navigate(resolvePostAuthPath(user, safeNextPath));
    }
  }, [user, navigate, safeNextPath]);

  const persistPendingAuth = ({ challengeId, email, intent }: { challengeId: string; email: string; intent: AuthEntryIntent }) => {
    const normalizedEmail = email.trim().toLowerCase();

    setPendingEmail(normalizedEmail);
    setPendingChallengeId(challengeId);
    setCode("");
    setCurrentStep("auth");
    setActiveTab(intent);
    signInForm.setValue("email", normalizedEmail, { shouldDirty: false, shouldTouch: false });
    signUpForm.setValue("email", normalizedEmail, { shouldDirty: false, shouldTouch: false });
    if (canUseOptionalStorage) {
      savePendingAuthSession({
        challengeId,
        email: normalizedEmail,
        intent,
        expiresAt: Date.now() + PENDING_AUTH_TTL_MS,
        updatedAt: Date.now(),
      });
      return;
    }

    clearPendingAuthSession();
  };

  const resetPendingAuth = () => {
    setPendingEmail(null);
    setPendingChallengeId(null);
    setCode("");
    clearPendingAuthSession();
  };

  useEffect(() => {
    if (!canUseOptionalStorage) {
      clearPendingAuthSession();
      return;
    }

    const { status, session } = loadPendingAuthSession();

    if (status === "valid" && session) {
      const normalizedEmail = session.email.trim().toLowerCase();

      setPendingEmail(normalizedEmail);
      setPendingChallengeId(session.challengeId);
      setCode("");
      setCurrentStep("auth");
      setActiveTab(session.intent);
      signInForm.setValue("email", normalizedEmail, { shouldDirty: false, shouldTouch: false });
      signUpForm.setValue("email", normalizedEmail, { shouldDirty: false, shouldTouch: false });
      setAuthNotice(null);
      return;
    }

    if ((status === "expired" || status === "invalid") && session?.email) {
      signInForm.setValue("email", session.email, { shouldDirty: false, shouldTouch: false });
      signUpForm.setValue("email", session.email, { shouldDirty: false, shouldTouch: false });
    }

    if (status === "expired") {
      setPendingEmail(null);
      setPendingChallengeId(null);
      setCode("");
      clearPendingAuthSession();
      setCurrentStep("auth");
      setActiveTab(authEntryIntent);
      setAuthNotice({
        tone: "error",
        title: "Código expirado",
        description: "Solicite um novo código para continuar.",
      });
      return;
    }

    if (status === "invalid") {
      clearPendingAuthSession();
    }
  }, [authEntryIntent, canUseOptionalStorage, signInForm, signUpForm]);

  const handleContinueAsGuest = () => {
    navigate("/buscar");
  };

  const handleWantToAuth = () => {
    setActiveTab(authEntryIntent);
    setCurrentStep("auth");
  };

  const handleBackToWelcome = () => {
    setAuthNotice(null);
    resetPendingAuth();
    setSignInCaptchaToken(null);
    setSignUpCaptchaToken(null);
    setResendCaptchaToken(null);
    setSignInCaptchaResetKey((current) => current + 1);
    setSignUpCaptchaResetKey((current) => current + 1);
    setResendCaptchaResetKey((current) => current + 1);
    setActiveTab(authEntryIntent);
    setCurrentStep("welcome");
  };

  const buildAuthNoticeFromError = (error: unknown): AuthNotice => {
    const apiError = error as ApiError;
    const message = apiError?.message || apiError?.error || String(error);
    const waitSeconds = apiError?.retryAfterSeconds ?? null;

    if (apiError?.error === "email_delivery_failed" || message.includes("email_delivery_failed")) {
      return {
        tone: "error",
        title: "Não conseguimos enviar o código",
        description: "O envio por e-mail falhou no servidor. Corrija o SMTP e tente novamente.",
      };
    }

    if (apiError?.error === "captcha_required") {
      return {
        tone: "error",
        title: "Conclua a validação anti-bot",
        description: "Precisamos validar a proteção anti-bot antes de enviar um novo código.",
      };
    }

    if (apiError?.error === "captcha_verification_failed") {
      return {
        tone: "error",
        title: "Validação anti-bot recusada",
        description: "Não foi possível confirmar a proteção anti-bot. Atualize a validação e tente novamente.",
      };
    }

    if (apiError?.error === "rate_limited") {
      return {
        tone: "error",
        title: "Muitas tentativas em sequência",
        description: waitSeconds
          ? `Aguarde cerca de ${waitSeconds} segundo(s) antes de tentar novamente.`
          : "Aguarde um pouco antes de tentar novamente.",
      };
    }

    if (apiError?.error === "invalid_or_expired_code" || message.includes("invalid_or_expired_code")) {
      return {
        tone: "error",
        title: "Código inválido ou expirado",
        description: "Peça um novo código e tente novamente com os 6 dígitos mais recentes.",
      };
    }

    if (apiError?.error === "invalid_origin") {
      return {
        tone: "error",
        title: "Origem da requisição não permitida",
        description: "Abra o fluxo pela URL oficial da aplicação e tente novamente.",
      };
    }

    return {
      tone: "error",
      title: "Não foi possível concluir agora",
      description: message || "Tente novamente em instantes.",
    };
  };

  const onSignUp = async (data: SignUpFormData) => {
    if (!signUpCaptchaToken) {
      const notice = buildAuthNoticeFromError({ error: "captcha_required" });
      setAuthNotice(notice);
      toast.error(notice.title);
      return;
    }

    try {
      setLoading(true);
      setAuthNotice(null);

      const response = await api.auth.signUp({
        name: data.name,
        email: data.email,
        role: data.role,
        acceptedLegalPolicies: data.acceptedLegalPolicies,
        captchaToken: signUpCaptchaToken,
      });

      persistPendingAuth({
        challengeId: response.challengeId,
        email: data.email,
        intent: "signup",
      });
      setResendCaptchaToken(null);
      setResendCaptchaResetKey((current) => current + 1);
      setAuthNotice({
        tone: "success",
        title: "Código solicitado",
        description: `Se o e-mail puder receber um código, ele chegará em instantes para ${data.email}.`,
      });
      toast.success("Se o e-mail puder receber um código, ele chegará em instantes.");
    } catch (error) {
      const notice = buildAuthNoticeFromError(error);
      setAuthNotice(notice);
      toast.error(notice.title);
    } finally {
      setSignUpCaptchaToken(null);
      setSignUpCaptchaResetKey((current) => current + 1);
      setLoading(false);
    }
  };

  const onSignIn = async (data: SignInFormData) => {
    if (!signInCaptchaToken) {
      const notice = buildAuthNoticeFromError({ error: "captcha_required" });
      setAuthNotice(notice);
      toast.error(notice.title);
      return;
    }

    try {
      setLoading(true);
      setAuthNotice(null);

      const response = await api.auth.requestCode({
        email: data.email,
        captchaToken: signInCaptchaToken,
      });

      persistPendingAuth({
        challengeId: response.challengeId,
        email: data.email,
        intent: "signin",
      });
      setResendCaptchaToken(null);
      setResendCaptchaResetKey((current) => current + 1);
      setAuthNotice({
        tone: "success",
        title: "Código solicitado",
        description: `Se o e-mail puder receber um código, ele chegará em instantes para ${data.email}.`,
      });
      toast.success("Se o e-mail puder receber um código, ele chegará em instantes.");
    } catch (error) {
      const notice = buildAuthNoticeFromError(error);
      setAuthNotice(notice);
      toast.error(notice.title);
    } finally {
      setSignInCaptchaToken(null);
      setSignInCaptchaResetKey((current) => current + 1);
      setLoading(false);
    }
  };

  const onVerifyCode = async () => {
    if (!pendingChallengeId) {
      toast.error("Solicite um novo código antes de continuar.");
      return;
    }

    try {
      setLoading(true);
      const verification = await api.auth.verify({ challengeId: pendingChallengeId, code });
      setAuthNotice({
        tone: "success",
        title: "Código validado",
        description: "Autenticação concluída. Estamos abrindo seu painel.",
      });
      toast.success("Autenticado com sucesso!");
      resetPendingAuth();

      await refreshUser();
      navigate(resolvePostAuthPath(verification.user, safeNextPath));
    } catch (err: unknown) {
      const notice = buildAuthNoticeFromError(err);
      setAuthNotice(notice);
      toast.error(notice.title);
    } finally {
      setLoading(false);
    }
  };

  const onResendCode = async () => {
    if (!pendingEmail) return;

    if (!resendCaptchaToken) {
      const notice = buildAuthNoticeFromError({ error: "captcha_required" });
      setAuthNotice(notice);
      toast.error(notice.title);
      return;
    }

    try {
      setLoading(true);
      const response = await api.auth.requestCode({
        email: pendingEmail,
        captchaToken: resendCaptchaToken,
      });
      persistPendingAuth({
        challengeId: response.challengeId,
        email: pendingEmail,
        intent: activeTab,
      });
      setAuthNotice({
        tone: "info",
        title: "Código reenviado",
        description: `Se o e-mail puder receber um código, enviamos uma nova tentativa para ${pendingEmail}. Use apenas o código mais recente.`,
      });
      toast.success("Se o e-mail puder receber um código, a nova tentativa chegará em instantes.");
    } catch (err: unknown) {
      const notice = buildAuthNoticeFromError(err);
      setAuthNotice(notice);
      toast.error(notice.title);
    } finally {
      setResendCaptchaToken(null);
      setResendCaptchaResetKey((current) => current + 1);
      setLoading(false);
    }
  };

  const heroSection = (
    <section className={`surface-dark overflow-hidden ${isMobileSignupEntry ? "p-6 md:p-10" : "p-8 md:p-10"}`}>
      <p className="eyebrow surface-dark-eyebrow">OpenTalentPool</p>
      <h1 className={`surface-dark-title mt-4 ${isMobileSignupEntry ? "max-w-sm text-4xl leading-tight md:text-6xl" : "text-5xl leading-[0.96] md:text-6xl"}`}>
        {heroCopy.title}
      </h1>
      <p className={`surface-dark-copy mt-5 ${isMobileSignupEntry ? "max-w-md text-sm leading-6 md:text-base md:leading-7" : "max-w-xl text-base leading-7"}`}>
        {heroCopy.description}
      </p>

      {!isMobileSignupEntry ? (
        <div className="mt-8 grid gap-4">
          {heroFeatureCards.map((card) => {
            const Icon = card.icon;

            return (
              <div key={card.title} className="surface-dark-card">
                <div className="flex items-center gap-3">
                  <div className="surface-dark-icon">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="surface-dark-title text-2xl leading-tight">{card.title}</h2>
                    <p className="surface-dark-copy-soft mt-2 text-sm leading-6">{card.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );

  const panelSection = (
    <section className={`surface-panel ${isMobileSignupEntry ? "p-6 md:p-8" : "p-7 md:p-8"}`}>
      {currentStep === "welcome" ? (
        <WelcomeStep
          eyebrow={welcomeCopy.eyebrow}
          title={welcomeCopy.title}
          description={welcomeCopy.description}
          cards={welcomeCopy.cards}
          primaryActionLabel={welcomeCopy.primaryActionLabel}
          secondaryActionLabel={welcomeCopy.secondaryActionLabel}
          onContinue={handleWantToAuth}
          onSkip={handleContinueAsGuest}
        />
      ) : (
        <AuthFormsStep
          signUpForm={signUpForm}
          signInForm={signInForm}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSignUp={onSignUp}
          onSignIn={onSignIn}
          onVerifyCode={onVerifyCode}
          onResendCode={onResendCode}
          loading={loading}
          pendingEmail={pendingEmail}
          code={code}
          setCode={setCode}
          onBack={handleBackToWelcome}
          authNotice={authNotice}
          signInCaptchaResetKey={signInCaptchaResetKey}
          signInCaptchaReady={Boolean(signInCaptchaToken)}
          onSignInCaptchaChange={setSignInCaptchaToken}
          signUpCaptchaResetKey={signUpCaptchaResetKey}
          signUpCaptchaReady={Boolean(signUpCaptchaToken)}
          onSignUpCaptchaChange={setSignUpCaptchaToken}
            resendCaptchaResetKey={resendCaptchaResetKey}
            resendCaptchaReady={Boolean(resendCaptchaToken)}
            onResendCaptchaChange={setResendCaptchaToken}
            showOptionalStorageNotice={!canUseOptionalStorage}
          />
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pb-20 pt-10 md:pb-24 md:pt-14">
        <div className="container">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            {isMobileSignupEntry ? (
              <>
                {panelSection}
                {heroSection}
              </>
            ) : (
              <>
                {heroSection}
                {panelSection}
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Auth;
