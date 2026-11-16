"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { agreement2027PaymentSchedule } from '@/lib/contracts/agreement2027Content';

export function ContractPaymentPreview({total,kind}:{total:number;kind:'residential'|'commercial'}) {
 const {term,formatMoney,formatNumber}=useI18n();
 const stages=agreement2027PaymentSchedule(total,kind);
 const fullAdvance=kind==='commercial'&&stages.length===1&&stages[0].percent===100;
 return <section aria-label={term('Payment schedule preview')} className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:p-5">
  <div className="flex flex-wrap items-baseline justify-between gap-3">
   <h3 className="font-semibold text-slate-900">{term('Payment schedule preview')}</h3>
   <p className="text-sm text-slate-600">{term('Approved quotation total')}: <strong className="text-slate-900">{formatMoney(total)}</strong></p>
  </div>
  {fullAdvance&&<p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-900">{term('Commercial contracts below 15,000,000 IQD require 100% at signing.')}</p>}
  <ol className="space-y-3">{stages.map(stage=><li key={stage.id} data-contract-payment-stage={stage.id} data-percent={stage.percent} data-amount={stage.amount} className="rounded-md border border-slate-200 bg-white p-4">
   <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-slate-900">
    <span>{term(stage.label)} · <bdi>{formatNumber(stage.percent)}%</bdi></span>
    <bdi>{formatMoney(stage.amount)}</bdi>
   </div>
   <p className="mt-2 text-sm leading-6 text-slate-600">{term(stage.trigger)}</p>
  </li>)}</ol>
 </section>;
}
