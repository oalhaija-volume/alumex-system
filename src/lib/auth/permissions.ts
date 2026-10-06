import type { AppRole } from "@/lib/auth/roles";
import type { EmployeePageAccess } from "@/lib/auth/pageAccess";
export type { AppRole };
const registrationRoles: readonly AppRole[] = ["Admin", "Indoor Sales", "Outdoor Sales"];
export function defaultRouteForRole(role: AppRole | null) {
  return role && registrationRoles.includes(role) ? "/intake" : "/unauthorized";
}
export function canAccessRoute(pathname: string, role: AppRole | null) {
  return Boolean(role && registrationRoles.includes(role) && (["/", "/intake"].includes(pathname) || /^\/initial-measurements\/[0-9a-f-]{36}$/i.test(pathname)));
}
export function canAccessRouteWithOverrides(pathname: string, role: AppRole | null, accessRows: Array<Pick<EmployeePageAccess, "route_path" | "can_access">>) {
  void accessRows;
  return canAccessRoute(pathname, role);
}
