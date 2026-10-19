'use client';
import { isOfflineDevice } from '@/lib/offline/device';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldState } from '@/lib/offline/types';
import { isFieldOnline } from '@/lib/offline/client';
import { measurementTasks } from '@/lib/workflow/salesTasks';

function subscribe(callback: () => void) {
  window.addEventListener('measurement-alerts-read', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('measurement-alerts-read', callback);
    window.removeEventListener('storage', callback);
  };
}
const serverSnapshot = () => '[]';

export function MeasurementNotifications({ state }: { state: FieldState }) {
  const { term, formatNumber } = useI18n();
  const key = `alumex-measurement-alerts:${state.actor.id}`;
  const saved = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? '[]'; } catch { return '[]'; }
  }, serverSnapshot);
  let read: string[] = [];
  try { const parsed: unknown = JSON.parse(saved); if (Array.isArray(parsed)) read = parsed.filter((id): id is string => typeof id === 'string'); } catch { /* Ignore damaged local preferences. */ }
  const tasks = measurementTasks(state.projects, state.actor);
  const unread = tasks.filter(project => !read.includes(project.measurement_assignment_id??project.id));
  function markRead() {
    try {
      localStorage.setItem(key, JSON.stringify([...new Set([...read, ...tasks.map(project => project.measurement_assignment_id??project.id)])]));
      window.dispatchEvent(new Event('measurement-alerts-read'));
    } catch { /* Tasks remain visible if storage is unavailable. */ }
  }
  if (!unread.length) return null;
  return <section aria-label={term('New measurement assignments')} className="border-b border-blue-200 bg-blue-50 px-5 py-4 print:hidden">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="font-semibold text-blue-950">{term(unread.length===1?'{count} new measurement assignment':'{count} new measurement assignments', { count: formatNumber(unread.length) })}</p>
        <button type="button" onClick={markRead} className="min-h-11 text-sm font-semibold text-blue-800 underline">{term('Mark as read')}</button>
      </div>
      <ul className="mt-2 divide-y divide-blue-200">{unread.map(project => <li key={project.id}>
        <Link href={`/initial-measurements/${project.id}`} onClick={event=>{if(isOfflineDevice()&&!isFieldOnline()){event.preventDefault();window.location.assign(`/offline?project=${project.id}`);}}} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-3 text-sm text-blue-950">
          <span><span className="font-semibold">{project.project_name}</span> · {project.project_number}</span><span className="font-semibold underline">{term('Record measurements')}</span>
        </Link>
      </li>)}</ul>
    </div>
  </section>;
}
