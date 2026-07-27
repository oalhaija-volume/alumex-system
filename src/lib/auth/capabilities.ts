import type { AppRole } from "@/lib/auth/roles";

export type AppCapability =
  | "clients:create"
  | "clients:update"
  | "projects:create"
  | "projects:view-team"
  | "projects:reassign"
  | "measurements:request"
  | "measurements:record"
  | "measurements:review"
  | "quotations:manage"
  | "contracts:manage"
  | "follow-ups:perform"
  | "audit:view"
  | "workflow:configure";

const capabilityRoles: Record<AppCapability, readonly AppRole[]> = {
  "clients:create": [
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Outdoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "clients:update": [
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Outdoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "projects:create": [
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Outdoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "projects:view-team": [
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Branch Manager",
  ],
  "projects:reassign": ["Admin", "Sales Manager"],
  "measurements:request": ["Admin", "Sales Manager", "Indoor Sales"],
  "measurements:record": [
    "Admin",
    "Outdoor Sales",
    "Project Engineer",
    "Site Engineer",
  ],
  "measurements:review": ["Admin", "Sales Manager", "Indoor Sales"],
  "quotations:manage": [
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "contracts:manage": [
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "follow-ups:perform": [
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Branch Manager",
  ],
  "audit:view": ["Admin", "Sales Manager"],
  "workflow:configure": ["Admin"],
};

export function roleHasCapability(
  role: AppRole | null,
  capability: AppCapability,
) {
  if (role === "Admin") {
    return true;
  }

  return role ? capabilityRoles[capability].includes(role) : false;
}

export function rolesForCapability(capability: AppCapability) {
  return capabilityRoles[capability];
}
