"use client";

import { useState, type FormEvent } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { ProjectBranch, ProjectGovernorate } from '@/lib/intake/projectBranch';
import type { SalesFlow } from '@/lib/workflow/types';
import { isQuotationCurtainRateEditable, isQuotationSystemRateEditable, quotationCurtainMinimumRate, QUOTATION_SYSTEM_RATE_MIN, QUOTATION_DISCOUNTS_ENABLED, type CatalogItem } from '@/lib/workflow/pricing';
import { DocumentHeader, DocumentParties, DocumentPaper, OpeningSchedule } from './CommercialDocument';
import { api, button, card, field, Notice, Workspace } from './ui';

type SharedQuotationData = {
  offlineQuotation?: { pending: boolean; recordedAt: string; error?: string };
  project: {
    project_name: string;
    project_number: string;
    address: string;
    branch?: ProjectBranch | null;
    governorate?: ProjectGovernorate | null;
    sales_status: string;
    additional_openings_state?: 'requested' | 'submitted' | null;
  };
  client: { name: string; mobile: string };
  catalog: CatalogItem[];
  flow: SalesFlow | null;
};

type RateRow = { id: string; rate: number; minimum: number; quantity: number; editable: boolean };

export function SharedQuotationPrices({ projectId, data, reload, error: resourceError = '' }: {
  projectId: string;
  data: SharedQuotationData;
  reload: () => Promise<void>;
  error?: string;
}) {
  const { term, formatMoney, formatNumber } = useI18n();
  const { flow, project } = data;
  const quotation = flow?.quotation;
  const systemRows: RateRow[] = (quotation?.lines ?? []).map(line => {
    const product = data.catalog.find(item => item.id === line.system.id);
    const curtain = line.opening.opening_type === 'Curtain Wall' && isQuotationCurtainRateEditable(product);
    return {
      id: line.opening.id, rate: line.system.rate, quantity: line.system.quantity,
      minimum: curtain ? quotationCurtainMinimumRate(quotation?.pricingPolicy) : QUOTATION_SYSTEM_RATE_MIN,
      editable: isQuotationSystemRateEditable(product) || curtain,
    };
  });
  const additionalRows: RateRow[] = (quotation?.additionalItems ?? []).map(item => ({
    id: item.id, rate: item.rate, quantity: item.quantity,
    minimum: quotationCurtainMinimumRate(quotation?.pricingPolicy),
    editable: isQuotationCurtainRateEditable(data.catalog.find(product => product.id === item.id)),
  }));
  const [systemRates, setSystemRates] = useState<Record<string, string>>(() => Object.fromEntries(systemRows.map(row => [row.id, String(row.rate)])));
  const [additionalRates, setAdditionalRates] = useState<Record<string, string>>(() => Object.fromEntries(additionalRows.map(row => [row.id, String(row.rate)])));
  const [replaceUnsignedContract, setReplaceUnsignedContract] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = !flow || !!project.additional_openings_state
    || ['contract_signed', 'transferred_to_operations', 'cancelled', 'lost', 'closed'].includes(project.sales_status)
    || !!flow.signed_at || !!flow.evidence || !!flow.accepted_at || !!flow.accepted_by
    || !['quotation', 'approved', 'contract'].includes(flow.stage);
  const hasChanges = systemRows.some(row => Number(systemRates[row.id]) !== row.rate)
    || additionalRows.some(row => Number(additionalRates[row.id]) !== row.rate);
  function invalid(row: RateRow, value: string) {
    const rate = Number(value);
    return value.trim() === '' || !Number.isSafeInteger(rate) || rate <= 0
      || rate > Math.floor(Number.MAX_SAFE_INTEGER / Math.max(row.quantity, 1))
      || rate !== row.rate && (!row.editable || rate < row.minimum);
  }
  const invalidRates = systemRows.some(row => invalid(row, systemRates[row.id] ?? ''))
    || additionalRows.some(row => invalid(row, additionalRates[row.id] ?? ''));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!flow || locked || busy || invalidRates || !hasChanges || flow.stage === 'contract' && !replaceUnsignedContract) return;
    setBusy(true); setError('');
    try {
      await api(`/api/sales-flow/${projectId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-shared-prices', revision: flow.revision,
          systemRates: systemRows.map(row => ({ openingId: row.id, rate: Number(systemRates[row.id]) })),
          additionalRates: additionalRows.map(row => ({ id: row.id, rate: Number(additionalRates[row.id]) })),
          replaceUnsignedContract,
        }),
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete request.');
    } finally { setBusy(false); }
  }

  function rateInput(row: RateRow, value: string, label: string, change: (value: string) => void) {
    if (!row.editable) return <p className="mt-3 text-sm font-semibold text-slate-700">{term('Unit price')}: {formatMoney(row.rate)}</p>;
    const inputInvalid = invalid(row, value);
    return <label className="mt-4 block text-sm font-medium text-slate-700">
      {label}
      <input aria-label={label} type="number" inputMode="numeric" required min={Math.min(row.minimum, row.rate)}
        max={Math.floor(Number.MAX_SAFE_INTEGER / Math.max(row.quantity, 1))} step={1}
        disabled={locked || busy} value={value} aria-invalid={inputInvalid || undefined}
        onChange={event => change(event.target.value)} className={field} />
      <span className={`mt-2 block text-xs ${inputInvalid ? 'text-red-700' : 'text-slate-500'}`}>
        {term('Minimum price: {rate}', { rate: formatMoney(row.minimum) })}
      </span>
    </label>;
  }

  const reference = `QT-${project.project_number}-R${quotation?.version ?? 1}`;
  return <Workspace title={term('Quotation')} description={term('Shared quotation · Price editing')}>
    <Notice error={error || resourceError} />
    {data.offlineQuotation?.pending && <aside role="status" className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><p className="font-semibold">{term('Quotation saved on this device. It will sync when connected.')}</p>{data.offlineQuotation.error && <a className="mt-1 inline-block min-h-11 py-2 font-semibold text-blue-700 underline print:hidden" href={`#quotation-sync-review-${projectId}`}>{term('Review saved quotation')}</a>}</aside>}
    <section className={`${card} mb-6`} aria-label={term('Project details')}>
      <p className="text-xs font-semibold text-blue-700"><bdi>{project.project_number}</bdi>{project.branch && <> · {term(project.branch)}</>}</p>
      <h2 className="mt-2 break-words text-xl font-semibold text-slate-900" dir="auto">{project.project_name}</h2>
      <p className="mt-2 break-words text-sm text-slate-600" dir="auto">{data.client.name}</p>
      {project.address && <p className="mt-2 break-words text-sm text-slate-600" dir="auto">{project.address}</p>}
    </section>
    {!quotation ? <p role="status" className={card}>{term('No saved quotation is available for this project.')}</p> : <>
      <form onSubmit={event => void save(event)} aria-label={term('Shared quotation prices')} className={`${card} mb-7 print:hidden`}>
        <h2 className="text-lg font-semibold text-slate-900">{term('Quotation prices')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{term('Saving creates a new revision and requires new client approval. Previous documents remain in history.')}</p>
        {locked && <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{term(project.additional_openings_state ? 'Complete the additional measurements and save a quotation revision before continuing.' : 'This quotation is read-only.')}</p>}
        {!locked && !QUOTATION_DISCOUNTS_ENABLED && quotation.discount?.percent === 5 && <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{term('This saved quotation includes a 5% discount. Saving a revision will remove the discount.')}</p>}
        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
          {quotation.lines.map((line, index) => <section key={line.opening.id} data-shared-opening-id={line.opening.id} className="min-w-0 rounded-md border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">{term('Opening {number}', { number: formatNumber(index + 1) })} · {term(line.opening.opening_type)}</h3>
            <p className="mt-1 break-words text-sm text-slate-600">{term(line.opening.floor)} · {term(line.opening.room)}</p>
            <p className="mt-2 text-xs text-slate-500"><bdi>{formatNumber(line.opening.width)} × {formatNumber(line.opening.height)}</bdi> {term('cm')} · {term('Quantity')}: {formatNumber(line.opening.quantity ?? 1)}</p>
            <p className="mt-3 break-words text-sm text-slate-700">{term(line.system.name)}</p>
            {rateInput(systemRows[index], systemRates[line.opening.id] ?? '', term('System price for opening {number}', { number: formatNumber(index + 1) }), value => setSystemRates(rates => ({ ...rates, [line.opening.id]: value })))}
          </section>)}
          {(quotation.additionalItems ?? []).map((item, index) => <section key={item.id} data-shared-item-id={item.id} className="min-w-0 rounded-md border border-slate-200 p-4">
            <h3 className="break-words font-semibold text-slate-900">{term(item.name)}</h3>
            <p className="mt-2 text-xs text-slate-500">{term('Quantity')}: {formatNumber(item.quantity)} {term(item.unit)}</p>
            {rateInput(additionalRows[index], additionalRates[item.id] ?? '', term('Unit price for {name}', { name: term(item.name) }), value => setAdditionalRates(rates => ({ ...rates, [item.id]: value })))}
          </section>)}
        </div>
        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-600">{term('Currently saved:')}</p><p aria-label={term('Saved quotation total')} className="text-xl font-semibold text-slate-900">{formatMoney(quotation.total)}</p></div>
          {!locked && flow.stage === 'contract' && <label className="mt-5 flex items-start gap-3 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900"><input type="checkbox" disabled={busy} checked={replaceUnsignedContract} onChange={event => setReplaceUnsignedContract(event.target.checked)} className="mt-1" />{term('Replace the unsigned contract. The previous document will be kept in history, and the revised quotation must be approved before a new contract can be generated.')}</label>}
          <button type="submit" disabled={locked || busy || invalidRates || !hasChanges || flow.stage === 'contract' && !replaceUnsignedContract} className={`${button} mt-5 w-full sm:w-auto`}>{term(busy ? 'Saving…' : 'Save revised quotation')}</button>
        </div>
      </form>
      <DocumentPaper><DocumentHeader kind="Quotation" number={reference} createdAt={quotation.createdAt} /><DocumentParties client={data.client} project={{ number: project.project_number, address: project.address, branch: project.branch, governorate: project.governorate }} /><OpeningSchedule quote={quotation} /></DocumentPaper>
    </>}
  </Workspace>;
}
