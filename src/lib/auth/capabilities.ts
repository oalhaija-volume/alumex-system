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
  "clients:create": ["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Outdoor Sales"],
  "clients:update": [
    "Admin",
    "Sales Director",
    "CEO", "Company Owner",
    "Sales Manager",
    "Indoor Sales",
    "Outdoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "projects:create": [
    "Admin",
    "Sales Director",
    "CEO", "Company Owner",
    "Sales Manager",
    "Indoor Sales",
    "Outdoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "projects:view-team": [
    "Admin",
    "Sales Director",
    "CEO", "Company Owner",
    "Sales Manager",
    "Indoor Sales",
    "Branch Manager",
  ],
  "projects:reassign": ["Admin", "Sales Director", "CEO", "Company Owner", "Sales Manager"],
  "measurements:request": ["Admin", "Sales Director", "CEO", "Company Owner", "Sales Manager", "Indoor Sales"],
  "measurements:record": [
    "Admin",
    "Sales Director",
    "CEO", "Company Owner",
    "Outdoor Sales",
    "Project Engineer",
    "Site Engineer",
  ],
  "measurements:review": ["Admin", "Sales Director", "CEO", "Company Owner", "Sales Manager", "Indoor Sales"],
  "quotations:manage": [
    "Admin",
    "Sales Director",
    "CEO", "Company Owner",
    "Sales Manager",
    "Indoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "contracts:manage": [
    "Admin",
    "Sales Director",
    "CEO", "Company Owner",
    "Sales Manager",
    "Indoor Sales",
    "Sales Rep",
    "Branch Manager",
  ],
  "follow-ups:perform": ["Admin", "CEO", "Company Owner", "Indoor Sales", "Sales Director"],
  "audit:view": ["Admin", "Sales Director", "CEO", "Company Owner", "Sales Manager"],
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
