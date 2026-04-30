import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

interface CapturedEmail {
  subject: string;
  html: string;
  metadata?: {
    kind?: string;
    purpose?: string;
    code?: string;
  };
}

async function getLatestVerificationCode(page: Page, email: string) {
  const response = await page.request.get(
    `http://127.0.0.1:4100/api/test/verification-code?email=${encodeURIComponent(email)}`,
  );
  const payload = await response.json();

  return {
    code: payload.code as string,
    challengeId: payload.challengeId as string,
  };
}

async function getCapturedEmails(page: Page) {
  const response = await page.request.get("http://127.0.0.1:4100/api/test/emails");
  const payload = await response.json();

  return payload.emails as CapturedEmail[];
}

async function acceptOptionalStorage(page: Page) {
  const acceptButton = page.getByRole("button", { name: /aceitar armazenamento opcional/i });

  if (await acceptButton.isVisible()) {
    await acceptButton.click();
  }
}

async function resetAuthRateLimits(page: Page) {
  await page.request.post("http://127.0.0.1:4100/api/test/auth/reset");
}

async function selectWorkModels(page: Page, labels: string[]) {
  await page.getByRole("button", { name: /modelo de trabalho/i }).click();

  for (const label of labels) {
    await page.getByRole("checkbox", { name: new RegExp(label, "i") }).click();
  }

  await page.keyboard.press("Escape");
}

async function signUpAndVerify(page: Page, { role, name, email }: { role: "profissional" | "recrutador"; name: string; email: string }) {
  await resetAuthRateLimits(page);
  await page.goto(`/cadastro?tipo=${role}`);
  await acceptOptionalStorage(page);
  await page.getByRole("tab", { name: /cadastrar/i }).click();
  await page.getByLabel(/nome completo/i).fill(name);
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByRole("checkbox", { name: /aceito os termos de uso e a política de privacidade/i }).click();
  await page.getByRole("button", { name: /criar conta e enviar código/i }).click();
  await expect(page.getByPlaceholder("000000")).toBeVisible();

  const emails = await getCapturedEmails(page);
  const authEmail = emails.at(-1);

  expect(authEmail?.metadata?.kind).toBe("auth-code");
  expect(authEmail?.html).toContain("Abrir OpenTalentPool");
  expect(authEmail?.html).toContain("Expira em 15 minutos");
  expect(authEmail?.html).toContain("OpenTalentPool");
  expect(authEmail?.html).toContain('role="presentation"');

  const { code } = await getLatestVerificationCode(page, email);

  await page.getByPlaceholder("000000").fill(code);
  await page.getByRole("button", { name: /verificar código/i }).click();
  await page.waitForURL("**/dashboard");
}

async function publishProfessionalProfile(
  page: Page,
  {
    headline,
    bio,
    skill,
    workModels = ["Remoto"],
    affirmativeGroups = [],
  }: {
    headline: string;
    bio: string;
    skill: string;
    workModels?: string[];
    affirmativeGroups?: string[];
  },
) {
  await page.getByLabel(/cidade/i).fill("São Paulo");
  await page.getByLabel(/resumo profissional/i).fill(bio);
  await page.getByLabel(/headline profissional/i).fill(headline);

  await page.locator("#state").click();
  await page.getByRole("option", { name: /são paulo/i }).click();
  await page.locator("#seniority").click();
  await page.getByRole("option", { name: /pleno|sênior/i }).first().click();
  await selectWorkModels(page, workModels);

  for (const group of affirmativeGroups) {
    await page.getByRole("checkbox", { name: new RegExp(group, "i") }).click();
  }

  if (affirmativeGroups.length > 0) {
    await page.getByRole("checkbox", { name: /autorizo o uso desses dados em vagas afirmativas ou inclusivas/i }).click();
  }

  await page.getByPlaceholder(/react, node\.js, platform engineering/i).fill(skill);
  await page.getByRole("button", { name: /adicionar skill/i }).click();
  await page.getByRole("switch", { name: /tornar perfil público/i }).click();
  await page.getByRole("button", { name: /salvar alterações/i }).click();

  await expect(page.getByRole("link", { name: /ver perfil público/i })).toBeVisible();
}

test("a home apresenta a busca pública funcional", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /descoberta técnica aberta, com leitura clara desde a primeira busca/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /abrir busca pública/i }).first()).toBeVisible();
  await expect(page.getByText(/o que entra na busca são informações profissionais/i).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await expect(page.getByRole("button", { name: /abrir menu/i })).toBeVisible();
  await page.getByRole("button", { name: /abrir menu/i }).click();
  await expect(page.getByRole("link", { name: /buscar talentos/i })).toBeVisible();
});

test("o banner de cookies permite rejeitar, reabrir e voltar a aceitar o armazenamento opcional", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /preferências de cookies/i })).toBeVisible();
  await page.getByRole("button", { name: /continuar só com o essencial/i }).click();
  await expect(page.getByRole("button", { name: /abrir opções de tema/i })).toBeDisabled();

  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: /preferências de cookies/i }).click();
  await page.getByRole("button", { name: /aceitar armazenamento opcional/i }).click();

  await page.getByRole("button", { name: /abrir opções de tema/i }).click();
  await page.getByRole("menuitemradio", { name: /escuro/i }).click();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("a busca pública não expõe o modo inclusivo para visitantes", async ({ page }) => {
  await page.goto("/buscar");

  await expect(page.getByRole("heading", { name: /buscar talentos publicados/i })).toBeVisible();
  await expect(page.getByText(/^busca inclusiva$/i)).toHaveCount(0);
});

test("a busca inclusiva prioriza o escopo afirmativo sem excluir os demais perfis técnicos", async ({ page, browser }) => {
  await signUpAndVerify(page, {
    role: "recrutador",
    name: "Rachel Recruiter",
    email: "rachel-priorizacao@example.com",
  });

  const affirmativeContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const affirmativePage = await affirmativeContext.newPage();

  await signUpAndVerify(affirmativePage, {
    role: "profissional",
    name: "Ada Lovelace",
    email: "ada-priorizacao@example.com",
  });
  await publishProfessionalProfile(affirmativePage, {
    headline: "Frontend Engineer | React e TypeScript",
    bio: "Especialista em design systems, acessibilidade e produto.",
    skill: "React",
    affirmativeGroups: ["Mulheres", "Pessoas negras"],
  });

  const fallbackContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const fallbackPage = await fallbackContext.newPage();

  await signUpAndVerify(fallbackPage, {
    role: "profissional",
    name: "Grace Hopper",
    email: "grace-priorizacao@example.com",
  });
  await publishProfessionalProfile(fallbackPage, {
    headline: "Frontend Engineer | React e Design Systems",
    bio: "Atua com interfaces, componentização e colaboração próxima com produto.",
    skill: "React",
  });

  await page.goto("/buscar?q=react&state=SP&workModel=remoto");
  await expect(page.getByRole("heading", { name: /ada lovelace/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /grace hopper/i }).first()).toBeVisible();

  await page.getByRole("button", { name: /vagas afirmativas e inclusivas/i }).click();
  await page.getByRole("checkbox", { name: /confirmo o uso apenas inclusivo/i }).click();
  await page.getByRole("button", { name: /liberar busca inclusiva/i }).click();

  await page.getByLabel(/referência da vaga/i).fill("REQ-PRIO-001");
  await page.getByRole("checkbox", { name: /mulheres/i }).click();
  await page.getByRole("checkbox", { name: /pessoas negras/i }).click();
  await page.getByRole("button", { name: /executar busca inclusiva/i }).click();

  await expect(page.getByText(/resultados com priorização inclusiva/i)).toBeVisible();
  await expect(
    page.getByText(/os perfis dentro do escopo afirmativo aparecem primeiro\. os demais perfis tecnicamente aderentes continuam listados em seguida\./i),
  ).toBeVisible();

  const visibleNames = await page.locator("article h3").allTextContents();
  expect(visibleNames.slice(0, 2)).toEqual(["Ada Lovelace", "Grace Hopper"]);

  await affirmativeContext.close();
  await fallbackContext.close();
});

test("o footer expõe as páginas legais públicas", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: /política de privacidade/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /termos de uso/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^política de cookies$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /política de uso inclusivo/i })).toBeVisible();

  await page.getByRole("link", { name: /política de privacidade/i }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole("heading", { name: /política de privacidade/i })).toBeVisible();
});

test("o tema pode ser alternado, persistido e seguir o sistema quando solicitado", async ({ page }) => {
  await page.goto("/");
  await acceptOptionalStorage(page);

  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: /abrir opções de tema/i }).click();
  await page.getByRole("menuitemradio", { name: /escuro/i }).click();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: /abrir opções de tema/i }).click();
  await page.getByRole("menuitemradio", { name: /sistema/i }).click();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();

  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("profissional publica perfil, recrutador favorita, salva busca e recebe um único alerta diário", async ({
  page,
  browser,
}) => {
  await signUpAndVerify(page, {
    role: "recrutador",
    name: "Rachel Recruiter",
    email: "rachel@example.com",
  });

  await page.goto("/buscar?q=kubernetes&state=SP&workModel=remoto");
  await page.getByRole("button", { name: /^salvar busca$/i }).first().click();
  await page.getByRole("button", { name: /^salvar busca$/i }).nth(1).click();
  await expect(page.getByText(/busca salva com alerta diário\./i)).toBeVisible();

  const professionalContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const professionalPage = await professionalContext.newPage();

  await signUpAndVerify(professionalPage, {
    role: "profissional",
    name: "Ada Lovelace",
    email: "ada@example.com",
  });

  await professionalPage.getByLabel(/cidade/i).fill("São Paulo");
  await professionalPage.getByLabel(/resumo profissional/i).fill("Especialista em plataformas cloud-native.");
  await professionalPage.getByLabel(/headline profissional/i).fill("Platform Engineer | Kubernetes e AWS");

  await professionalPage.locator("#state").click();
  await professionalPage.getByRole("option", { name: /são paulo/i }).click();
  await professionalPage.locator("#seniority").click();
  await professionalPage.getByRole("option", { name: /sênior/i }).click();
  await selectWorkModels(professionalPage, ["Remoto", "Híbrido"]);
  await expect(
    professionalPage.getByText(/esta seção é opcional\. ela não bloqueia cadastro, edição nem publicação do seu perfil/i),
  ).toBeVisible();
  await professionalPage.getByPlaceholder(/react, node\.js, platform engineering/i).fill("Kubernetes");
  await professionalPage.getByRole("button", { name: /adicionar skill/i }).click();
  await professionalPage.getByLabel(/^cargo$/i).fill("Platform Engineer");
  await professionalPage.getByLabel(/^empresa$/i).fill("Analytical Engines");
  await professionalPage.locator("#experience-seniority").click();
  await professionalPage.getByRole("option", { name: /sênior/i }).click();
  await professionalPage.getByLabel(/^data de início$/i).fill("2022-01-01");
  await professionalPage.getByLabel(/^descrição$/i).first().fill("Plataformas Kubernetes para produtos digitais.");
  await professionalPage.getByRole("button", { name: /adicionar experiência/i }).click();
  await professionalPage.getByText(/^Formação$/i).click();
  await professionalPage.getByLabel(/^instituição$/i).first().fill("Universidade Livre");
  await professionalPage.getByLabel(/^área de estudo$/i).fill("Engenharia de Software");
  await professionalPage.getByRole("button", { name: /adicionar formação/i }).click();
  await professionalPage.getByText(/^Certificações$/i).click();
  await professionalPage.getByLabel(/^certificação$/i).fill("AWS Solutions Architect");
  await professionalPage.getByLabel(/^emissor$/i).first().fill("AWS");
  await professionalPage.getByRole("button", { name: /adicionar certificação/i }).click();
  await professionalPage.getByText(/^Idiomas$/i).click();
  await professionalPage.getByLabel(/^idioma$/i).fill("Inglês");
  await professionalPage.getByLabel(/^proficiência$/i).fill("Avançado");
  await professionalPage.getByRole("button", { name: /adicionar idioma/i }).click();
  await professionalPage.getByRole("switch", { name: /tornar perfil público/i }).click();
  await professionalPage.getByRole("button", { name: /salvar alterações/i }).click();

  await expect(professionalPage.getByRole("link", { name: /ver perfil público/i })).toBeVisible();

  const anonymousContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const anonymousPage = await anonymousContext.newPage();
  await anonymousPage.goto("/buscar?q=kubernetes&state=SP&workModel=remoto");
  await expect(anonymousPage.getByText(/ada lovelace/i)).toBeVisible();
  await expect(anonymousPage.getByText(/remoto, híbrido/i)).toBeVisible();
  await anonymousPage.getByRole("link", { name: /ver perfil público/i }).click();
  await expect(anonymousPage.getByRole("heading", { name: /ada lovelace/i })).toBeVisible();
  await expect(anonymousPage.getByText(/platform engineer/i).first()).toBeVisible();
  await expect(anonymousPage.getByText(/universidade livre/i)).toBeVisible();
  await expect(anonymousPage.getByText(/aws solutions architect/i)).toBeVisible();
  await expect(anonymousPage.getByText(/inglês/i)).toBeVisible();
  await expect(anonymousPage.getByText("ada@example.com")).toHaveCount(0);
  await expect(anonymousPage.getByText("(11) 99999-9999")).toHaveCount(0);

  await anonymousPage.goto("/buscar?language=Ingl%C3%AAs&certification=AWS&education=Software");
  await expect(anonymousPage.getByText(/ada lovelace/i)).toBeVisible();

  await page.goto("/buscar?q=kubernetes&state=SP&workModel=remoto");
  await expect(page.getByText(/ada lovelace/i)).toBeVisible();
  await page.getByRole("button", { name: /favoritar perfil/i }).click();
  await expect(page.getByRole("button", { name: /remover favorito/i })).toBeVisible();

  await page.request.post("http://127.0.0.1:4100/api/test/emails/reset");

  const firstDispatch = await page.request.post("http://127.0.0.1:4100/api/test/alerts/dispatch");
  const secondDispatch = await page.request.post("http://127.0.0.1:4100/api/test/alerts/dispatch");
  const emailsResponse = await page.request.get("http://127.0.0.1:4100/api/test/emails");

  expect(firstDispatch.ok()).toBeTruthy();
  expect(secondDispatch.ok()).toBeTruthy();

  const firstDispatchPayload = await firstDispatch.json();
  const secondDispatchPayload = await secondDispatch.json();
  const emailsPayload = await emailsResponse.json();

  expect(firstDispatchPayload.savedSearches.sent).toBe(1);
  expect(firstDispatchPayload.profileFreshness.remindersSent).toBe(0);
  expect(firstDispatchPayload.profileFreshness.expiredProfiles).toBe(0);
  expect(secondDispatchPayload.savedSearches.sent).toBe(0);
  expect(emailsPayload.emails).toHaveLength(1);
  expect(emailsPayload.emails[0].subject).toContain('Novos perfis para a busca salva "Busca: kubernetes');
  expect(emailsPayload.emails[0].metadata.kind).toBe("saved-search-alert");
  expect(emailsPayload.emails[0].html).toContain("Abrir esta busca");
  expect(emailsPayload.emails[0].html).toContain("Ir para o painel");
  expect(emailsPayload.emails[0].html).toContain("OpenTalentPool");
  expect(emailsPayload.emails[0].html).toContain("Ada Lovelace");
  expect(emailsPayload.emails[0].html).toContain('role="presentation"');

  await professionalContext.close();
  await anonymousContext.close();
});

test("profissional libera o e-mail da conta para recrutadores e pode trocar para um e-mail alternativo com confirmação por código", async ({
  page,
  browser,
}) => {
  await signUpAndVerify(page, {
    role: "recrutador",
    name: "Rachel Recruiter",
    email: "rachel-contact@example.com",
  });

  const professionalContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const professionalPage = await professionalContext.newPage();

  await signUpAndVerify(professionalPage, {
    role: "profissional",
    name: "Ada Contact",
    email: "ada-contact@example.com",
  });

  await publishProfessionalProfile(professionalPage, {
    headline: "Frontend Engineer | React e TypeScript",
    bio: "Especialista em interfaces e produto digital.",
    skill: "React",
    workModels: ["Remoto"],
  });

  await professionalPage.getByRole("switch", { name: /exibir e-mail para recrutadores/i }).click();
  await professionalPage.getByRole("button", { name: /salvar alterações/i }).click();

  const publicProfilePath = await professionalPage
    .getByRole("link", { name: /ver perfil público/i })
    .getAttribute("href");

  expect(publicProfilePath).toBeTruthy();

  const anonymousContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const anonymousPage = await anonymousContext.newPage();
  await anonymousPage.goto(publicProfilePath || "/");
  await expect(anonymousPage.getByRole("heading", { name: /ada contact/i })).toBeVisible();
  await expect(anonymousPage.getByRole("link", { name: /enviar e-mail/i })).toHaveCount(0);
  await expect(anonymousPage.getByText("ada-contact@example.com")).toHaveCount(0);

  await page.goto(publicProfilePath || "/");
  await expect(page.getByRole("link", { name: /enviar e-mail/i })).toHaveAttribute(
    "href",
    "mailto:ada-contact@example.com",
  );
  await expect(page.getByText("ada-contact@example.com")).toBeVisible();

  const contactEmailInput = professionalPage.getByLabel(/e-mail de contato/i);
  await contactEmailInput.clear();
  await contactEmailInput.fill("jobs@ada.dev");
  await professionalPage.getByRole("button", { name: /enviar código para confirmar/i }).click();

  await expect(professionalPage.getByPlaceholder("000000")).toBeVisible();

  await expect.poll(async () => {
    const emails = await getCapturedEmails(professionalPage);
    const authEmail = [...emails]
      .reverse()
      .find((email) => email.metadata?.kind === "auth-code" && email.metadata?.purpose === "profile_contact_email");

    return authEmail?.metadata?.code || "";
  }).toMatch(/^\d{6}$/);

  const contactEmails = await getCapturedEmails(professionalPage);
  const contactCode = [...contactEmails]
    .reverse()
    .find((email) => email.metadata?.kind === "auth-code" && email.metadata?.purpose === "profile_contact_email")
    ?.metadata?.code;

  expect(contactCode).toMatch(/^\d{6}$/);

  await professionalPage.getByPlaceholder("000000").fill(String(contactCode));
  await professionalPage.getByRole("button", { name: /confirmar código/i }).click();
  await professionalPage.getByRole("button", { name: /salvar alterações/i }).click();

  await page.reload();
  await expect(page.getByRole("link", { name: /enviar e-mail/i })).toHaveAttribute("href", "mailto:jobs@ada.dev");
  await expect(page.getByText("jobs@ada.dev")).toBeVisible();

  await professionalContext.close();
  await anonymousContext.close();
});

test("profissional pode habilitar o contexto de recrutador e trocar sem novo login", async ({ page }) => {
  await signUpAndVerify(page, {
    role: "profissional",
    name: "Ada Lead",
    email: "ada-lead@example.com",
  });

  await expect(page.getByRole("heading", { name: /informações pessoais/i })).toBeVisible();

  await page.getByRole("button", { name: /^profissional$/i }).click();
  await page.getByRole("menuitem", { name: /recrutador/i }).click();

  await expect(page.getByRole("heading", { name: /criar (perfil|contexto)( de)? recrutador/i })).toBeVisible();
  await page.getByRole("button", { name: /criar e trocar/i }).click();

  await expect(page.getByRole("heading", { name: /acompanhe sua curadoria sem perder o fio da busca/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^recrutador$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /meu painel/i })).toBeVisible();
});
