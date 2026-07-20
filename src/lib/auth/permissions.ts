import type { AppRole } from "@/lib/auth/roles";
import {
  routePathMatches,
  type EmployeePageAccess,
} from "@/lib/auth/pageAccess";
import { isActiveSystemRoute } from "@/lib/systemScope";

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
  { prefix: "/costing", roles: ["Admin", "Procurement Engineer"] },
  { prefix: "/pricing", roles: ["Admin"] },
  { prefix: "/operation-manager", roles: ["Admin", "Operations Manager"] },
  { prefix: "/operations-manager", roles: ["Admin", "Operations Manager"] },
  { prefix: "/project-manager", roles: ["Admin", "Project Manager"] },
  { prefix: "/project-engineer", roles: ["Admin", "Project Engineer"] },
  { prefix: "/site-measurements", roles: ["Admin", "Project Engineer", "Site Engineer"] },
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
    case "Procurement Engineer":
      return "/costing";
    case "Project Manager":
    case "Project Engineer":
    case "Site Engineer":
    case "Delivery Head":
    case "Delivery Team":
    case "Installation Head":
    case "Installation Team":
    case "Quality Control":
    case "Factory":
    case "Glass Department":
    case "HR":
    case "Auditor":
    case "Audit Team":
      return "/unauthorized";
    default:
      return "/unauthorized";
  }
}

export function canAccessRoute(pathname: string, role: AppRole | null) {
  if (!role || !isActiveSystemRoute(pathname)) {
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
  if (!isActiveSystemRoute(pathname)) {
    return false;
  }

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
