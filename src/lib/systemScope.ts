export const activeNavigationHrefs = ["/dashboard","/intake","/project-log","/projects","/signed-contracts","/mini-crm","/catalog","/hr","/operations"] as const;
export const postOperationsWorkflowEnabled = false;
export function isActiveSystemRoute(pathname: string) {
 return (pathname === '/downloads/windows' || /^\/projects\/[0-9a-f-]{36}(?:\/follow-ups)?$/i.test(pathname) || ["/","/unauthorized",...activeNavigationHrefs].includes(pathname) || /^\/(initial-measurements|quotation|contract)\/[0-9a-f-]{36}$/i.test(pathname));
}
