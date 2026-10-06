import type { AppRole } from "@/lib/auth/roles";
import {
  type EmployeePageAccess,
} from "@/lib/auth/pageAccess";
import { isActiveSystemRoute } from "@/lib/systemScope";

export type { AppRole };

const dashboardRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Operations Manager",
];
const salesWorkspaceRoles: AppRole[] = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Sales Rep",
  "Branch Manager",
];
const clientProjectRoles: AppRole[] = [
  ...salesWorkspaceRoles,
  "Outdoor Sales",
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
  {
    prefix: "/intake",
    roles: ["Admin", "Indoor Sales", "Outdoor Sales"],
  },
  { prefix: "/measurements", roles: ["Admin", "Indoor Sales", "Sales Manager", "Outdoor Sales", "Project Engineer", "Site Engineer"] },
  {
    prefix: "/crm",
    roles: ["Admin", "Sales Manager", "Indoor Sales", "Branch Manager"],
  },
  { prefix: "/commercial", roles: salesWorkspaceRoles },
  { prefix: "/contracts", roles: [...salesWorkspaceRoles, "Finance / Accountant"] },
  { prefix: "/costing", roles: ["Admin", "Procurement Engineer"] },
  { prefix: "/pricing", roles: ["Admin"] },
  { prefix: "/operation-manager", roles: ["Admin", "Operations Manager"] },
  { prefix: "/operations-manager", roles: ["Admin", "Operations Manager"] },
  {
    prefix: "/site-measurements",
    roles: [
      "Admin",
      "Sales Manager",
      "Indoor Sales",
      "Outdoor Sales",
      "Project Engineer",
      "Site Engineer",
    ],
  },
  { prefix: "/quotations", roles: salesWorkspaceRoles },
  { prefix: "/dashboard", roles: dashboardRoles },
  { prefix: "/clients", roles: clientProjectRoles },
  { prefix: "/projects", roles: clientProjectRoles },
  { prefix: "/workflow", roles: workflowDetailRoles },
  { prefix: "/", roles: dashboardRoles },
];

export function defaultRouteForRole(role: AppRole | null) {
  switch (role) {
    case "Admin":
    case "Indoor Sales":
    case "Outdoor Sales":
      return "/intake";
    case "Sales Manager":
    case "Sales Rep":
      return "/dashboard";
    case "Branch Manager":
      return "/projects";
    case "HR":
      return "/hr";
    case "Project Engineer":
    case "Site Engineer":
      return "/measurements";
    case "Finance / Accountant":
      return "/contracts";
    case "Operations Manager":
      return "/dashboard";
    case "Procurement Engineer":
      return "/costing";
    case "Project Manager":
    case "Delivery Head":
    case "Delivery Team":
    case "Installation Head":
    case "Installation Team":
    case "Quality Control":
    case "Factory":
    case "Glass Department":
    case "Auditor":
    case "Audit Team":
      return "/unauthorized";
    default:
      return "/unauthorized";
  }
}

export function canAccessRoute(pathname: string, role: AppRole | null) {
  if (role === "Admin") {
    return true;
  }

  if (!role || !isActiveSystemRoute(pathname)) {
    return false;
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
  // Employee access always follows the current role; legacy overrides are ignored.
  void accessRows;
  return canAccessRoute(pathname, role);
}
