import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

function buildInternalEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@opentalentpool.local`;
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

async function signInWithCode(page: Page, email: string) {
  await page.goto("/entrar?next=%2Fdashboard");
  await page.evaluate(() => window.localStorage.removeItem("otp_pending_auth_session"));
  await page.reload();
  await acceptOptionalStorage(page);
  await page.getByRole("tab", { name: /entrar/i }).click();
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

test("permite promover e revogar um administrador interno pelo backoffice", async ({ browser, page }) => {
  await resetTestState(page);

  const candidateEmail = buildInternalEmail("admin-candidate");
  const candidateName = "Teammate Internal";
  const reservedAdminEmail = "internal-admin@opentalentpool.local";

  const candidateContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const candidatePage = await candidateContext.newPage();

  await signUpAndVerify(candidatePage, {
    role: "profissional",
    name: candidateName,
    email: candidateEmail,
  });

  const reservedAdminContext = await browser.newContext({ baseURL: "http://127.0.0.1:8180" });
  const reservedAdminPage = await reservedAdminContext.newPage();

  await signInWithCode(reservedAdminPage, reservedAdminEmail);
  await expect(reservedAdminPage.getByRole("heading", { name: /gestão de administradores internos/i })).toBeVisible();

  await reservedAdminPage.getByLabel(/buscar conta interna/i).fill(candidateEmail);
  await reservedAdminPage.getByRole("button", { name: /buscar/i }).click();
  await reservedAdminPage
    .getByLabel(/motivo da alteração administrativa/i)
    .fill("Conta interna movida para a operação administrativa.");
  await reservedAdminPage.getByRole("button", { name: /promover teammate internal/i }).click();

  await candidatePage.goto("/dashboard");
  await candidatePage.waitForURL("**/entrar?next=%2Fdashboard");
  await expect(candidatePage.getByRole("heading", { name: /entrar/i })).toBeVisible();

  await signInWithCode(candidatePage, candidateEmail);
  await expect(candidatePage.getByRole("heading", { name: /fila de moderação/i })).toBeVisible();
  await expect(candidatePage.getByRole("heading", { name: /gestão de administradores internos/i })).toBeVisible();

  await reservedAdminPage.getByLabel(/motivo da alteração administrativa/i).fill("Privilégios administrativos encerrados.");
  await reservedAdminPage.getByRole("button", { name: /revogar teammate internal/i }).click();

  await candidatePage.goto("/dashboard");
  await candidatePage.waitForURL("**/entrar?next=%2Fdashboard");
  await expect(candidatePage.getByRole("heading", { name: /entrar/i })).toBeVisible();

  await signInWithCode(candidatePage, candidateEmail);
  await expect(candidatePage.getByText(/painel do profissional/i)).toBeVisible();
  await expect(candidatePage.getByRole("heading", { name: /gestão de administradores internos/i })).toHaveCount(0);

  await candidateContext.close();
  await reservedAdminContext.close();
});
