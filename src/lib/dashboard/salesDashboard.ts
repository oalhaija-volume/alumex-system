import type { AppRole } from "@/lib/auth/roles";

export type SalesDashboardKind = "manager" | "indoor" | "outdoor";
export type DashboardPreviewRole =
  | "Sales Manager"
  | "Indoor Sales"
  | "Outdoor Sales";

export const dashboardPreviewRoles: DashboardPreviewRole[] = [
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
];

export function normalizeDashboardPreviewRole(
  value: string | null | undefined,
): DashboardPreviewRole | null {
  return dashboardPreviewRoles.includes(value as DashboardPreviewRole)
    ? (value as DashboardPreviewRole)
    : null;
}

const salesDashboardRoles = new Set<AppRole>([
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
]);

export function salesDashboardKind(
  role: AppRole | null,
): SalesDashboardKind | null {
  if (!role || !salesDashboardRoles.has(role)) return null;
  if (role === "Outdoor Sales") return "outdoor";
  if (role === "Admin" || role === "Sales Manager") return "manager";
  return "indoor";
}
