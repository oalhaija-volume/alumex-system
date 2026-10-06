import type { AppRole } from "@/lib/auth/roles";

// Browser device signals enforce the mobile workspace rule, not device identity.
export function isPhoneRequest(requestHeaders: Pick<Headers, "get">) {
  const agent = requestHeaders.get("user-agent") ?? "";
  if (/iPad|Tablet|Silk/i.test(agent)) return false;
  if (/iPhone|iPod|Windows Phone/i.test(agent)) return true;
  if (/Android/i.test(agent)) return /Mobile/i.test(agent);
  return requestHeaders.get("sec-ch-ua-mobile") === "?1";
}

export function requiresMobileWorkspace(role: AppRole | null, requestHeaders: Pick<Headers, "get">) {
  return role === "Outdoor Sales" && !isPhoneRequest(requestHeaders);
}
