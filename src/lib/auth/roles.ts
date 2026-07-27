export type AppRole =
  | "Admin"
  | "Sales Manager"
  | "Indoor Sales"
  | "Outdoor Sales"
  | "Sales Rep"
  | "Finance / Accountant"
  | "Operations Manager"
  | "Procurement Engineer"
  | "Project Manager"
  | "Project Engineer"
  | "Site Engineer"
  | "Auditor"
  | "Audit Team"
  | "Branch Manager"
  | "Factory"
  | "Glass Department"
  | "Delivery Head"
  | "Delivery Team"
  | "Installation Head"
  | "Installation Team"
  | "Quality Control"
  | "HR";

export const appRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Finance / Accountant",
  "Operations Manager",
  "Procurement Engineer",
  "Project Manager",
  "Project Engineer",
  "Site Engineer",
  "Auditor",
  "Audit Team",
  "Branch Manager",
  "Factory",
  "Glass Department",
  "Delivery Head",
  "Delivery Team",
  "Installation Head",
  "Installation Team",
  "Quality Control",
  "HR",
];

const recognizedAppRoles: AppRole[] = [...appRoles, "Sales Rep"];

export const salesPriceRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Sales Rep",
  "Branch Manager",
];

export const financeValueRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Sales Rep",
  "Finance / Accountant",
];

export function isAppRole(value: unknown): value is AppRole {
  return recognizedAppRoles.includes(value as AppRole);
}

export function normalizeAppRole(role: string | null | undefined): AppRole | null {
  if (role === "Sales User") {
    return "Sales Rep";
  }

  if (role === "Finance") {
    return "Finance / Accountant";
  }

  if (role === "Sales Engineer") {
    return "Sales Rep";
  }

  if (role === "Audit Team") {
    return "Auditor";
  }

  return isAppRole(role) ? role : null;
}

export function canViewSalesPrices(role: AppRole | null) {
  return role ? salesPriceRoles.includes(role) : false;
}

export function canViewFinanceValues(role: AppRole | null) {
  return role ? financeValueRoles.includes(role) : false;
}
