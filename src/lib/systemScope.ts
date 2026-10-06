export const activeNavigationHrefs = ["/intake"] as const;
export const postOperationsWorkflowEnabled = false;
export function isActiveSystemRoute(pathname: string) {
  return ["/", "/intake", "/unauthorized"].includes(pathname);
}
