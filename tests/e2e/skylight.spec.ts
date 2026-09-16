import { expect, test } from "@playwright/test";

test("standalone skylight calculator creates a branded PDF without opening system access", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const response = await page.goto("/skylight");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("heading", { name: "Skylight cost calculator" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("main a")).toHaveCount(0);
  await expect(page.locator("main nav")).toHaveCount(0);
  await expect(page.locator('nextjs-portal [role="dialog"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate quotation" })).toBeDisabled();

  await page.getByLabel("Connector", { exact: false }).fill("2.5");
  await page.locator("#quantity-glass").fill("10");
  await page.locator("#quantity-brackets").fill("4");
  await page.locator("#quantity-screws").fill("2");
  await expect(page.getByTestId("line-connector").locator("output")).toHaveText("$86.25");
  await expect(page.getByTestId("standard-total")).toHaveText("$1,446.25");
  await expect(page.getByTestId("laminated-total")).toHaveText("$1,996.25");
  await page.locator("#quantity-screws").fill("1.5");
  await expect(page.locator("#quantity-screws")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Generate quotation" })).toBeDisabled();
  await page.locator("#quantity-screws").fill("2");
  await page.getByRole("radio", { name: "Laminated glass", exact: false }).check();
  await page.getByLabel("Customer name").fill("Skylight Test Customer");
  await page.getByLabel("Project name").fill("Baghdad Skylight");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Generate quotation" }).click();
  const quotation = page.locator("#skylight-quotation");
  await expect(quotation.getByText("$1,996.25", { exact: true })).toBeVisible();
  await expect(quotation.getByText("Glass (laminated)")).toBeVisible();
  await expect(quotation.getByText("Skylight Test Customer")).toBeVisible();
  expect(await quotation.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download quotation PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^SK-.*\.pdf$/);
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(10000);
  await page.getByRole("button", { name: "Edit calculation" }).click();
  await expect(page.locator("#quantity-glass")).toHaveValue("10");
  await page.getByRole("radio", { name: "Standard glass", exact: false }).check();
  await page.getByRole("button", { name: "Generate quotation" }).click();
  await expect(quotation.getByText("$1,446.25", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);

  const protectedPage = await context.newPage();
  await protectedPage.goto("/dashboard");
  await expect(protectedPage).toHaveURL(/\/login\?/);
});

test("all twelve materials and full customer details fit one A4 quotation", async ({ page }) => {
  await page.goto("/skylight");
  for (const input of await page.locator('input[type="number"]').all()) {
    await input.fill("10");
  }
  await expect(page.getByTestId("standard-total")).toHaveText("$3,219.00");
  await expect(page.getByTestId("laminated-total")).toHaveText("$3,769.00");
  await page.getByLabel("Customer name").fill("Customer ".repeat(11));
  await page.getByLabel("Project name").fill("Skylight project ".repeat(6));
  await page.getByLabel("Notes").fill("Quotation notes for skylight materials. ".repeat(9));
  await page.getByRole("radio", { name: "Laminated glass", exact: false }).check();
  await page.getByRole("button", { name: "Generate quotation" }).click();
  await expect(page.locator("#skylight-quotation tbody tr")).toHaveCount(12);
  // Match the fixed A4 dimensions applied by the existing PDF exporter.
  const dimensions = await page.locator(".pdf-page").evaluate((element) => {
    const page = element as HTMLElement;
    Object.assign(page.style, { width: "210mm", height: "297mm", minHeight: "297mm", maxWidth: "none" });
    return { height: page.clientHeight, content: page.scrollHeight };
  });
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.height);
});
