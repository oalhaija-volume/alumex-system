import type { AppRole } from "@/lib/auth/roles";
import {
  routePathMatches,
  type EmployeePageAccess,
} from "@/lib/auth/pageAccess";

export type { AppRole };

const dashboardRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Operations Manager",
];
const salesWorkspaceRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Branch Manager",
];
const workflowDetailRoles: AppRole[] = [
  "Admin",
  "Operations Manager",
  "Project Manager",
  "Project Engineer",
  "Auditor",
  "Audit Team",
  "Branch Manager",
  "Quality Control",
];

const routePermissions: Array<{
  prefix: string;
  roles: AppRole[];
}> = [
  { prefix: "/settings", roles: ["Admin"] },
  { prefix: "/hr", roles: ["Admin", "HR"] },
  { prefix: "/commercial", roles: salesWorkspaceRoles },
  { prefix: "/contracts", roles: [...salesWorkspaceRoles, "Finance / Accountant"] },
  { prefix: "/finance", roles: ["Admin", "Finance / Accountant"] },
  { prefix: "/operation-manager", roles: ["Admin", "Operations Manager"] },
  { prefix: "/operations-manager", roles: ["Admin", "Operations Manager"] },
  { prefix: "/project-manager", roles: ["Admin", "Project Manager"] },
  { prefix: "/project-engineer", roles: ["Admin", "Project Engineer"] },
  { prefix: "/site-measurements", roles: ["Admin", "Site Engineer"] },
  { prefix: "/quality-control", roles: ["Admin", "Quality Control"] },
  { prefix: "/aluminum-factory", roles: ["Admin", "Factory", "Glass Department"] },
  { prefix: "/delivery", roles: ["Admin", "Delivery Head", "Delivery Team"] },
  { prefix: "/installation", roles: ["Admin", "Installation Head", "Installation Team"] },
  { prefix: "/quotations", roles: salesWorkspaceRoles },
  { prefix: "/dashboard", roles: dashboardRoles },
  { prefix: "/clients", roles: salesWorkspaceRoles },
  { prefix: "/projects", roles: salesWorkspaceRoles },
  { prefix: "/workflow", roles: workflowDetailRoles },
  { prefix: "/", roles: dashboardRoles },
];

export function defaultRouteForRole(role: AppRole | null) {
  switch (role) {
    case "Admin":
    case "Sales Manager":
    case "Sales Rep":
    case "Branch Manager":
      return "/dashboard";
    case "Finance / Accountant":
      return "/finance";
    case "Operations Manager":
      return "/dashboard";
    case "Project Manager":
      return "/project-manager";
    case "Project Engineer":
      return "/project-engineer";
    case "Site Engineer":
      return "/site-measurements";
    case "Delivery Head":
    case "Delivery Team":
      return "/delivery";
    case "Installation Head":
    case "Installation Team":
      return "/installation";
    case "Quality Control":
      return "/quality-control";
    case "Factory":
    case "Glass Department":
      return "/aluminum-factory";
    case "HR":
      return "/hr";
    case "Auditor":
    case "Audit Team":
      return "/workflow";
    default:
      return "/unauthorized";
  }
}

export function canAccessRoute(pathname: string, role: AppRole | null) {
  if (!role) {
    return false;
  }

  if (role === "Admin") {
    return true;
  }

  const permission = routePermissions.find(({ prefix }) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );

  return permission ? permission.roles.includes(role) : true;
}

export function canAccessRouteWithOverrides(
  pathname: string,
  role: AppRole | null,
  accessRows: Array<Pick<EmployeePageAccess, "route_path" | "can_access">>,
) {
  if (role === "Admin") {
    return true;
  }

  const override = accessRows
    .filter((access) => routePathMatches(pathname, access.route_path))
    .sort((left, right) => right.route_path.length - left.route_path.length)[0];

  if (override) {
    return override.can_access;
  }

  return canAccessRoute(pathname, role);
}
