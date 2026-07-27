import { expect, type Page } from "@playwright/test";

export type TestAccount = {
  username: string;
  password: string;
};

export function accountFromEnvironment(prefix: string): TestAccount | null {
  const username = process.env[`${prefix}_USERNAME`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];
  return username && password ? { username, password } : null;
}

export async function signIn(page: Page, account: TestAccount) {
  await page.goto("/login");
  await page.getByRole("textbox").first().fill(account.username);
  await page.getByLabel(/password/i).fill(account.password);
  await page.getByRole("button", { name: /log in|تسجيل الدخول/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export function relevantConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
