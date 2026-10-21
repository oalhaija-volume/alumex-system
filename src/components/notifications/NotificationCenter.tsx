"use client";

import Link from "next/link";
import { useSyncExternalStore, type MouseEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { dismissNotificationAlert, getNotifications, getServerNotifications, markNotificationsRead, subscribeNotifications } from "@/lib/notifications/client";
import { notificationLink, notificationTitle } from "@/lib/notifications/delivery";

export function NotificationCenter({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: (path: string) => void }) {
  const { term, formatNumber, formatDateTime } = useI18n();
  const { items, unread, role, alert } = useSyncExternalStore(subscribeNotifications, getNotifications, getServerNotifications);
  const fallback = role === "Outdoor Sales" ? "/dashboard" : "/mini-crm";
  function open(event: MouseEvent<HTMLAnchorElement>, item: (typeof items)[number]) {
    dismissNotificationAlert();
    if (!item.read_at) void markNotificationsRead(item.id);
    if (onNavigate) { event.preventDefault(); onNavigate(notificationLink(item, fallback)); }
  }
  return <div className="relative shrink-0 print:hidden">
    <details className="relative open:z-[100]">
      <summary aria-label={term('Notifications, {count} unread', { count: formatNumber(unread) })}
        className={`relative flex h-11 w-11 cursor-pointer list-none items-center justify-center border border-slate-300 bg-white text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden ${compact ? "rounded-full" : "rounded-md"}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
        {unread > 0 && <span aria-hidden="true" className="absolute -end-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-bold text-white">{formatNumber(Math.min(unread, 99))}{unread > 99 ? '+' : ''}</span>}
      </summary>
      <div className="absolute end-0 z-[100] mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white text-start shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <p className="text-sm font-semibold text-slate-900">{term('Notifications')}</p>
          {unread > 0 && <button type="button" onClick={() => void markNotificationsRead()} className="min-h-11 text-xs font-semibold text-blue-700">{term('Mark all read')}</button>}
        </div>
        <div className="max-h-80 divide-y divide-slate-200 overflow-y-auto">
          {items.length ? items.map(item => <Link key={item.id} href={notificationLink(item, fallback)} onClick={event => open(event, item)}
            className={`block min-h-12 px-4 py-3 focus-visible:outline-2 focus-visible:outline-blue-600 ${item.read_at ? 'bg-white' : 'bg-blue-50'}`}>
            <p className="text-sm font-semibold text-slate-900">{term(notificationTitle(item.title_key))}</p>
            {item.payload?.project_name && <p className="mt-1 break-words text-sm text-slate-700">{item.payload.project_name}</p>}
            <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
          </Link>) : <p className="p-4 text-sm text-slate-500">{term('No notifications.')}</p>}
        </div>
      </div>
    </details>
    {alert && <div role="status" aria-live="polite" className="fixed inset-x-4 top-4 z-[110] mx-auto flex max-w-sm items-start gap-2 rounded-lg border border-blue-200 bg-white p-3 text-start shadow-lg">
      <Link href={notificationLink(alert, fallback)} onClick={event => open(event, alert)} className="min-h-11 flex-1 px-1 py-1">
        <p className="text-sm font-semibold text-slate-900">{term(notificationTitle(alert.title_key))}</p>
        {alert.payload?.project_name && <p className="mt-1 break-words text-sm text-slate-600">{alert.payload.project_name}</p>}
      </Link>
      <button type="button" aria-label={term('Dismiss notification')} onClick={dismissNotificationAlert} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-xl text-slate-500 hover:bg-slate-100">×</button>
    </div>}
  </div>;
}
