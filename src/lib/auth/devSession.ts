import type { NextRequest } from "next/server";

export const devSessionCookieName = "alumex_dev_session";
export const devSessionCookieValue = "admin";
export const demoSessionStorageKey = "alumex_demo_session";
export const demoRoleStorageKey = "alumex_demo_role";

export const isDev = process.env.NODE_ENV === "development";
export const isDemoLoginEnabled =
  process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";

export function isLocalDevelopment() {
  return isDev;
}

export function hasDevSession(request: NextRequest) {
  return (
    isDev &&
    isDemoLoginEnabled &&
    request.cookies.get(devSessionCookieName)?.value === devSessionCookieValue
  );
}

export function createDevSessionCookie() {
  localStorage.setItem(demoSessionStorageKey, "true");
  localStorage.setItem(demoRoleStorageKey, "Admin");
  document.cookie = `${devSessionCookieName}=${devSessionCookieValue}; path=/; SameSite=Lax`;
}

export function clearDevSessionCookie() {
  localStorage.removeItem(demoSessionStorageKey);
  localStorage.removeItem(demoRoleStorageKey);
  document.cookie = `${devSessionCookieName}=; path=/; SameSite=Lax; Max-Age=0`;
}

export function hasBrowserDevSession() {
  return (
    isDev &&
    isDemoLoginEnabled &&
    localStorage.getItem(demoSessionStorageKey) === "true" &&
    localStorage.getItem(demoRoleStorageKey) === "Admin"
  );
}
