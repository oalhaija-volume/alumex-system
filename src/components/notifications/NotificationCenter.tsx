"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  notification_kind: "information" | "action_required" | "overdue";
  title_key: string;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

function titleForKey(key: string) {
  if (key.endsWith("followUpAssigned")) return "Follow-up assigned";
  if (key.endsWith("followUpRescheduled")) return "Follow-up rescheduled";
  if (key.endsWith("followUpOverdue")) return "Follow-up overdue";
  return "Alumex notification";
}

export function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as {
      notifications?: NotificationItem[];
    };
    setItems(body.notifications ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const unread = items.filter((item) => !item.read_at);

  async function markRead(notificationId?: string) {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        notificationId ? { notificationId } : { all: true },
      ),
    });
    if (response.ok) await load();
  }

  return (
    <details className="relative">
      <summary
        aria-label={`Notifications, ${unread.length} unread`}
        className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-material-outline-variant bg-material-surface-container text-sm font-black text-muted-strong"
      >
        N
        {unread.length ? (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-black text-white">
            {Math.min(unread.length, 99)}
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-material-outline-variant bg-material-surface-container-low shadow-[var(--md-elevation-3)]">
        <div className="flex items-center justify-between gap-3 border-b border-material-outline-variant p-3">
          <div>
            <p className="text-sm font-bold text-foreground">Notifications</p>
            <p className="text-xs text-muted">{unread.length} unread</p>
          </div>
          {unread.length ? (
            <button
              type="button"
              onClick={() => void markRead()}
              className="text-xs font-bold text-material-primary"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-80 divide-y divide-material-outline-variant overflow-y-auto">
          {items.length ? (
            items.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className={
                  item.read_at
                    ? "bg-material-surface-container-lowest p-3"
                    : "bg-material-primary-container p-3"
                }
              >
                <Link
                  href={item.link_path ?? "/crm"}
                  onClick={() =>
                    item.read_at ? undefined : void markRead(item.id)
                  }
                  className="block"
                >
                  <p className="text-sm font-bold text-foreground">
                    {titleForKey(item.title_key)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </Link>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-muted">No notifications.</p>
          )}
        </div>
        <Link
          href="/crm"
          className="block border-t border-material-outline-variant p-3 text-center text-xs font-bold text-material-primary"
        >
          Open follow-ups
        </Link>
      </div>
    </details>
  );
}
