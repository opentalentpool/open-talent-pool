import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCodeEmailSender,
  createServerRuntime,
  createModerationDecisionEmailSender,
  createModerationReportReceiptEmailSender,
  createProfileFreshnessEmailSender,
  createSavedSearchAlertEmailSender,
  getRuntimeConfig,
  loadEnvironment,
} from "./runtime.js";
import { TURNSTILE_TEST_SECRET } from "./auth.js";

const ORIGINAL_ENV = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  POSTGRES_HOST: process.env.POSTGRES_HOST,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_USERNAME: process.env.REDIS_USERNAME,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  MAIL_QUEUE_PREFIX: process.env.MAIL_QUEUE_PREFIX,
  TRUST_PROXY: process.env.TRUST_PROXY,
  INTERNAL_OPERATIONS_ADMIN_EMAIL: process.env.INTERNAL_OPERATIONS_ADMIN_EMAIL,
  INTERNAL_ACCOUNT_EMAIL_DOMAIN: process.env.INTERNAL_ACCOUNT_EMAIL_DOMAIN,
  SMTP_SERVER: process.env.SMTP_SERVER,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_AUTH_REQUIRED: process.env.SMTP_AUTH_REQUIRED,
  SMTP_FROM: process.env.SMTP_FROM,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
});

describe("getRuntimeConfig", () => {
  it("usa os mesmos defaults de Postgres do ambiente local documentado", () => {
    const config = getRuntimeConfig({});

    expect(config.postgresHost).toBe("localhost");
    expect(config.postgresPort).toBe(5432);
    expect(config.postgresDb).toBe("otp");
    expect(config.postgresUser).toBe("otp");
    expect(config.postgresPassword).toBe("change_me");
    expect(config.appBaseUrl).toBe("http://localhost:8080");
    expect(config.authCodePepper).toBe("dev-only-auth-pepper");
    expect(config.turnstileSecretKey).toBe(TURNSTILE_TEST_SECRET);
    expect(config.trustProxy).toBe(false);
    expect(config.cookieSecure).toBe(false);
    expect(config.authSessionIdleMs).toBe(24 * 60 * 60 * 1000);
    expect(config.authSessionMaxMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(config.alertsDispatchIntervalSeconds).toBe(900);
    expect(config.redisHost).toBe("localhost");
    expect(config.redisPort).toBe(6379);
    expect(config.redisUsername).toBe("");
    expect(config.redisPassword).toBe("");
    expect(config.mailQueuePrefix).toBe("otp:mail");
    expect(config.internalOperationsAdminEmail).toBe("internal-admin@opentalentpool.local");
    expect(config.internalAccountEmailDomain).toBe("opentalentpool.local");
    expect(config.smtpAuthRequired).toBe(false);
    expect(config.mailWorkerConcurrency).toBe(4);
    expect(config.mailOutboxPollIntervalMs).toBe(5000);
    expect(config.mailOutboxBatchSize).toBe(25);
    expect(config.mailRetryMaxAttempts).toBe(5);
    expect(config.mailRetryBaseDelayMs).toBe(60000);
    expect(config.trustedOrigins).toEqual([]);
    expect(config.inMemoryDb).toBe(false);
    expect(config.enableTestRoutes).toBe(false);
  });

  it("aceita SMTP pessoal do Gmail com autenticação explícita no desenvolvimento", () => {
    const config = getRuntimeConfig({
      SMTP_SERVER: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_USER: "person@gmail.com",
      SMTP_PASS: "gmail-app-password",
      SMTP_SECURE: "true",
      SMTP_AUTH_REQUIRED: "true",
      SMTP_FROM: "OpenTalentPool <person@gmail.com>",
    });

    expect(config.smtpServer).toBe("smtp.gmail.com");
    expect(config.smtpPort).toBe(465);
    expect(config.smtpUser).toBe("person@gmail.com");
    expect(config.smtpPass).toBe("gmail-app-password");
    expect(config.smtpSecure).toBe(true);
    expect(config.smtpAuthRequired).toBe(true);
    expect(config.smtpFrom).toBe("OpenTalentPool <person@gmail.com>");
  });

  it("prioriza .env.local sobre .env mantendo suporte a arquivos na raiz e em server", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "otp-runtime-env-"));
    const tempServerDir = path.join(tempDir, "server");

    fs.mkdirSync(tempServerDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".env"), "APP_BASE_URL=http://root-env.example\nPOSTGRES_HOST=root-env\n");
    fs.writeFileSync(path.join(tempDir, ".env.local"), "APP_BASE_URL=http://root-local.example\n");
    fs.writeFileSync(path.join(tempServerDir, ".env"), "POSTGRES_HOST=server-env\n");
    fs.writeFileSync(path.join(tempServerDir, ".env.local"), "APP_BASE_URL=http://server-local.example\nTRUST_PROXY=true\n");

    delete process.env.APP_BASE_URL;
    delete process.env.POSTGRES_HOST;
    delete process.env.TRUST_PROXY;

    try {
      loadEnvironment({
        files: [
          path.join(tempServerDir, ".env.local"),
          path.join(tempDir, ".env.local"),
          path.join(tempServerDir, ".env"),
          path.join(tempDir, ".env"),
        ],
      });

      expect(process.env.APP_BASE_URL).toBe("http://server-local.example");
      expect(process.env.POSTGRES_HOST).toBe("server-env");
      expect(process.env.TRUST_PROXY).toBe("true");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("production runtime guardrails", () => {
  const secureProductionEnv = {
    NODE_ENV: "production",
    OTP_IN_MEMORY_DB: "true",
    POSTGRES_PASSWORD: "not-a-placeholder",
    AUTH_CODE_PEPPER: "very-secret-auth-pepper",
    TURNSTILE_SECRET_KEY: "very-secret-turnstile-key",
    REDIS_USERNAME: "otp_mail",
    REDIS_PASSWORD: "very-secret-redis-password",
    MAIL_QUEUE_PREFIX: "otp:mail",
    INTERNAL_OPERATIONS_ADMIN_EMAIL: "ops-root@example.internal",
    INTERNAL_ACCOUNT_EMAIL_DOMAIN: "example.internal",
    SMTP_SERVER: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: "person@example.com",
    SMTP_PASS: "gmail-app-password",
    SMTP_SECURE: "true",
    SMTP_AUTH_REQUIRED: "true",
    SMTP_FROM: "OpenTalentPool <person@example.com>",
  };

  it("rejeita placeholders sanitizados no ambiente de produção", async () => {
    await expect(
      createServerRuntime({
        env: {
          ...secureProductionEnv,
          POSTGRES_PASSWORD: "replace-with-postgres-password",
        },
      }),
    ).rejects.toThrow("POSTGRES_PASSWORD must be configured with a non-placeholder value in production.");
  });

  it("rejeita Turnstile de teste e identidade administrativa local em produção", async () => {
    await expect(
      createServerRuntime({
        env: {
          ...secureProductionEnv,
          TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
        },
      }),
    ).rejects.toThrow("TURNSTILE_SECRET_KEY must not use the Cloudflare test secret in production.");

    await expect(
      createServerRuntime({
        env: {
          ...secureProductionEnv,
          INTERNAL_OPERATIONS_ADMIN_EMAIL: "internal-admin@opentalentpool.local",
          INTERNAL_ACCOUNT_EMAIL_DOMAIN: "opentalentpool.local",
        },
      }),
    ).rejects.toThrow("INTERNAL_OPERATIONS_ADMIN_EMAIL and INTERNAL_ACCOUNT_EMAIL_DOMAIN must be configured in production.");
  });

  it("exige SMTP autenticado em produção por padrão", async () => {
    await expect(
      createServerRuntime({
        env: {
          ...secureProductionEnv,
          SMTP_USER: "",
          SMTP_PASS: "",
        },
      }),
    ).rejects.toThrow("SMTP_USER and SMTP_PASS must be configured with non-placeholder values in production.");
  });
});

describe("redis queue runtime config", () => {
  it("parseia REDIS_URL mantendo host, porta e credenciais explícitas", () => {
    const config = getRuntimeConfig({
      REDIS_URL: "redis://otp_mail:super-secret@redis.internal:6380",
    });

    expect(config.redisUrl).toBe("redis://otp_mail:super-secret@redis.internal:6380");
    expect(config.redisHost).toBe("redis.internal");
    expect(config.redisPort).toBe(6380);
    expect(config.redisUsername).toBe("otp_mail");
    expect(config.redisPassword).toBe("super-secret");
  });

  it("falha ao iniciar em produção sem credenciais Redis válidas", async () => {
    await expect(
      createServerRuntime({
        env: {
          NODE_ENV: "production",
          OTP_IN_MEMORY_DB: "true",
          POSTGRES_PASSWORD: "not-a-placeholder",
          AUTH_CODE_PEPPER: "very-secret-auth-pepper",
          TURNSTILE_SECRET_KEY: "very-secret-turnstile-key",
          REDIS_USERNAME: "",
          REDIS_PASSWORD: "change_me",
          MAIL_QUEUE_PREFIX: "otp:mail",
        },
      }),
    ).rejects.toThrow("REDIS_USERNAME must be configured with a dedicated ACL user in production.");

    await expect(
      createServerRuntime({
        env: {
          NODE_ENV: "production",
          OTP_IN_MEMORY_DB: "true",
          POSTGRES_PASSWORD: "not-a-placeholder",
          AUTH_CODE_PEPPER: "very-secret-auth-pepper",
          TURNSTILE_SECRET_KEY: "very-secret-turnstile-key",
          REDIS_USERNAME: "otp_mail",
          REDIS_PASSWORD: "change_me",
          MAIL_QUEUE_PREFIX: "otp:mail",
        },
      }),
    ).rejects.toThrow("REDIS_PASSWORD must be configured with a non-placeholder value in production.");
  });
});

describe("transactional email templates", () => {
  const config = {
    appBaseUrl: "https://opentalentpool.org",
  };

  it("gera um e-mail de código com shell editorial compartilhado", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendCodeEmail = createCodeEmailSender(config, emailClient);

    await sendCodeEmail("gael@example.com", "491534", "verification", {
      challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
      appBaseUrl: "http://192.168.0.5:8080",
    });

    expect(emailClient.sendMail).toHaveBeenCalledTimes(1);

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload).toMatchObject({
      to: "gael@example.com",
      subject: "Código de verificação - OpenTalentPool",
      metadata: {
        kind: "auth-code",
        purpose: "verification",
        code: "491534",
        challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
      },
    });
    expect(payload.text).toContain("Use este código de 6 dígitos para confirmar seu e-mail");
    expect(payload.text).toContain("491534");
    expect(payload.text).toContain("Este código expira em 15 minutos.");
    expect(payload.text).toContain("http://192.168.0.5:8080/cadastro");
    expect(payload.html).toContain("OpenTalentPool");
    expect(payload.html).toContain("Seu código de verificação chegou");
    expect(payload.html).toContain("491534");
    expect(payload.html).toContain("Expira em 15 minutos");
    expect(payload.html).toContain("Abrir OpenTalentPool");
    expect(payload.html).toContain('href="http://192.168.0.5:8080/cadastro"');
    expect(payload.html).toContain("display:none");
    expect(payload.html).toContain('role="presentation"');
  });

  it("gera o CTA de login apontando para /entrar na base configurada", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendCodeEmail = createCodeEmailSender(config, emailClient);

    await sendCodeEmail("gael@example.com", "491534", "login", {
      challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
    });

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload.text).toContain("https://opentalentpool.org/entrar");
    expect(payload.html).toContain('href="https://opentalentpool.org/entrar"');
  });

  it("gera um e-mail específico para autorizar a troca do e-mail de contato do perfil", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendCodeEmail = createCodeEmailSender(config, emailClient);

    await sendCodeEmail("gael@example.com", "491534", "profile_contact_email", {
      challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
    });

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload).toMatchObject({
      to: "gael@example.com",
      subject: "Autorize a troca do e-mail de contato - OpenTalentPool",
      metadata: {
        kind: "auth-code",
        purpose: "profile_contact_email",
        code: "491534",
        challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
      },
    });
    expect(payload.text).toContain("autorizar a alteração do e-mail de contato");
    expect(payload.text).toContain("https://opentalentpool.org/dashboard");
    expect(payload.html).toContain("Autorize a troca do e-mail de contato");
    expect(payload.html).toContain('href="https://opentalentpool.org/dashboard"');
  });

  it("gera um e-mail de recebimento da denúncia com protocolo e CTA para o dashboard", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendModerationReportReceiptEmail = createModerationReportReceiptEmailSender(config, emailClient);

    await sendModerationReportReceiptEmail({
      to: "grace@example.com",
      reporterName: "Grace Reporter",
      reportId: 42,
      targetKind: "professional_public_profile",
      category: "discrimination",
    });

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload).toMatchObject({
      to: "grace@example.com",
      subject: "Recebemos sua denúncia - OpenTalentPool",
      metadata: {
        kind: "moderation-report-receipt",
        reportId: 42,
        targetKind: "professional_public_profile",
        category: "discrimination",
      },
    });
    expect(payload.text).toContain("Protocolo interno: #42");
    expect(payload.text).toContain("https://opentalentpool.org/dashboard");
    expect(payload.html).toContain("Denúncia recebida");
    expect(payload.html).toContain("Protocolo interno");
    expect(payload.html).toContain('href="https://opentalentpool.org/dashboard"');
  });

  it("gera um e-mail de banimento definitivo imediato com aviso de purge operacional", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendModerationDecisionEmail = createModerationDecisionEmailSender(config, emailClient);

    await sendModerationDecisionEmail({
      to: "ada@example.com",
      targetName: "Ada Lovelace",
      targetKind: "professional_public_profile",
      category: "discrimination",
      actionType: "permanent_ban_target_account",
      strikeCount: 0,
      isImmediatePermanentBan: true,
    });

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload).toMatchObject({
      to: "ada@example.com",
      subject: "Sua conta foi banida permanentemente - OpenTalentPool",
      metadata: {
        kind: "moderation-decision",
        actionType: "permanent_ban_target_account",
        targetKind: "professional_public_profile",
        category: "discrimination",
        strikeCount: 0,
        isImmediatePermanentBan: true,
      },
    });
    expect(payload.text).toContain("Seus dados operacionais estão sendo removidos do banco de dados.");
    expect(payload.html).toContain("Banimento definitivo imediato");
    expect(payload.html).toContain("Conteúdo discriminatório grave em perfil público");
    expect(payload.html).toContain("Contato legal");
  });

  it("gera um e-mail de alerta com shell compartilhado, filtros e CTAs", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendSavedSearchAlertEmail = createSavedSearchAlertEmailSender(config, emailClient);

    await sendSavedSearchAlertEmail({
      to: "rachel@example.com",
      recruiterName: "Rachel Recruiter",
      searchName: "Kubernetes remoto",
      savedSearchId: 17,
      criteria: {
        q: "kubernetes",
        state: "SP",
        workModel: "remoto",
        openToOpportunities: true,
      },
      matches: [
        {
          name: "Ada Lovelace",
          headline: "Platform Engineer | Kubernetes e AWS",
          publicSlug: "ada-lovelace",
        },
      ],
    });

    expect(emailClient.sendMail).toHaveBeenCalledTimes(1);

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload).toMatchObject({
      to: "rachel@example.com",
      subject: 'Novos perfis para a busca salva "Kubernetes remoto"',
      metadata: {
        kind: "saved-search-alert",
        searchName: "Kubernetes remoto",
        matchCount: 1,
      },
    });
    expect(payload.text).toContain('Encontramos 1 novo perfil para a sua busca salva "Kubernetes remoto".');
    expect(payload.text).toContain("Filtros: palavras-chave: kubernetes | modelo de trabalho: remoto | estado: SP | apenas perfis abertos a oportunidades");
    expect(payload.text).toContain("Ada Lovelace");
    expect(payload.text).toContain("https://opentalentpool.org/profissionais/ada-lovelace");
    expect(payload.text).toContain("https://opentalentpool.org/buscar?savedSearch=17");
    expect(payload.html).toContain("OpenTalentPool");
    expect(payload.html).toContain("Olá, Rachel Recruiter!");
    expect(payload.html).toContain("Busca salva: Kubernetes remoto");
    expect(payload.html).toContain("Abrir esta busca");
    expect(payload.html).toContain("Gerenciar alerta");
    expect(payload.html).toContain("Ir para o painel");
    expect(payload.html).toContain("Ada Lovelace");
    expect(payload.html).toContain("Platform Engineer | Kubernetes e AWS");
    expect(payload.html).toContain('href="https://opentalentpool.org/profissionais/ada-lovelace"');
    expect(payload.html).toContain('href="https://opentalentpool.org/dashboard?savedSearch=17"');
    expect(payload.html).toContain("Último filtro registrado");
    expect(payload.html).toContain('role="presentation"');
  });

  it("escapa conteúdo dinâmico antes de interpolar no HTML", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendSavedSearchAlertEmail = createSavedSearchAlertEmailSender(config, emailClient);

    await sendSavedSearchAlertEmail({
      to: "rachel@example.com",
      recruiterName: 'Rachel <script>alert("x")</script>',
      searchName: 'Front <script>alert("x")</script>',
      criteria: {
        q: '<img src=x onerror="alert(1)">',
      },
      matches: [
        {
          name: 'Ada <img src=x onerror="alert(1)">',
          headline: 'Platform <script>alert("x")</script>',
          publicSlug: "ada-lovelace",
        },
      ],
    });

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload.html).toContain("Rachel &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(payload.html).toContain("Front &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(payload.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(payload.html).not.toContain("<script>alert(");
    expect(payload.html).not.toContain('<img src=x onerror="alert(1)">');
  });

  it("gera um alerta afirmativo sem vazar critérios sensíveis na URL ou no corpo do e-mail", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendSavedSearchAlertEmail = createSavedSearchAlertEmailSender(config, emailClient);

    await sendSavedSearchAlertEmail({
      to: "rachel@example.com",
      recruiterName: "Rachel Recruiter",
      searchName: "Busca inclusiva frontend",
      savedSearchId: 42,
      criteria: {
        q: "react",
        state: "SP",
        affirmativeContext: {
          useCase: "vaga_afirmativa",
          vacancyReference: "REQ-123 - Frontend afirmativa",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: ["black_people"],
          pcdOnly: false,
        },
      },
      matches: [
        {
          name: "Ada Lovelace",
          headline: "Frontend Engineer",
          publicSlug: "ada-lovelace",
        },
      ],
    });

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload.text).toContain("Filtros: busca com priorização inclusiva e critérios afirmativos ativos");
    expect(payload.text).toContain("https://opentalentpool.org/buscar?savedSearch=42");
    expect(payload.text).not.toContain("black_people");
    expect(payload.text).not.toContain("REQ-123");
    expect(payload.html).toContain("busca com priorização inclusiva e critérios afirmativos ativos");
    expect(payload.html).toContain('href="https://opentalentpool.org/buscar?savedSearch=42"');
    expect(payload.html).not.toContain("black_people");
    expect(payload.html).not.toContain("REQ-123");
  });

  it("gera um e-mail de recência do perfil com CTA para atualização e metadados operacionais", async () => {
    const emailClient = {
      sendMail: vi.fn().mockResolvedValue(undefined),
    };

    const sendProfileFreshnessEmail = createProfileFreshnessEmailSender(config, emailClient);

    await sendProfileFreshnessEmail({
      to: "ada@example.com",
      professionalName: "Ada Lovelace",
      publicSlug: "ada-lovelace",
      stageDays: 120,
      lastUpdatedAt: "2026-01-15T12:00:00.000Z",
      staleAfterAt: "2026-07-14T12:00:00.000Z",
    });

    expect(emailClient.sendMail).toHaveBeenCalledTimes(1);

    const payload = emailClient.sendMail.mock.calls[0][0];

    expect(payload).toMatchObject({
      to: "ada@example.com",
      subject: "Atualize seu perfil para manter a descoberta ativa - 120 dias",
      metadata: {
        kind: "profile-freshness",
        stageDays: 120,
        publicSlug: "ada-lovelace",
      },
    });
    expect(payload.text).toContain("Ada Lovelace");
    expect(payload.text).toContain("120 dias sem atualização");
    expect(payload.text).toContain("Última atualização registrada");
    expect(payload.text).toContain("https://opentalentpool.org/dashboard");
    expect(payload.html).toContain("Seu perfil precisa de atualização");
    expect(payload.html).toContain("120 dias sem atualização");
    expect(payload.html).toContain("Abrir dashboard");
    expect(payload.html).toContain('href="https://opentalentpool.org/profissionais/ada-lovelace"');
  });
});

describe("queue-backed runtime senders", () => {
  it("enfileira e drena inline o e-mail de auth com prioridade máxima preservando a captura de teste", async () => {
    const runtime = await createServerRuntime({
      env: {
        NODE_ENV: "test",
        OTP_IN_MEMORY_DB: "true",
        ENABLE_TEST_ROUTES: "true",
        APP_BASE_URL: "https://opentalentpool.org",
        TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
      },
    });

    try {
      const result = await runtime.sendCodeEmail("ada@example.com", "491534", "login", {
        challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
      });
      const outbox = await runtime.pool.query(
        `
          SELECT template_key, status, priority, to_email, source_type
          FROM email_outbox
          WHERE id = $1
        `,
        [result.outboxId],
      );
      const emails = runtime.testState.emails.list({ to: "ada@example.com" });

      expect(outbox.rows[0]).toMatchObject({
        template_key: "auth_code",
        status: "sent",
        priority: 1000,
        to_email: "ada@example.com",
        source_type: "auth_code_challenge",
      });
      expect(emails.at(-1)?.metadata).toMatchObject({
        kind: "auth-code",
        purpose: "login",
        code: "491534",
        challengeId: "ab12cd34ef56ab12cd34ef56ab12cd34",
      });
    } finally {
      await runtime.pool.end();
    }
  });

  it("enfileira o recibo de denúncia com prioridade de moderação e entrega inline", async () => {
    const runtime = await createServerRuntime({
      env: {
        NODE_ENV: "test",
        OTP_IN_MEMORY_DB: "true",
        ENABLE_TEST_ROUTES: "true",
        APP_BASE_URL: "https://opentalentpool.org",
        TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
      },
    });

    try {
      const result = await runtime.sendModerationReportReceiptEmail({
        to: "grace@example.com",
        reporterName: "Grace Reporter",
        reportId: 42,
        targetKind: "professional_public_profile",
        category: "other",
      });
      const outbox = await runtime.pool.query(
        `
          SELECT template_key, status, priority, to_email, source_type, source_id
          FROM email_outbox
          WHERE id = $1
        `,
        [result.outboxId],
      );
      const emails = runtime.testState.emails.list({ to: "grace@example.com" });

      expect(outbox.rows[0]).toMatchObject({
        template_key: "moderation_report_receipt",
        status: "sent",
        priority: 500,
        to_email: "grace@example.com",
        source_type: "moderation_report",
        source_id: 42,
      });
      expect(emails.at(-1)?.metadata).toMatchObject({
        kind: "moderation-report-receipt",
        reportId: 42,
        targetKind: "professional_public_profile",
        category: "other",
      });
    } finally {
      await runtime.pool.end();
    }
  });
});
