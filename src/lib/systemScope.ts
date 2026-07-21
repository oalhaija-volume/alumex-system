export const activeNavigationHrefs = [
  "/dashboard",
  "/clients",
  "/projects",
  "/quotations",
  "/settings",
  "/hr",
  "/commercial",
  "/contracts",
  "/finance",
  "/operations-manager",
  "/costing",
] as const;

const supportingRoutePrefixes = [
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
