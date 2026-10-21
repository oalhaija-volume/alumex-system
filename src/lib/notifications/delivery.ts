export type NotificationItem = {
  id: string;
  title_key: string;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
  payload?: { project_name?: string; project_number?: string } | null;
};

export function notificationTitle(key: string) {
  if (key.endsWith("measurementAssigned")) return "New measurement assignment";
  if (key.endsWith("measurementVisitReturned")) return "Arrange another measurement visit";
  if (key.endsWith("projectFollowUpAssigned")) return "New project to follow up";
  if (key.endsWith("followUpDue") || key.endsWith("followUpOverdue")) return "Follow-up is due";
  if (key.endsWith("followUpAssigned")) return "Follow-up assigned";
  if (key.endsWith("followUpRescheduled")) return "Follow-up rescheduled";
  return "Alumex notification";
}

export function notificationLink(item: NotificationItem, fallback = "/mini-crm") {
  const path = item.link_path;
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  try {
    if (new URL(path, "https://alumex.invalid").origin !== "https://alumex.invalid") return fallback;
  } catch { return fallback; }
  return path.replace(/^\/site-measurements\//, "/initial-measurements/").replace(/^\/crm(?=[?#/]|$)/, "/mini-crm");
}

export function parseDeliveredIds(value: string | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch { return new Set(); }
}

export function newNotifications(items: NotificationItem[], delivered: Set<string>) {
  return items.filter(item => !item.read_at && !delivered.has(item.id));
}
