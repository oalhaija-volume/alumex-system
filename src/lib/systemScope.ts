export const activeNavigationHrefs = ["/intake"] as const;
export const postOperationsWorkflowEnabled = false;
export function isActiveSystemRoute(pathname: string) {
  return (["/", "/intake", "/unauthorized"].includes(pathname) || /^\/initial-measurements\/[0-9a-f-]{36}$/i.test(pathname));
}
