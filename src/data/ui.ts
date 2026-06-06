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
  projectType: string;
  salesEngineerId?: string;
  salesEngineer: string;
  status: ProjectStatus;
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
  { labelKey: "nav.quotations", href: "/quotations", icon: "Q" },
  { labelKey: "nav.contracts", href: "/contracts", icon: "K" },
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
