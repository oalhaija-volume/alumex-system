import type { ProjectWorkflowStatus } from "@/lib/workflow/statuses";

export type NavItem = {
  labelKey: string;
  href: string;
  icon: string;
};

export type Client = {
  id: string;
  clientName: string;
  mobile: string;
  alternateMobile: string;
  address: string;
  province: string;
  city: string;
  email: string;
  notes: string;
};

export type ProjectStatus =
  | "Draft"
  | "Measuring"
  | "Quotation"
  | "Contract"
  | "Production"
  | "Completed";

export type Project = {
  id: string;
  projectNumber: string;
  projectName: string;
  clientId?: string;
  client: string;
  address: string;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  geofenceRadiusMeters?: number | null;
  projectType: string;
  salesEngineerId?: string;
  salesEngineer: string;
  status: ProjectStatus;
  workflowStatus?: ProjectWorkflowStatus;
  structuralOpenings: StructuralOpening[];
};

export type StructuralOpening = {
  id: string;
  floor: string;
  room: string;
  openingCode: string;
  width: number;
  height: number;
  quantity: number;
  productSystem: string;
  glassType: string;
  aluminumColor: string;
  notes: string;
};

export const navItems: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: "D" },
  { labelKey: "nav.clients", href: "/clients", icon: "C" },
  { labelKey: "nav.projects", href: "/projects", icon: "P" },
  { labelKey: "nav.workflow", href: "/workflow", icon: "W" },
  { labelKey: "nav.operationsManager", href: "/operations-manager", icon: "O" },
  { labelKey: "nav.projectManager", href: "/project-manager", icon: "M" },
  { labelKey: "nav.projectEngineer", href: "/project-engineer", icon: "E" },
  { labelKey: "nav.finance", href: "/finance", icon: "F" },
  { labelKey: "nav.quotations", href: "/quotations", icon: "Q" },
  { labelKey: "nav.contracts", href: "/contracts", icon: "K" },
  { labelKey: "nav.hr", href: "/hr", icon: "H" },
  { labelKey: "nav.settings", href: "/settings", icon: "S" },
];

export const projectStatuses: ProjectStatus[] = [
  "Draft",
  "Measuring",
  "Quotation",
  "Contract",
  "Production",
  "Completed",
];

export const projects: Project[] = [];
