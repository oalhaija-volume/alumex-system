import { expect, test } from "@playwright/test";
import {
  accountFromEnvironment,
  relevantConsoleErrors,
  signIn,
} from "./helpers";

test("public login renders without framework or console errors", async ({
  page,
}) => {
  const errors = relevantConsoleErrors(page);
  await page.goto("/login");
  await expect(page).toHaveTitle(/Alumex/i);
  await expect(
    page.getByRole("heading", { name: /login|log in|تسجيل الدخول/i }),
  ).toBeVisible();
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  expect(errors).toEqual([]);
});

test("admin can open sales creation flows and every system area", async ({
  page,
}) => {
  const account = accountFromEnvironment("E2E_ADMIN");
  test.skip(!account, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD.");
  const errors = relevantConsoleErrors(page);
  await signIn(page, account!);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /manager project overview|نظرة المدير/i }),
  ).toBeVisible();

  const languageButton = page.getByRole("button", {
    name: /language|اللغة/i,
  });
  await languageButton.click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await languageButton.click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.goto("/clients");
  await expect(page).toHaveURL(/\/intake$/);
  await expect(
    page.getByRole("heading", {
      name: /start sales intake|تسجيل فرصة بيع/i,
    }),
  ).toBeVisible();

  await page.goto("/projects");
  await expect(
    page.getByRole("button", { name: /new project|مشروع جديد/i }),
  ).toBeVisible();

  await page.goto("/quotations");
  await expect(
    page.getByRole("link", { name: /^quotations$|^عروض الأسعار$/i }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: /^contracts$|^العقود$/i }).click();
  await expect(page).toHaveURL(/\/quotations\?view=contracts$/);
  await expect(
    page.getByRole("heading", { name: /contract generator|منشئ العقد/i }),
  ).toBeVisible();
  await expect(page.locator('nav a[href="/contracts"]')).toHaveCount(0);

  await page.goto("/contracts");
  await expect(page).toHaveURL(/\/quotations\?view=contracts$/);

  await expect(page.locator('nav a[href="/project-manager"]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/project-engineer"]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/site-measurements"]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/quality-control"]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/aluminum-factory"]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/delivery"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("Indoor Sales sees owner-first dashboard queues", async ({ page }) => {
  const account = accountFromEnvironment("E2E_INDOOR");
  test.skip(!account, "Set E2E_INDOOR_USERNAME and E2E_INDOOR_PASSWORD.");
  await signIn(page, account!);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /my projects|مشاريعي/i }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /team follow-ups|متابعات الفريق/i }),
  ).toBeVisible();
});

test("Outdoor Sales sees mobile measurement actions without commercial values", async ({
  page,
}, testInfo) => {
  const account = accountFromEnvironment("E2E_OUTDOOR");
  test.skip(!account, "Set E2E_OUTDOOR_USERNAME and E2E_OUTDOOR_PASSWORD.");
  test.skip(
    !testInfo.project.name.includes("mobile") &&
      !testInfo.project.name.includes("tablet"),
    "Outdoor workflow is asserted on mobile and tablet projects.",
  );
  await signIn(page, account!);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", {
      name: /measurement visits assigned to me|زيارات القياس المسندة إليّ/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/contract total|إجمالي العقد/i)).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
