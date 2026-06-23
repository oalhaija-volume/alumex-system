export type PageAccessItem = {
  labelKey: string;
  routePath: string;
};

export type EmployeePageAccess = {
  user_id: string;
  route_path: string;
  can_access: boolean;
};

export const pageAccessItems: PageAccessItem[] = [
  { labelKey: "nav.dashboard", routePath: "/dashboard" },
  { labelKey: "nav.clients", routePath: "/clients" },
  { labelKey: "nav.projects", routePath: "/projects" },
  { labelKey: "nav.commercial", routePath: "/commercial" },
  { labelKey: "nav.operationsManager", routePath: "/operations-manager" },
  { labelKey: "nav.projectManager", routePath: "/project-manager" },
  { labelKey: "nav.projectEngineer", routePath: "/project-engineer" },
  { labelKey: "nav.siteMeasurements", routePath: "/site-measurements" },
  { labelKey: "nav.qualityControl", routePath: "/quality-control" },
  { labelKey: "nav.factory", routePath: "/aluminum-factory" },
  { labelKey: "nav.delivery", routePath: "/delivery" },
  { labelKey: "nav.installation", routePath: "/installation" },
  { labelKey: "nav.finance", routePath: "/finance" },
  { labelKey: "nav.contracts", routePath: "/contracts" },
  { labelKey: "nav.hr", routePath: "/hr" },
  { labelKey: "nav.settings", routePath: "/settings" },
];

export function routePathMatches(pathname: string, routePath: string) {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

export function hasEmployeePageAccess(
  pathname: string,
  accessRows: Array<Pick<EmployeePageAccess, "route_path" | "can_access">>,
) {
  if (accessRows.length === 0) {
    return true;
  }

  return accessRows.some(
    (access) =>
      access.can_access && routePathMatches(pathname, access.route_path),
  );
}
