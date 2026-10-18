import type { AppRole } from "@/lib/auth/roles";
import type { EmployeePageAccess } from "@/lib/auth/pageAccess";
export type { AppRole };
const registrationRoles: readonly AppRole[] = ["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Outdoor Sales"];
export const leadershipRoles = ['Admin', 'CEO', 'Sales Director', 'Company Owner'] as const;
export function isLeadershipRole(role: string | null | undefined) {
 return leadershipRoles.some(value => value === role);
}
export const quotationRoles = [...leadershipRoles, 'Indoor Sales'] as const;
export function canPrepareQuotation(role: string | null | undefined) {
 return quotationRoles.some(value => value === role);
}
export const crmRoles = [...leadershipRoles, 'Indoor Sales'] as const;
export function canAccessCRM(role: string | null | undefined) {
 return role === 'Indoor Sales' || isLeadershipRole(role);
}
export function isCRMRoute(pathname: string) {
 return pathname === '/mini-crm' || /^\/projects\/[0-9a-f-]{36}\/follow-ups$/i.test(pathname);
}
export function defaultRouteForRole(role: AppRole | null) {
 return role ? "/dashboard" : "/unauthorized";
}
export function canAccessRoute(pathname: string, role: AppRole | null) {
 if(!role)return false;
 if(pathname === "/" || pathname === "/dashboard")return true;
 if(/^\/(quotation|contract)\/[0-9a-f-]{36}$/i.test(pathname))return canPrepareQuotation(role);
 if(isCRMRoute(pathname))return canAccessCRM(role);
 if(pathname === "/hr")return isLeadershipRole(role) || role === "HR";
 if(pathname === "/catalog")return isLeadershipRole(role);
 if(pathname === "/operations")return isLeadershipRole(role) || ["Operations Manager","Project Manager"].includes(role);
 return registrationRoles.includes(role) && (/^\/projects\/[0-9a-f-]{36}\/follow-ups$/i.test(pathname) || ["/", "/dashboard", "/intake", "/projects", "/mini-crm"].includes(pathname) || /^\/(initial-measurements|quotation|contract)\/[0-9a-f-]{36}$/i.test(pathname));
}
export function canAccessRouteWithOverrides(pathname: string, role: AppRole | null, accessRows: Array<Pick<EmployeePageAccess, "route_path" | "can_access">>) {
  void accessRows;
  return canAccessRoute(pathname, role);
}
