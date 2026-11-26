// Admin and Indoor Sales work against the current server version. Existing device
// records remain available only to the synchronization and recovery flows.
export const indoorOnlineRequiredMessage = 'This account requires an internet connection. Reconnect to continue.';

export function canUseOfflineWorkspace(role: string | null | undefined): boolean {
  return role !== 'Admin' && role !== 'Indoor Sales';
}

const ONLINE_ONLY_USER = 'alumex-online-only-user';
let verifiedOnlineUser: string | null | undefined;

export function setIndoorOnlineUser(userId: string | null): void {
  if (typeof window === 'undefined') return;
  verifiedOnlineUser = userId;
  // Online work must remain usable when the browser blocks device storage.
  try {
    if (userId) localStorage.setItem(ONLINE_ONLY_USER, userId);
    else localStorage.removeItem(ONLINE_ONLY_USER);
  } catch { /* This tab keeps the verified policy in memory. */ }
}

export function isIndoorOnlineUser(userId: string | null | undefined): boolean {
  if (!userId || typeof window === 'undefined') return false;
  if (verifiedOnlineUser !== undefined) return verifiedOnlineUser === userId;
  try { return localStorage.getItem(ONLINE_ONLY_USER) === userId; }
  catch { return false; }
}
