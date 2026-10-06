export const activeNavigationHrefs = ["/dashboard","/intake","/projects","/mini-crm","/catalog","/hr","/operations"] as const;
export const postOperationsWorkflowEnabled = false;
export function isActiveSystemRoute(pathname: string) {
 return (/^\/projects\/[0-9a-f-]{36}\/follow-ups$/i.test(pathname) || ["/","/unauthorized",...activeNavigationHrefs].includes(pathname) || /^\/(initial-measurements|quotation|contract)\/[0-9a-f-]{36}$/i.test(pathname));
}
