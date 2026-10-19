"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useI18n } from '@/components/i18n/I18nProvider';
import { followUpTypeLabel, type FollowUpEntry, type FollowUpHistory } from '@/lib/workflow/followUps';
import { useFollowUpHistory } from './useFollowUpHistory';
import { Notice, secondary } from './ui';

export function FollowUpHistoryTable({ entries }: { entries: FollowUpEntry[] }) {
  const { term, formatDateTime } = useI18n();
  const label = useId();
  return <>
    <p id={label} className="follow-up-table-hint mb-2 text-xs text-slate-500">{term('Newest follow-up first. Swipe horizontally to see all columns.')}</p>
    <div role="region" aria-label={term('Follow-up history')} aria-describedby={label} tabIndex={0} className="follow-up-table-scroll max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      <table className="follow-up-table w-full min-w-[840px]! max-w-none! border-collapse text-start text-sm">
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

export function FollowUpPrintButton({ history, cached = false, disabled = false }: {
  history: FollowUpHistory | null;
  cached?: boolean;
  disabled?: boolean;
}) {
  const { term, formatDateTime, formatNumber, direction, locale } = useI18n();
  const [snapshot, setSnapshot] = useState<{ history: FollowUpHistory; cached: boolean; printedAt: string } | null>(null);
  const [error, setError] = useState('');
  const reportId = useId();
  useEffect(() => {
    const finished = () => setSnapshot(null);
    window.addEventListener('afterprint', finished);
    return () => window.removeEventListener('afterprint', finished);
  }, []);

  async function print() {
    if (!history || disabled || snapshot) return;
    setError('');
    // Mount only the selected project's report before opening the browser dialog.
    flushSync(() => setSnapshot({ history, cached, printedAt: new Date().toISOString() }));
    try {
      await document.fonts.ready;
      if (document.getElementById(reportId)) window.print();
    } catch {
      setSnapshot(null);
      setError('Unable to open the print dialog. Please try again.');
    }
  }

  return <>
    <button type="button" disabled={!history || disabled || !!snapshot} onClick={() => void print()} className={`${secondary} inline-flex items-center justify-center gap-2 print:hidden`}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg>
      {term(snapshot ? 'Preparing print…' : 'Print follow-ups')}
    </button>
    {error && <p role="alert" className="text-sm text-red-700">{term(error)}</p>}
    {snapshot && createPortal(<section id={reportId} className="follow-up-print-document" dir={direction} lang={locale} aria-label={term('Project follow-ups')}>
      <header className="mb-5 border-b-2 border-slate-700 pb-4">
        <p className="text-sm font-semibold text-slate-600">{term('Alumex Experts')}</p>
        <h1 className="mt-1 text-xl font-semibold">{term('Project follow-ups')}</h1>
        <h2 className="mt-3 break-words text-base font-semibold">{snapshot.history.project.project_name}</h2>
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-xs">
          <div><dt className="inline font-semibold">{term('Project number')}: </dt><dd className="inline"><bdi>{snapshot.history.project.project_number}</bdi></dd></div>
          <div><dt className="inline font-semibold">{term('Total follow-ups')}: </dt><dd className="inline">{formatNumber(snapshot.history.entries.length)}</dd></div>
          <div><dt className="inline font-semibold">{term('Printed at')}: </dt><dd className="inline">{formatDateTime(snapshot.printedAt)}</dd></div>
        </dl>
        <p className="mt-2 text-xs">{snapshot.history.project.next_follow_up_at ? term('Next follow-up: {date}', { date: formatDateTime(snapshot.history.project.next_follow_up_at) }) : term('No follow-up scheduled yet.')}</p>
      </header>
      {snapshot.cached && <p className="mb-3 text-xs">{term('Showing history saved on this device and pending notes. Connect to see the latest updates.')}</p>}
      <FollowUpHistoryTable entries={snapshot.history.entries}/>
    </section>, document.body)}
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
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h4 id={heading} className="text-sm font-semibold text-slate-900">{term('Follow-up history')}{data && <span className="ms-2 font-normal text-slate-500">{formatNumber(data.entries.length)}</span>}</h4>
      <FollowUpPrintButton history={data} cached={cached} disabled={loading || !!error}/>
    </div>
    <Notice error={error}/>
    {loading ? <p className="text-xs text-slate-500">{term('Loading follow-ups…')}</p> : data && <>{cached && <p className="mb-3 text-xs text-amber-800">{term('Showing history saved on this device and pending notes. Connect to see the latest updates.')}</p>}<FollowUpHistoryTable entries={data.entries}/></>}
  </section>;
}
