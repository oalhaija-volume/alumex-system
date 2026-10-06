import type { AppRole } from "@/lib/auth/roles";
import type { EmployeePageAccess } from "@/lib/auth/pageAccess";
export type { AppRole };
const registrationRoles: readonly AppRole[] = ["Admin", "Indoor Sales", "Outdoor Sales"];
export function defaultRouteForRole(role: AppRole | null) {
 if(role === "HR")return "/hr";
 if(role === "Operations Manager" || role === "Project Manager")return "/operations";
 return role && registrationRoles.includes(role) ? "/intake" : "/unauthorized";
}
export function canAccessRoute(pathname: string, role: AppRole | null) {
 if(!role)return false;
 if(pathname === "/hr")return role === "Admin" || role === "HR";
 if(pathname === "/catalog")return role === "Admin";
 if(pathname === "/operations")return ["Admin","Operations Manager","Project Manager"].includes(role);
 return registrationRoles.includes(role) && (["/", "/intake", "/projects", "/mini-crm"].includes(pathname) || /^\/(initial-measurements|quotation|contract)\/[0-9a-f-]{36}$/i.test(pathname));
}
export function canAccessRouteWithOverrides(pathname: string, role: AppRole | null, accessRows: Array<Pick<EmployeePageAccess, "route_path" | "can_access">>) {
  void accessRows;
  return canAccessRoute(pathname, role);
}
