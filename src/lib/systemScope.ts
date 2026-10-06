export const activeNavigationHrefs = ["/intake","/projects","/mini-crm","/catalog","/hr","/operations"] as const;
export const postOperationsWorkflowEnabled = false;
export function isActiveSystemRoute(pathname: string) {
 return (["/","/unauthorized",...activeNavigationHrefs].includes(pathname) || /^\/(initial-measurements|quotation|contract)\/[0-9a-f-]{36}$/i.test(pathname));
}
