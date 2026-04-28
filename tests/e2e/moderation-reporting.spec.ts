import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

function buildEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function getLatestVerificationCode(page: Page, email: string) {
  const response = await page.request.get(
    `http://127.0.0.1:4100/api/test/verification-code?email=${encodeURIComponent(email)}`,
  );
  const payload = await response.json();

  return {
    code: payload.code as string,
  };
}

async function acceptOptionalStorage(page: Page) {
  const acceptButton = page.getByRole("button", { name: /aceitar armazenamento opcional/i });

  if (await acceptButton.isVisible()) {
    await acceptButton.click();
  }
}

async function resetTestState(page: Page) {
  await page.request.post("http://127.0.0.1:4100/api/test/auth/reset");
  await page.request.post("http://127.0.0.1:4100/api/test/emails/reset");
}

async function signUpAndVerify(
  page: Page,
  {
    role,
    name,
    email,
  }: {
    role: "profissional" | "recrutador";
    name: string;
    email: string;
  },
) {
  await page.goto(`/cadastro?tipo=${role}`);
  await acceptOptionalStorage(page);
  await page.getByRole("tab", { name: /cadastrar/i }).click();
  await page.getByLabel(/nome completo/i).fill(name);
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByRole("checkbox", { name: /aceito os termos de uso e a política de privacidade/i }).click();
  await page.getByRole("button", { name: /criar conta e enviar código/i }).click();
  await expect(page.getByPlaceholder("000000")).toBeVisible();

  const { code } = await getLatestVerificationCode(page, email);

  await page.getByPlaceholder("000000").fill(code);
  await page.getByRole("button", { name: /verificar código/i }).click();
  await page.waitForURL("**/dashboard");
}

async function signInWithCode(page: Page, email: string, { navigate = true }: { navigate?: boolean } = {}) {
  if (navigate) {
    await page.goto("/entrar?next=%2Fdashboard");
  }

  await page.evaluate(() => window.localStorage.removeItem("otp_pending_auth_session"));
  await page.reload();
  await acceptOptionalStorage(page);
  const signInTab = page.getByRole("tab", { name: /entrar/i });

  if (await signInTab.isVisible()) {
    await signInTab.click();
  }

  await page.getByLabel(/^email$/i).fill(email);
  const requestCodeButton = page.getByRole("button", { name: /^enviar código$/i });
  await expect(requestCodeButton).toBeEnabled();
  await requestCodeButton.click();
  await expect(page.getByPlaceholder("000000")).toBeVisible();

  const { code } = await getLatestVerificationCode(page, email);

  await page.getByPlaceholder("000000").fill(code);
  await page.getByRole("button", { name: /verificar código/i }).click();
  await page.waitForURL("**/dashboard");
}

async function selectWorkModels(page: Page, labels: string[]) {
  await page.getByRole("button", { name: /modelo de trabalho/i }).click();

  for (const label of labels) {
    await page.getByRole("checkbox", { name: new RegExp(label, "i") }).click();
  }

  await page.keyboard.press("Escape");
}

async function publishProfessionalProfile(page: Page) {
  await page.getByLabel(/cidade/i).fill("São Paulo");
  await page.getByLabel(/resumo profissional/i).fill("Especialista em frontend, acessibilidade e produto.");
  await page.getByLabel(/headline profissional/i).fill("Frontend Engineer | React e TypeScript");

  await page.locator("#state").click();
  await page.getByRole("option", { name: /são paulo/i }).click();
  await page.locator("#seniority").click();
  await page.getByRole("option", { name: /pleno|sênior/i }).first().click();
  await selectWorkModels(page, ["Remoto"]);
  await page.getByPlaceholder(/react, node\.js, platform engineering/i).fill("React");
  await page.getByRole("button", { name: /adicionar skill/i }).click();
  await page.getByRole("switch", { name: /exibir e-mail para recrutadores/i }).click();
  await page.getByRole("switch", { name: /tornar perfil público/i }).click();
  await page.getByRole("button", { name: /salvar alterações/i }).click();

  await expect(page.getByRole("link", { name: /ver perfil público/i })).toBeVisible();
}

test("registra acesso ao contato, permite denúncia do recrutador e suspende a conta pelo console admin", async ({
  browser,
  page,
}) => {
  await resetTestState(page);

  const professionalEmail = buildEmail("moderation-professional");
  const recruiterEmail = buildEmail("moderation-recruiter");
  const adminEmail = "internal-admin@opentalentpool.local";

  const professionalContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const professionalPage = await professionalContext.newPage();

  await signUpAndVerify(professionalPage, {
    role: "profissional",
    name: "Ada Lovelace",
    email: professionalEmail,
  });
  await publishProfessionalProfile(professionalPage);

  const publicProfilePath = await professionalPage
    .getByRole("link", { name: /ver perfil público/i })
    .getAttribute("href");

  expect(publicProfilePath).toBeTruthy();

  const recruiterContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const recruiterPage = await recruiterContext.newPage();

  await signUpAndVerify(recruiterPage, {
    role: "recrutador",
    name: "Rachel Recruiter",
    email: recruiterEmail,
  });
  await recruiterPage.goto(publicProfilePath!);
  await expect(recruiterPage.getByRole("link", { name: /enviar e-mail/i })).toBeVisible();
  await expect(recruiterPage.getByText(/@example\.com/i).first()).toBeVisible();

  await professionalPage.goto("/dashboard");
  await expect(professionalPage.getByRole("heading", { name: /acessos ao seu e-mail de contato/i })).toBeVisible();
  await expect(professionalPage.getByText(/rachel recruiter/i)).toBeVisible();
  await professionalPage.getByRole("button", { name: /denunciar recrutador/i }).click();
  await professionalPage.getByLabel(/categoria da denúncia/i).click();
  await professionalPage.getByRole("option", { name: /spam ou scraping/i }).click();
  await professionalPage.getByLabel(/relato da denúncia/i).fill("Acesso ao contato sem contexto legítimo e com risco de scraping.");
  await professionalPage.getByRole("button", { name: /enviar denúncia/i }).click();
  await expect(professionalPage.getByRole("dialog")).toHaveCount(0);

  const adminContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const adminPage = await adminContext.newPage();

  await signInWithCode(adminPage, adminEmail);
  await adminPage.goto("/dashboard");

  await expect(adminPage.getByRole("heading", { name: /fila de moderação/i })).toBeVisible();
  await expect(adminPage.getByText(/rachel recruiter/i)).toBeVisible();
  await adminPage.getByRole("button", { name: /abrir caso/i }).first().click();
  await adminPage.getByLabel(/notas da decisão/i).fill("Conta suspensa após denúncia autenticada e revisão do caso.");
  await adminPage.getByRole("button", { name: /suspender conta/i }).click();
  await expect(adminPage.getByRole("heading", { name: /contas suspensas/i })).toBeVisible();
  await expect(adminPage.getByText(/rachel recruiter/i)).toHaveCount(2);

  await recruiterPage.goto("/dashboard");
  await recruiterPage.waitForURL("**/entrar?next=%2Fdashboard");
  await expect(recruiterPage.getByRole("heading", { name: /entrar/i })).toBeVisible();

  await professionalContext.close();
  await recruiterContext.close();
  await adminContext.close();
});
