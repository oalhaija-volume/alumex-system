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
  locationLatitude?: number | null;
  locationLongitude?: number | null;
};

export type ProjectStatus =
  | "Draft"
  | "Measuring"
  | "Quotation"
  | "Contract"
  | "Production"
  | "Completed";

export type ProjectBranch = "Rasafa" | "Karkh";

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
  branch: ProjectBranch | "";
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
  solidPanelHeight: number;
  quantity: number;
  productSystem: string;
  glassType: string;
  aluminumColor: string;
  notes: string;
};

export const navItems: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: "D" },
  { labelKey: "nav.intake", href: "/intake", icon: "N" },
  { labelKey: "nav.clients", href: "/clients", icon: "C" },
  { labelKey: "nav.projects", href: "/projects", icon: "P" },
  { labelKey: "nav.crm", href: "/crm", icon: "F" },
  { labelKey: "nav.quotations", href: "/quotations", icon: "Q" },
  { labelKey: "nav.commercial", href: "/commercial", icon: "Q" },
  { labelKey: "nav.operationsManager", href: "/operations-manager", icon: "O" },
  { labelKey: "nav.costing", href: "/costing", icon: "C" },
  { labelKey: "nav.pricing", href: "/pricing", icon: "P" },
  { labelKey: "nav.projectManager", href: "/project-manager", icon: "M" },
  { labelKey: "nav.projectEngineer", href: "/project-engineer", icon: "E" },
  { labelKey: "nav.siteMeasurements", href: "/site-measurements", icon: "S" },
  { labelKey: "nav.qualityControl", href: "/quality-control", icon: "Q" },
  { labelKey: "nav.factory", href: "/aluminum-factory", icon: "F" },
  { labelKey: "nav.delivery", href: "/delivery", icon: "D" },
  { labelKey: "nav.installation", href: "/installation", icon: "I" },
  { labelKey: "nav.finance", href: "/finance", icon: "F" },
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
