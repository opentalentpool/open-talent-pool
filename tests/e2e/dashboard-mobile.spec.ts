import { expect, test, devices, type Page } from "@playwright/test";

test.setTimeout(60_000);
test.use({
  ...devices["iPhone 13"],
  browserName: "webkit",
});

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
  await page.getByLabel(/nome completo/i).fill("Ada Mobile");
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByRole("checkbox", { name: /aceito os termos de uso e a política de privacidade/i }).click();
  await page.getByRole("button", { name: /criar conta e enviar código/i }).click();
  await expect(page.getByPlaceholder("000000")).toBeVisible();

  const { code } = await getLatestVerificationCode(page, email);

  await page.getByPlaceholder("000000").fill(code);
  await page.getByRole("button", { name: /verificar código/i }).click();
  await page.waitForURL("**/dashboard");
}

test("mantém os campos de data da experiência dentro do card no mobile", async ({ page }) => {
  await signUpAndVerify(page, "ada-mobile-dates@example.com");

  const startDate = page.locator("#start-date");
  const endDate = page.locator("#end-date");

  await startDate.scrollIntoViewIfNeeded();
  await expect(startDate).toHaveAttribute("type", "text");
  await expect(startDate).toHaveAttribute("placeholder", "AAAA-MM-DD");
  await expect(endDate).toHaveAttribute("type", "text");
  await expect(endDate).toHaveAttribute("placeholder", "AAAA-MM-DD");

  await startDate.fill("20260426");
  await endDate.fill("20260430");
  await expect(startDate).toHaveValue("2026-04-26");
  await expect(endDate).toHaveValue("2026-04-30");

  const metrics = await startDate.evaluate((input) => {
    const inputRect = input.getBoundingClientRect();
    const wrapperRect = input.parentElement?.getBoundingClientRect();
    const sectionRect = input.closest("section")?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const pageScrollWidth = document.documentElement.scrollWidth;

    return {
      inputLeft: inputRect.left,
      inputRight: inputRect.right,
      wrapperLeft: wrapperRect?.left ?? null,
      wrapperRight: wrapperRect?.right ?? null,
      sectionRight: sectionRect?.right ?? null,
      viewportWidth,
      pageScrollWidth,
    };
  });

  await page.screenshot({
    path: "output/playwright/dashboard-mobile-date-fields.png",
    fullPage: true,
  });

  expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.wrapperLeft).not.toBeNull();
  expect(metrics.wrapperRight).not.toBeNull();
  expect(metrics.inputLeft).toBeGreaterThanOrEqual((metrics.wrapperLeft ?? 0) - 1);
  expect(metrics.inputRight).toBeLessThanOrEqual((metrics.wrapperRight ?? 0) + 1);
  expect(metrics.inputRight).toBeLessThanOrEqual((metrics.sectionRight ?? metrics.viewportWidth) - 16);
});
