import { newNotifications, parseDeliveredIds, type NotificationItem } from "./delivery";
import { playNotificationChime } from "./sound";

type Snapshot = { items: NotificationItem[]; unread: number; role: string; alert: NotificationItem | null };
const empty: Snapshot = { items: [], unread: 0, role: "", alert: null };
let snapshot = empty;
const subscribers = new Set<() => void>();
const memory = new Map<string, Set<string>>();
let actorId = "";
let generation = 0;
let controller: AbortController | null = null;
let stop: (() => void) | null = null;
let context: AudioContext | null = null;
let alertTimer: ReturnType<typeof setTimeout> | undefined;
let soundInFlight = false;

function emit(value: Snapshot) { snapshot = value; subscribers.forEach(callback => callback()); }
function key(kind: string) { return `alumex-notifications:${actorId}:${kind}`; }
function read(kind: string) {
  const storageKey = key(kind);
  try {
    const value = localStorage.getItem(storageKey);
    if (value !== null) return parseDeliveredIds(value);
  } catch { /* Private browsing can disable storage. */ }
  return memory.get(storageKey) ?? new Set<string>();
}
function remember(kind: string, ids: string[]) {
  const saved = read(kind);
  ids.forEach(id => saved.add(id));
  const bounded = [...saved].slice(-500);
  memory.set(key(kind), new Set(bounded));
  try { localStorage.setItem(key(kind), JSON.stringify(bounded)); } catch { /* Keep session deduplication. */ }
}

async function sound() {
  if (!actorId || soundInFlight || document.visibilityState !== "visible" || context?.state !== "running") return;
  soundInFlight = true;
  const identity = actorId;
  const play = () => {
    if (identity !== actorId || context?.state !== "running" || document.visibilityState !== "visible") return;
    const pending = newNotifications(snapshot.items, read("sounded"));
    if (!pending.length) return;
    if (playNotificationChime(context)) remember("sounded", pending.map(item => item.id));
  };
  try {
    if (navigator.locks) await navigator.locks.request(`alumex-notification-sound:${identity}`, play);
    else if (document.hasFocus()) play();
  } catch { /* Audio must never interrupt the sales workflow. */ }
  finally { soundInFlight = false; }
}

function unlockAudio() {
  try {
    const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return;
    if (!context || context.state === "closed") context = new Constructor();
    // resume() is called directly inside the ordinary user gesture for mobile Safari.
    if (context.state !== "running") void context.resume().then(sound).catch(() => {});
    else void sound();
  } catch { /* Notifications remain readable when sound is unsupported or blocked. */ }
}

export async function refreshNotifications() {
  if (controller || !navigator.onLine || document.visibilityState !== "visible") return;
  const current = generation;
  const request = new AbortController();
  controller = request;
  const timeout = setTimeout(() => request.abort(), 12000);
  try {
    const response = await fetch("/api/notifications", { cache: "no-store", signal: request.signal });
    if (current !== generation || request.signal.aborted) return;
    if (response.status === 401 || response.status === 403) { actorId = ""; emit(empty); return; }
    if (!response.ok) return;
    const data = await response.json() as { userId: string; role: string; notifications: NotificationItem[]; unreadCount: number };
    if (current !== generation || request.signal.aborted || !data.userId || !Array.isArray(data.notifications)) return;
    const changedAccount = actorId !== data.userId;
    actorId = data.userId;
    // First activation does not play an old backlog. Newly arriving events and
    // due reminders created by this poll still alert immediately.
    if (changedAccount) {
      const old = data.notifications.filter(item => Date.parse(item.created_at) < Date.now() - 60000).map(item => item.id);
      remember("seen", old); remember("sounded", old);
    }
    const fresh = newNotifications(data.notifications, read("seen"));
    remember("seen", data.notifications.map(item => item.id));
    const alert = fresh[0] ?? (changedAccount ? null : snapshot.alert);
    emit({ items: data.notifications, unread: data.unreadCount, role: data.role, alert });
    if (fresh.length) {
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => emit({ ...snapshot, alert: null }), 8000);
    }
    void sound();
  } catch { /* Reconnect and subsequent polls retry without blocking offline work. */ }
  finally { clearTimeout(timeout); if (controller === request) controller = null; }
}

function start() {
  const poll = () => { void refreshNotifications(); };
  const accountChanged = (event: Event) => {
    const detail = (event as CustomEvent<{ source?: string; userId?: string | null }>).detail;
    if (detail?.source === "account" && detail.userId !== actorId) {
      generation++; controller?.abort(); controller = null; actorId = ""; emit(empty);
    }
    poll();
  };
  const timer = setInterval(poll, 15000);
  const first = setTimeout(poll, 0);
  window.addEventListener("pointerup", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);
  window.addEventListener("focus", poll);
  window.addEventListener("online", poll);
  window.addEventListener("field-change", accountChanged);
  document.addEventListener("visibilitychange", poll);
  return () => {
    generation++; controller?.abort(); controller = null;
    clearInterval(timer); clearTimeout(first); clearTimeout(alertTimer);
    window.removeEventListener("pointerup", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    window.removeEventListener("focus", poll);
    window.removeEventListener("online", poll);
    window.removeEventListener("field-change", accountChanged);
    document.removeEventListener("visibilitychange", poll);
    if (context) void context.close().catch(() => {});
    context = null; actorId = ""; snapshot = empty;
  };
}

export function subscribeNotifications(callback: () => void) {
  subscribers.add(callback);
  if (!stop) stop = start();
  return () => { subscribers.delete(callback); if (!subscribers.size) { stop?.(); stop = null; } };
}
export const getNotifications = () => snapshot;
export const getServerNotifications = () => empty;
export function dismissNotificationAlert() { clearTimeout(alertTimer); emit({ ...snapshot, alert: null }); }
export async function markNotificationsRead(notificationId?: string) {
  const identity = actorId;
  try {
    const response = await fetch("/api/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(notificationId ? { notificationId } : { all: true }),
    });
    if (response.ok && actorId === identity) {
      generation++; controller?.abort(); controller = null;
      const items = snapshot.items.map(item => !notificationId || item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item);
      const count = notificationId ? snapshot.items.filter(item => item.id === notificationId && !item.read_at).length : snapshot.unread;
      emit({ ...snapshot, items, unread: Math.max(0, snapshot.unread - count), alert: null });
      await refreshNotifications();
    }
  } catch { /* Leave unread so the employee can retry. */ }
}
