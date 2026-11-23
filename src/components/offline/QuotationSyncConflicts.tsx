"use client";

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { canAccessOfflineQuotationDraft, reviewOfflineQuotation, resolveOfflineQuotation } from '@/lib/offline/quotations';
import type { OfflineQuotationReview } from '@/lib/offline/quotationTypes';
import { useFieldState } from './useFieldState';

export function QuotationSyncConflicts() {
  const state = useFieldState();
  const { term, formatMoney, formatDateTime } = useI18n();
  const [review, setReview] = useState<OfflineQuotationReview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const changes = state?.quotations?.queue.filter(operation => operation.error) ?? [];
  const archives = state?.quotations?.archived.filter(archive => canAccessOfflineQuotationDraft(state, archive.operation)) ?? [];
  if (!state || !changes.length && !archives.length) return null;
  const control = 'min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

  async function choose(choice: 'server' | 'rebase') {
    if (!review || busy) return;
    setBusy(review.projectId); setError('');
    try { await resolveOfflineQuotation(review, choice); setReview(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to review saved quotations.'); }
    finally { setBusy(''); }
  }

  return <section aria-label={term(changes.length ? 'Saved quotations need attention' : 'Archived quotation drafts')} className="mx-auto mt-4 max-w-5xl space-y-3 print:hidden">
    {!!changes.length && <h2 className="text-base font-semibold text-amber-900">{term('Saved quotations need attention')}</h2>}
    {changes.map(operation => {
      const accessible = canAccessOfflineQuotationDraft(state, operation);
      const draft = operation.successor?.draft ?? operation.draft;
      return <article key={operation.id} id={`quotation-sync-review-${operation.projectId}`} className="min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <h3 className="break-words font-semibold text-slate-900">{accessible ? <><bdi>{draft.project.project_number}</bdi> · <bdi>{draft.project.project_name}</bdi></> : term('Saved quotation draft')}</h3>
        <p className="mt-2 leading-6 text-red-800">{term(operation.error ?? '')}</p>
        {accessible && <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" disabled={!!busy} className={control} onClick={async () => {
            setBusy(operation.projectId); setError('');
            try { setReview(await reviewOfflineQuotation(operation.projectId)); }
            catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to review saved quotations.'); }
            finally { setBusy(''); }
          }}>{term('Review latest quotation')}</button>
          <button type="button" className={control} onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify({ body: operation.successor?.body ?? operation.body, quotation: draft.flow?.quotation }, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = `saved-quotation-${draft.project.project_number}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>{term('Download saved quotation draft')}</button>
        </div>}
        {accessible && review?.operationId === operation.id && <div className="mt-4 space-y-3 border-t border-amber-200 pt-4">
          <p>{term('Saved draft total')}: <strong>{formatMoney(review.localTotal)}</strong></p>
          <p>{term('Latest server total')}: <strong>{formatMoney(review.latest.flow?.quotation.total ?? 0)}</strong></p>
          <p className="leading-6 text-slate-700">{term('Your original draft is archived on this device when you choose a version.')}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={!!busy} className={control} onClick={() => void choose('server')}>{term('Keep latest server quotation')}</button>
            {review.canRebase && <button type="button" disabled={!!busy} className={control} onClick={() => void choose('rebase')}>{term('Apply reviewed draft to latest quotation')}</button>}
          </div>
          {!review.canRebase && <p className="leading-6 text-slate-700">{term('Quotation specifications changed. Keep the latest version and enter your changes again.')}</p>}
        </div>}
      </article>;
    })}
    {!!archives.length && <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{term('Archived quotation drafts')} · {archives.length}</summary>
      <ul className="mt-2 divide-y divide-slate-100">{archives.map(archive => {
        const draft = archive.operation.successor?.draft ?? archive.operation.draft;
        return <li key={`${archive.operation.id}:${archive.archivedAt}`} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0"><p className="break-words font-semibold"><bdi>{draft.project.project_number}</bdi> · <bdi>{draft.project.project_name}</bdi></p><p className="mt-1 text-slate-600"><time dateTime={archive.archivedAt}>{formatDateTime(archive.archivedAt)}</time> · {formatMoney(draft.flow?.quotation.total ?? 0)}</p></div>
          <button type="button" className={control} onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = `archived-quotation-${draft.project.project_number}-${archive.operation.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>{term('Download archived quotation draft')}</button>
        </li>;
      })}</ul>
    </details>}
    {error && <p role="alert" className="text-sm text-red-700">{term(error)}</p>}
  </section>;
}

