export type AppRole =
  | "Admin"
  | "Sales Manager"
  | "Sales Rep"
  | "Finance / Accountant"
  | "Operations Manager"
  | "Project Manager"
  | "Project Engineer"
  | "Site Engineer"
  | "Auditor"
  | "Branch Manager"
  | "Delivery Head"
  | "Installation Head";

export const appRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Finance / Accountant",
  "Operations Manager",
  "Project Manager",
  "Project Engineer",
  "Site Engineer",
  "Auditor",
  "Branch Manager",
  "Delivery Head",
  "Installation Head",
];

export const salesPriceRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Branch Manager",
];

export const financeValueRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Finance / Accountant",
];

export function isAppRole(value: unknown): value is AppRole {
  return appRoles.includes(value as AppRole);
}

export function normalizeAppRole(role: string | null | undefined): AppRole | null {
  if (role === "Sales User") {
    return "Sales Rep";
  }

  return isAppRole(role) ? role : null;
}

export function canViewSalesPrices(role: AppRole | null) {
  return role ? salesPriceRoles.includes(role) : false;
}

export function canViewFinanceValues(role: AppRole | null) {
  return role ? financeValueRoles.includes(role) : false;
}
