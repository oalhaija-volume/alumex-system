export const activeNavigationHrefs = [
  "/dashboard",
  "/clients",
  "/projects",
  "/quotations",
  "/commercial",
  "/contracts",
  "/finance",
  "/operations-manager",
  "/costing",
  "/pricing",
] as const;

const supportingRoutePrefixes = [
  "/operation-manager",
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
