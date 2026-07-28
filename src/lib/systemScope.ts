export const activeNavigationHrefs = [
  "/dashboard",
  "/intake",
  "/projects",
  "/crm",
  "/quotations",
  "/settings",
  "/hr",
  "/commercial",
  "/finance",
  "/operations-manager",
  "/costing",
] as const;

const supportingRoutePrefixes = [
  "/clients",
  "/contracts",
  "/site-measurements",
  "/operation-manager",
  "/pricing",
  "/workflow",
] as const;

export const postOperationsWorkflowEnabled = false;

export function isActiveSystemRoute(pathname: string) {
  if (pathname === "/" || pathname.startsWith("/unauthorized")) {
    return true;
  }

  return [...activeNavigationHrefs, ...supportingRoutePrefixes].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
