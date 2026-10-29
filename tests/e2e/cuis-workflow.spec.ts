import { expect, test } from "@playwright/test";

const email = process.env.E2E_MANUFACTURER_EMAIL;
const password = process.env.E2E_MANUFACTURER_PASSWORD;

test("manufacturer catalogue through CUIS public verification", async ({ page, browser }) => {
  test.skip(!email || !password, "Set E2E_MANUFACTURER_EMAIL and E2E_MANUFACTURER_PASSWORD");

  await page.goto("/manufacturer/login");
  await page.getByLabel("Email address").fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:app|manufacturer\/dashboard)(?:\/)?$/);

  await page.goto("/app/products");
  const productLink = page.locator('a[href^="/app/products/"]').filter({ hasText: "Fanta Orange 50cl" }).first();
  await expect(productLink).toContainText("SIM-NAFDAC-FANTA-001");
  await productLink.click();
  await expect(page).toHaveURL(/\/app\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Fanta Orange 50cl", exact: true })).toBeVisible();
  await expect(page.getByText("FT01", { exact: true })).toBeVisible();
  await expect(page.getByText("SIM-NAFDAC-FANTA-001", { exact: true })).toBeVisible();
  await expect(page.getByText(/simulated — not an authoritative NAFDAC source/i)).toBeVisible();

  const batches = page.locator('a[href^="/app/batches/"]').filter({ hasText: /FANTA-261025-RUN-0[12]/ });
  await expect(batches).toHaveCount(2);
  await batches.first().click();
  await expect(page.getByText(/CUIS v1 · key 1/i)).toBeVisible();

  await page.getByRole("link", { name: "Cartons & Units", exact: true }).click();
  const firstCarton = page.locator('a[href*="?tab=units&carton="]').filter({ hasText: "VRF-FT01-B1-C001" }).first();
  await expect(firstCarton).toContainText("24 units");
  await firstCarton.click();
  await expect(page.getByRole("link", { name: /Unit 0001/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Unit 00\d\d/ })).toHaveCount(24);

  await page.getByRole("link", { name: /Unit 0024/ }).click();
  await expect(page.getByRole("heading", { name: "Unit 0024", exact: true })).toBeVisible();
  await expect(page.getByText(/CUIS 1 · key 1/i)).toBeVisible();
  const code = (await page.getByText(/^\d{4} \d{4} \d{4} \d{4}$/).first().innerText()).replaceAll(" ", "");
  const qrUrl = await page.getByRole("link", { name: "Test verification", exact: true }).getAttribute("href");
  expect(qrUrl).toMatch(/\/v\/Q1VJU/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Print label PDF", exact: true }).click();
  const download = await downloadPromise;
  expect((await download.path())?.length).toBeGreaterThan(0);

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(qrUrl!);
  await expect(publicPage.getByRole("heading", { name: "Code authenticated" })).toBeVisible();
  await expect(publicPage.getByText("Verification method: cryptographically authenticated QR credential.")).toBeVisible();
  await expect(publicPage.getByText(/Fanta Orange/, { exact: false }).first()).toBeVisible();
  await expect(publicPage.getByText("SIM-NAFDAC-FANTA-001", { exact: true })).toBeVisible();

  const encoded = decodeURIComponent(qrUrl!.split("/v/")[1]!);
  const tamperedBytes = Buffer.from(encoded, "base64url");
  tamperedBytes[56] ^= 1;
  await publicPage.goto(`/v/${tamperedBytes.toString("base64url")}`);
  await expect(publicPage.getByRole("heading", { name: "Code could not be authenticated" })).toBeVisible();
  await expect(publicPage.getByText(/Fanta Orange/, { exact: false })).toHaveCount(0);

  await publicPage.goto("/");
  await publicPage.getByLabel("16-digit product code").fill(code);
  await publicPage.getByRole("button", { name: "Verify product", exact: true }).click();
  await expect(publicPage.getByRole("heading", { name: "Code authenticated" })).toBeVisible();
  await expect(publicPage.getByText(/registered numeric lookup reference/i)).toBeVisible();
  await expect(publicPage.getByText(/Fanta Orange/, { exact: false }).first()).toBeVisible();
  await expect(publicPage.getByText("FANTA-261025-RUN-01", { exact: true })).toBeVisible();
  await publicContext.close();
});
