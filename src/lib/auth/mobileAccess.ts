import type { AppRole } from "@/lib/auth/roles";

// Device signals select the phone layout; role permissions still apply on every device.
export function isPhoneRequest(requestHeaders: Pick<Headers, "get">) {
  const agent = requestHeaders.get("user-agent") ?? "";
  if (/iPad|Tablet|Silk/i.test(agent)) return false;
  if (/iPhone|iPod|Windows Phone/i.test(agent)) return true;
  if (/Android/i.test(agent)) return /Mobile/i.test(agent);
  return requestHeaders.get("sec-ch-ua-mobile") === "?1";
}

export function usesMobileWorkspace(role: AppRole | null, requestHeaders: Pick<Headers, "get">) {
  return role === "Outdoor Sales" && isPhoneRequest(requestHeaders);
}

export function isMobileWorkspaceRoute(path: string) {
  return ["/", "/dashboard", "/intake", "/project-log", "/auth/logout"].includes(path) || /^\/initial-measurements\/[0-9a-f-]{36}\/?$/i.test(path);
}
