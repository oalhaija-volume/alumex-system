"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { followUpTypeLabel, type FollowUpEntry } from '@/lib/workflow/followUps';
import { useFollowUpHistory } from './useFollowUpHistory';
import { Notice } from './ui';

export function FollowUpHistoryTable({ entries }: { entries: FollowUpEntry[] }) {
  const { term, formatDateTime } = useI18n();
  const label = useId();
  return <>
    <p id={label} className="mb-2 text-xs text-slate-500">{term('Newest follow-up first. Swipe horizontally to see all columns.')}</p>
    <div role="region" aria-label={term('Follow-up history')} aria-describedby={label} tabIndex={0} className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      <table className="w-full min-w-[840px]! max-w-none! border-collapse text-start text-sm">
        <caption className="sr-only">{term('Follow-up history')}</caption>
        <thead className="sticky top-0 z-10 bg-slate-100 text-xs text-slate-700"><tr>{['Recorded at', 'Activity', 'Follow-up note', 'Recorded by', 'Responsible employee', 'Next follow-up'].map(column => <th key={column} scope="col" className="px-3 py-3 text-start font-semibold">{term(column)}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{!entries.length ? <tr><td colSpan={6} className="px-3 py-5 text-slate-500"><p className="max-w-xs">{term('No follow-ups recorded yet. Save a follow-up note in Mini CRM to start this history.')}</p></td></tr> : entries.map(entry => <tr key={entry.id} className="align-top odd:bg-white even:bg-slate-50">
          <td className="w-40 px-3 py-3 text-xs leading-5 text-slate-600">{entry.recordedAt ? <time dateTime={entry.recordedAt}>{formatDateTime(entry.recordedAt)}</time> : term('Original date not recorded')}{entry.pending && <span className="mt-2 block rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">{term('Saved on device · Pending sync')}</span>}</td>
          <td className="w-36 px-3 py-3 font-medium text-slate-800">{term(entry.action === 'cancel-project' ? 'Cancelled by client' : entry.action === 'reactivate-project' ? 'Project reactivated' : entry.action === 'ready' ? 'Site marked ready' : entry.action === 'assign-measurements' ? 'Measurements assigned' : entry.action === 'snapshot' ? 'Previously saved note' : followUpTypeLabel(entry.followUpType))}{entry.followUpType === 'other' && entry.followUpDetail && <p dir="auto" className="mt-1 break-words text-xs font-normal text-slate-600">{entry.followUpDetail}</p>}</td>
          <td className="min-w-60! max-w-sm px-3 py-3"><p dir="auto" className="whitespace-pre-wrap break-words leading-6 text-slate-800">{entry.note || '—'}</p></td>
          <td className="w-32 px-3 py-3 text-slate-700">{['Employee', 'Not recorded'].includes(entry.recordedBy) ? term(entry.recordedBy) : entry.recordedBy}</td>
          <td className="w-36 px-3 py-3 text-slate-700">{(entry.action === 'ready' || entry.action === 'assign-measurements' ? entry.assignedOutdoorSales : entry.followUpOwner) ?? term('Not recorded')}</td>
          <td className="w-40 px-3 py-3 text-xs leading-5 text-slate-600">{entry.nextFollowUp ? <time dateTime={entry.nextFollowUp}>{formatDateTime(entry.nextFollowUp)}</time> : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

export function ProjectFollowUps({ projectId }: { projectId: string }) {
  const { term, formatNumber } = useI18n();
  const container = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const heading = useId();
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const { data, error, loading, cached } = useFollowUpHistory(projectId, visible);
  return <section ref={container} aria-labelledby={heading} className="min-w-0 border-t border-slate-200 px-4 py-5 sm:px-5">
    <h4 id={heading} className="mb-3 text-sm font-semibold text-slate-900">{term('Follow-up history')}{data && <span className="ms-2 font-normal text-slate-500">{formatNumber(data.entries.length)}</span>}</h4>
    <Notice error={error}/>
    {loading ? <p className="text-xs text-slate-500">{term('Loading follow-ups…')}</p> : data && <>{cached && <p className="mb-3 text-xs text-amber-800">{term('Showing history saved on this device and pending notes. Connect to see the latest updates.')}</p>}<FollowUpHistoryTable entries={data.entries}/></>}
  </section>;
}
