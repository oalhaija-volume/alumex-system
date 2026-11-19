"use client";

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { MeasuredOpening } from '@/lib/workflow/pricing';
import type { OpeningSizeChange } from '@/lib/workflow/openingSizeChanges';
import { button, field, secondary } from './ui';

export type OpeningSizePreview = { openingTotal: number; quotationTotal: number };

export function OpeningSizeEditor({ opening, change, currentPreview, preview, onApply, onCancel }: {
  opening: MeasuredOpening;
  change?: OpeningSizeChange;
  currentPreview?: OpeningSizePreview;
  preview: (change: OpeningSizeChange) => OpeningSizePreview | undefined;
  onApply: (change: OpeningSizeChange) => void;
  onCancel: () => void;
}) {
  const { term, formatNumber, formatMoney, errorMessage } = useI18n();
  const [width, setWidth] = useState(String(change?.width ?? opening.width));
  const [height, setHeight] = useState(String(change?.height ?? opening.height));
  const [quantity, setQuantity] = useState(String(change?.quantity ?? opening.quantity ?? 1));
  const [reason, setReason] = useState(change?.reason ?? '');
  const [splitOpeningId] = useState(() => change?.splitOpeningId ?? crypto.randomUUID());
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState('');
  const widthInput = useRef<HTMLInputElement>(null);
  useEffect(() => { widthInput.current?.focus({ preventScroll: true }); }, []);

  const originalQuantity = opening.quantity ?? 1;
  const validDimension = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0.01 && Number(value) <= 100000 && Number(Number(value).toFixed(2)) === Number(value);
  const widthError = !validDimension(width) ? 'Enter a size between 0.01 and 100,000 cm, with at most two decimal places.' : '';
  const heightError = !validDimension(height) ? 'Enter a size between 0.01 and 100,000 cm, with at most two decimal places.' : '';
  const quantityError = !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > originalQuantity ? 'Enter a whole-number count within the number of identical openings.' : '';
  const reasonError = !reason.trim() ? 'Enter a reason for the size change.' : reason.trim().length > 500 ? 'Keep the size-change reason within 500 characters.' : '';
  const unchanged = !widthError && !heightError && Number(width) === Number(opening.width) && Number(height) === Number(opening.height);
  const candidate: OpeningSizeChange = {
    openingId: opening.id, previousWidth: Number(opening.width), previousHeight: Number(opening.height), previousQuantity: originalQuantity,
    width: Number(width), height: Number(height), quantity: Number(quantity), reason: reason.trim(),
    ...(Number(quantity) < originalQuantity ? { splitOpeningId } : {}),
  };
  const updatedPreview = !widthError && !heightError && !quantityError && !unchanged ? preview({ ...candidate, reason: candidate.reason || 'Size preview' }) : undefined;
  const id = `opening-size-${opening.id}`;
  const touchedError = (name: string, error: string) => touched[name] && error;
  const touch = (name: string) => setTouched(values => ({ ...values, [name]: true }));
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ width: true, height: true, quantity: true, reason: true });
    if (widthError || heightError || quantityError || reasonError || unchanged) {
      if (widthError || unchanged) widthInput.current?.focus();
      else if (heightError) document.getElementById(`${id}-height`)?.focus();
      else if (quantityError) document.getElementById(`${id}-quantity`)?.focus();
      else if (reasonError) document.getElementById(`${id}-reason`)?.focus();
      return;
    }
    try { onApply(candidate); } catch (cause) { setSaveError((cause as Error).message); }
  }

  return <form aria-label={term('Edit opening size')} noValidate onSubmit={apply} className="mt-4 space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4 sm:p-5">
    <div><h3 className="font-semibold text-slate-900">{term('Edit opening size')}</h3><p className="mt-1 text-sm leading-6 text-slate-700">{term('The original measurements stay in history. Apply this size to the draft, then save the quotation.')}</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium text-slate-800" htmlFor={`${id}-width`}>{term('Width (cm)')}<input ref={widthInput} id={`${id}-width`} aria-label={term('Width (cm)')} name="width" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={width} onChange={event => setWidth(event.target.value)} onBlur={() => touch('width')} aria-invalid={!!touchedError('width', widthError)} aria-describedby={touchedError('width', widthError) ? `${id}-width-error` : undefined} className={field}/>{touchedError('width', widthError) && <span id={`${id}-width-error`} className="mt-2 block text-sm text-red-700">{term(widthError)}</span>}</label>
      <label className="block text-sm font-medium text-slate-800" htmlFor={`${id}-height`}>{term('Height (cm)')}<input id={`${id}-height`} aria-label={term('Height (cm)')} name="height" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={height} onChange={event => setHeight(event.target.value)} onBlur={() => touch('height')} aria-invalid={!!touchedError('height', heightError)} aria-describedby={touchedError('height', heightError) ? `${id}-height-error` : undefined} className={field}/>{touchedError('height', heightError) && <span id={`${id}-height-error`} className="mt-2 block text-sm text-red-700">{term(heightError)}</span>}</label>
    </div>
    {originalQuantity > 1 && <div><label className="block text-sm font-medium text-slate-800" htmlFor={`${id}-quantity`}>{term('Number of openings to resize')}<input id={`${id}-quantity`} aria-label={term('Number of openings to resize')} name="quantity" required type="number" inputMode="numeric" min={1} max={originalQuantity} step={1} value={quantity} onChange={event => setQuantity(event.target.value)} onBlur={() => touch('quantity')} aria-invalid={!!touchedError('quantity', quantityError)} aria-describedby={`${id}-quantity-help${touchedError('quantity', quantityError) ? ` ${id}-quantity-error` : ''}`} className={`${field} sm:max-w-xs`}/></label>{touchedError('quantity', quantityError) && <p id={`${id}-quantity-error`} className="mt-2 text-sm text-red-700">{term(quantityError)}</p>}<p id={`${id}-quantity-help`} className="mt-2 text-sm font-medium text-blue-900">{!quantityError && (Number(quantity) === originalQuantity ? term('This changes all {count} openings.', { count: formatNumber(originalQuantity) }) : term('This changes {count} of {total} openings. The remaining {remaining} keep their current size.', { count: formatNumber(Number(quantity)), total: formatNumber(originalQuantity), remaining: formatNumber(originalQuantity - Number(quantity)) }))}</p></div>}
    <label className="block text-sm font-medium text-slate-800" htmlFor={`${id}-reason`}>{term('Reason for size change')}<textarea id={`${id}-reason`} aria-label={term('Reason for size change')} name="reason" required maxLength={500} rows={2} value={reason} onChange={event => setReason(event.target.value)} onBlur={() => touch('reason')} aria-invalid={!!touchedError('reason', reasonError)} aria-describedby={`${id}-reason-help${touchedError('reason', reasonError) ? ` ${id}-reason-error` : ''}`} className={field}/>{touchedError('reason', reasonError) && <span id={`${id}-reason-error`} className="mt-2 block text-sm text-red-700">{term(reasonError)}</span>}</label>
    <p id={`${id}-reason-help`} className="text-xs leading-5 text-slate-600">{term('Record why the dimensions changed, for example a confirmed site correction or a client request.')}</p>
    {!widthError && !heightError && !quantityError && <div className="rounded-md border border-blue-100 bg-white p-4 text-sm text-slate-700">
      <p className="font-medium">{term('Size comparison')}: <bdi dir="ltr"><bdi dir="ltr">{formatNumber(Number(opening.width))} × {formatNumber(Number(opening.height))} {term('cm')}</bdi> → <bdi dir="ltr">{formatNumber(Number(width))} × {formatNumber(Number(height))} {term('cm')}</bdi></bdi></p>
      <p className="mt-2">{term('Area per opening')}: <bdi dir="ltr">{formatNumber(Number(opening.width) * Number(opening.height) / 10000)} → {formatNumber(Number(width) * Number(height) / 10000)}</bdi> {term('m²')}</p>
      {updatedPreview && <dl className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2"><div><dt className="text-xs">{term('Opening total before / after')}</dt><dd className="mt-1 break-words font-semibold text-slate-900"><bdi dir="ltr">{currentPreview && <><bdi dir="ltr">{formatMoney(currentPreview.openingTotal)}</bdi>{' → '}</>}<bdi dir="ltr">{formatMoney(updatedPreview.openingTotal)}</bdi></bdi></dd></div><div><dt className="text-xs">{term('Quotation total before / after')}</dt><dd aria-label={term('Size change quotation total')} className="mt-1 break-words font-semibold text-blue-900"><bdi dir="ltr">{currentPreview && <><bdi dir="ltr">{formatMoney(currentPreview.quotationTotal)}</bdi>{' → '}</>}<bdi dir="ltr">{formatMoney(updatedPreview.quotationTotal)}</bdi></bdi></dd></div></dl>}
      {!updatedPreview && !unchanged && <p className="mt-3 text-sm text-slate-700">{term('Complete the quotation selections to preview the revised prices.')}</p>}
      <p className="mt-3 text-xs leading-5 text-slate-600">{term('Prices include existing minimum billing rules and size-based accessories. Negotiated rates are kept.')}</p>
    </div>}
    {unchanged && (touched.width || touched.height) && <p role="status" className="text-sm text-amber-900">{term('Change the width or height before applying a size change.')}</p>}
    {saveError && <p role="alert" className="text-sm text-red-700">{errorMessage(saveError)}</p>}
    <div className="flex flex-wrap gap-3"><button className={button}>{term('Apply size to draft')}</button><button type="button" className={secondary} onClick={onCancel}>{term('Cancel size edit')}</button></div>
  </form>;
}
