import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

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

async function resetAuthRateLimits(page: Page) {
  await page.request.post("http://127.0.0.1:4100/api/test/auth/reset");
}

async function signUpAndVerify(page: Page, email: string) {
  await resetAuthRateLimits(page);
  await page.goto("/cadastro?tipo=profissional");
  await acceptOptionalStorage(page);
  await page.getByRole("tab", { name: /cadastrar/i }).click();
  await page.getByLabel(/nome completo/i).fill("Ada Draft");
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByRole("checkbox", {
    name: /aceito os termos de uso e a política de privacidade/i,
  }).click();
  await page.getByRole("button", { name: /criar conta e enviar código/i }).click();
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

test("restaura alterações locais do perfil após recarregar sem save", async ({ page }) => {
  await signUpAndVerify(page, buildEmail("autosave-profile"));

  await page.getByLabel(/cidade/i).fill("Recife");
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toBeVisible();

  await page.reload();

  await expect(page.getByLabel(/cidade/i)).toHaveValue("Recife");
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toBeVisible();
});

test("restaura a seleção múltipla de modelos de trabalho após recarregar sem save", async ({ page }) => {
  await signUpAndVerify(page, buildEmail("autosave-work-models"));

  await selectWorkModels(page, ["Remoto", "Híbrido"]);
  await expect(page.getByRole("button", { name: /modelo de trabalho: remoto, híbrido/i })).toBeVisible();
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toBeVisible();

  await page.reload();

  await expect(page.getByRole("button", { name: /modelo de trabalho: remoto, híbrido/i })).toBeVisible();
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toBeVisible();
});

test("restaura experiência em preenchimento após recarregar sem adicionar", async ({ page }) => {
  await signUpAndVerify(page, buildEmail("autosave-experience"));

  await page.getByLabel(/cargo/i).fill("Tech Lead");
  await page.getByLabel(/empresa/i).fill("Open Talent Pool");
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toBeVisible();

  await page.reload();

  await expect(page.getByLabel(/cargo/i)).toHaveValue("Tech Lead");
  await expect(page.getByLabel(/empresa/i)).toHaveValue("Open Talent Pool");
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toBeVisible();
});

test("salva no backend manualmente e remove o aviso de rascunho quando não restam pendências locais", async ({
  page,
}) => {
  await signUpAndVerify(page, buildEmail("autosave-save"));

  await page.getByLabel(/cidade/i).fill("Recife");
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toBeVisible();

  await page.getByRole("button", { name: /salvar alterações/i }).click();
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toHaveCount(0);

  await page.reload();

  await expect(page.getByLabel(/cidade/i)).toHaveValue("Recife");
  await expect(page.getByText(/rascunho salvo neste navegador/i)).toHaveCount(0);
});
