import { expect, test } from "@playwright/test";
import {
  accountFromEnvironment,
  relevantConsoleErrors,
  signIn,
} from "./helpers";

const quotationDraft = {
  id: "00000000-0000-4000-8000-000000000001",
  versionId: "00000000-0000-4000-8000-000000000002",
  versionNumber: 1,
  versionStatus: "approved",
  quotationNumber: "Q-E2E-0001",
  project: {
    id: "00000000-0000-4000-8000-000000000003",
    projectNumber: "P-E2E-0001",
    projectName: "Responsive Print Project",
    clientId: "00000000-0000-4000-8000-000000000004",
    client: "Print Client",
    address: "Baghdad",
    projectType: "Villa",
    branch: "Rasafa",
    salesEngineer: "Admin",
    status: "Quotation",
    structuralOpenings: [],
  },
  lines: [
    {
      id: "opening-e2e",
      floor: "Ground",
      room: "Living",
      openingCode: "W-01",
      width: 120,
      height: 200,
      solidPanelHeight: 0,
      quantity: 1,
      productSystem: "Sliding",
      glassType: "Double",
      aluminumColor: "Black",
      notes: "",
      unitPrice: 100000,
      discountPercent: 0,
      lineType: "base",
      isDiscountable: true,
    },
  ],
  discountPercent: 0,
  notes: "E2E print validation",
  preparedBy: "Admin",
  clientRepresentative: "Print Client",
  pricingSource: "catalog",
};

test("approved quotation preview has three printable A4 pages", async ({
  page,
}) => {
  const account = accountFromEnvironment("E2E_ADMIN");
  test.skip(!account, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD.");
  const errors = relevantConsoleErrors(page);
  await signIn(page, account!);
  await page.evaluate((draft) => {
    localStorage.setItem("alumex-current-quotation", JSON.stringify(draft));
  }, quotationDraft);
  await page.goto("/quotations/preview");
  await expect(page.locator(".quotation-pdf-page")).toHaveCount(3);
  await expect(page.getByText("Q-E2E-0001").first()).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".quotation-pdf-page").first()).toBeVisible();
  expect(errors).toEqual([]);
});
