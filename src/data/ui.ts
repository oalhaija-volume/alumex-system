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
  client: string;
  address: string;
  projectType: string;
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

export const clients: Client[] = [
  {
    id: "basra-gateway-holdings",
    clientName: "Basra Gateway Holdings",
    mobile: "+964 770 120 4567",
    alternateMobile: "+964 780 440 9912",
    address: "Corniche commercial district, Tower B, Floor 8",
    province: "Basra",
    city: "Basra",
    email: "procurement@basragateway.example",
    notes: "Prefers facade package quotations grouped by elevation.",
  },
  {
    id: "rafidain-medical-city",
    clientName: "Rafidain Medical City",
    mobile: "+964 771 640 2234",
    alternateMobile: "+964 750 800 4410",
    address: "Medical complex road, procurement office",
    province: "Baghdad",
    city: "Baghdad",
    email: "contracts@rafidainmedical.example",
    notes: "Requires clear warranty notes for glazing and hardware.",
  },
  {
    id: "north-star-developments",
    clientName: "North Star Developments",
    mobile: "+964 772 345 7801",
    alternateMobile: "+964 751 220 3344",
    address: "Dream City business center, office 14",
    province: "Erbil",
    city: "Erbil",
    email: "info@northstardev.example",
    notes: "Residential villas and premium aluminum systems.",
  },
  {
    id: "tigris-logistics-park",
    clientName: "Tigris Logistics Park",
    mobile: "+964 773 918 4550",
    alternateMobile: "+964 782 551 1209",
    address: "Industrial zone, warehouse administration block",
    province: "Nineveh",
    city: "Mosul",
    email: "operations@tigrislogistics.example",
    notes: "Industrial doors, cladding, and fast approval cycles.",
  },
];

export const projectStatuses: ProjectStatus[] = [
  "Draft",
  "Measuring",
  "Quotation",
  "Contract",
  "Production",
  "Completed",
];

export const projects: Project[] = [
  {
    id: "prj-2026-001",
    projectNumber: "PRJ-2026-001",
    projectName: "Aluminum facade package",
    client: "Basra Gateway Holdings",
    address: "Corniche commercial district, Tower B",
    projectType: "Facade",
    salesEngineer: "Lina Abbas",
    status: "Measuring",
    structuralOpenings: [
      {
        id: "op-001",
        floor: "Ground",
        room: "Lobby",
        openingCode: "G-LB-01",
        width: 180,
        height: 240,
        quantity: 2,
        productSystem: "Curtain Wall",
        glassType: "Double Low-E",
        aluminumColor: "Silver Anodized",
        notes: "Main entrance glazing.",
      },
      {
        id: "op-002",
        floor: "Level 1",
        room: "Office",
        openingCode: "L1-OF-03",
        width: 80,
        height: 90,
        quantity: 1,
        productSystem: "Sliding Window",
        glassType: "Clear Double",
        aluminumColor: "RAL 7016",
        notes: "Minimum billable area applies.",
      },
    ],
  },
  {
    id: "prj-2026-002",
    projectNumber: "PRJ-2026-002",
    projectName: "Curtain wall replacement",
    client: "Rafidain Medical City",
    address: "Medical complex road, main hospital wing",
    projectType: "Curtain Wall",
    salesEngineer: "Mazen Saleh",
    status: "Quotation",
    structuralOpenings: [],
  },
  {
    id: "prj-2026-003",
    projectNumber: "PRJ-2026-003",
    projectName: "Villa glazing system",
    client: "North Star Developments",
    address: "Dream City residential sector, villa cluster 4",
    projectType: "Glazing",
    salesEngineer: "Reem Fadhil",
    status: "Production",
    structuralOpenings: [],
  },
  {
    id: "prj-2026-004",
    projectNumber: "PRJ-2026-004",
    projectName: "Warehouse doors and cladding",
    client: "Tigris Logistics Park",
    address: "Industrial zone, warehouse block A",
    projectType: "Industrial",
    salesEngineer: "Adil Karim",
    status: "Contract",
    structuralOpenings: [],
  },
];

export const contracts = [
  {
    ref: "CT-2026-0088",
    client: "North Star Developments",
    project: "Villa glazing system",
    status: "Active",
    signed: "May 28",
  },
  {
    ref: "CT-2026-0082",
    client: "Basra Gateway Holdings",
    project: "Aluminum facade package",
    status: "Review",
    signed: "Pending",
  },
  {
    ref: "CT-2026-0079",
    client: "Tigris Logistics Park",
    project: "Warehouse doors and cladding",
    status: "Draft",
    signed: "Pending",
  },
];
