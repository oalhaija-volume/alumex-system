import type { AppRole } from "@/lib/auth/roles";
import { appRoles, salesPriceRoles } from "@/lib/auth/roles";

export type { AppRole };

const workflowRoles: AppRole[] = appRoles;

const routePermissions: Array<{
  prefix: string;
  roles: AppRole[];
}> = [
  { prefix: "/settings", roles: ["Admin"] },
  { prefix: "/hr", roles: ["Admin"] },
  { prefix: "/contracts", roles: ["Admin", "Sales Manager", "Sales Rep", "Finance / Accountant"] },
  { prefix: "/finance", roles: ["Admin", "Finance / Accountant"] },
  { prefix: "/operation-manager", roles: ["Admin", "Operations Manager"] },
  { prefix: "/operations-manager", roles: ["Admin", "Operations Manager"] },
  { prefix: "/project-manager", roles: ["Admin", "Project Manager"] },
  { prefix: "/project-engineer", roles: ["Admin", "Project Engineer"] },
  { prefix: "/quotations", roles: salesPriceRoles },
  { prefix: "/dashboard", roles: workflowRoles },
  { prefix: "/clients", roles: salesPriceRoles },
  { prefix: "/projects", roles: workflowRoles },
  { prefix: "/workflow", roles: workflowRoles },
  { prefix: "/", roles: workflowRoles },
];

export function canAccessRoute(pathname: string, role: AppRole | null) {
  if (!role) {
    return false;
  }

  const permission = routePermissions.find(({ prefix }) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );

  return permission ? permission.roles.includes(role) : true;
}
