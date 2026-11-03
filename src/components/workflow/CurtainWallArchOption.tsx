"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { CURTAIN_WALL_ARCH_PRICE } from '@/lib/workflow/pricing';

export function CurtainWallArchOption({checked,onChange,quantity=1}:{checked:boolean;onChange:(checked:boolean)=>void;quantity?:number}) {
 const {term,formatMoney,formatNumber}=useI18n();
 return <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
   <input type="checkbox" aria-label={term('Arch / قوس')} checked={checked} onChange={event=>onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-blue-600"/>
   <span className="flex flex-1 flex-wrap items-center justify-between gap-2"><span>{term('Arch / قوس')}</span><span className="text-blue-900">+ {formatMoney(CURTAIN_WALL_ARCH_PRICE)}</span></span>
  </label>
  <p className="mt-1 text-xs leading-5 text-slate-600">{term('Charged once per curtain wall, independently of its area.')}</p>
  {checked&&quantity>1&&<p className="mt-1 text-xs font-semibold text-slate-700">{term('Arch total: {count} × {price} = {total}',{count:formatNumber(quantity),price:formatMoney(CURTAIN_WALL_ARCH_PRICE),total:formatMoney(CURTAIN_WALL_ARCH_PRICE*quantity)})}</p>}
 </div>;
}
