"use client";

import { useI18n } from '@/components/i18n/I18nProvider';
import { useFieldState } from './useFieldState';

export function QuotationSyncStatus({ projectId }: { projectId: string }) {
  const state = useFieldState();
  const { term, formatDateTime } = useI18n();
  const operation = state?.quotations?.queue.find(item => item.projectId === projectId);
  if (!operation) return null;
  return <aside aria-label={term('Quotation synchronization')} className="my-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
    <p role="status" className="font-semibold">{term('Quotation saved on this device. It will sync when connected.')}</p>
    <p><time dateTime={operation.recordedAt}>{formatDateTime(operation.recordedAt)}</time></p>
    {operation.error && <a className="inline-block min-h-11 py-2 font-semibold text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 print:hidden" href={`#quotation-sync-review-${projectId}`}>{term('Review saved quotation')}</a>}
  </aside>;
}
