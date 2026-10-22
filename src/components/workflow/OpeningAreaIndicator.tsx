"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { openingAreaBand,openingMinimumSellingRate,openingSellingBand } from '@/lib/workflow/pricing';
import type { MeasuredOpening } from '@/lib/workflow/pricing';

const areaBands = [
 {band:'red',label:'Red · ≤3 m²'},
 {band:'orange',label:'Orange · >3 to <4 m²'},
 {band:'yellow',label:'Yellow · 4 to <6 m²'},
 {band:'green',label:'Green · ≥6 m²'},
] as const;

export function OpeningAreaLegend() {
 const {term}=useI18n();
 return <div className="opening-area-legend mb-4 space-y-2 text-xs" aria-label={term('Area color guide (per opening)')}>
  <p className="font-medium text-slate-600">{term('Area color guide (per opening)')}</p>
  <ul className="flex flex-wrap gap-2">{areaBands.map(({band,label})=><li key={band} className={`opening-area-badge opening-area-${band}`}>{term(label)}</li>)}</ul>
 </div>;
}

type SellingOpening = Pick<MeasuredOpening,'opening_type'|'opening_direction'>;
const sellingTargets:ReadonlyArray<{area:number;label:string;opening?:SellingOpening}> = [
 {area:3,label:'Sliding · ≤3 m² · {rate} / m²'},
 {area:3.5,label:'Sliding · >3 to <4 m² · {rate} / m²'},
 {area:4,label:'Sliding · 4 to <6 m² · {rate} / m²'},
 {area:6,label:'Sliding · ≥6 m² · {rate} / m²'},
 {area:1,label:'Hinged window · all sizes · {rate} / m²',opening:{opening_type:'Window',opening_direction:'Hinged'}},
 {area:1,label:'Hinged door · all sizes · {rate} / m²',opening:{opening_type:'Door',opening_direction:'Hinged'}},
];

export function OpeningSellingLegend() {
 const {term,formatMoney}=useI18n();
 return <div className="opening-area-legend mb-4 space-y-2 text-xs" aria-label={term('Selling price targets (per opening)')}>
  <p className="font-medium text-slate-600">{term('Selling price targets (per opening)')}</p>
  <ul className="flex flex-wrap gap-2">{sellingTargets.map(({area,label,opening})=><li key={label} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">{term(label,{rate:formatMoney(openingMinimumSellingRate(area,opening))})}</li>)}</ul>
  <p className="leading-5 text-slate-600">{term('Green means the system rate meets the opening target for its size or type. Red, orange and yellow mean the rate is below its selling target.')}</p>
  <p className="leading-5 text-slate-600">{term('Applies to Alumex systems priced per m². Glass and add-ons are priced separately.')}</p>
 </div>;
}

export function OpeningAreaBadge({area,rate,opening}:{area:number;rate?:number;opening?:SellingOpening}) {
 const {term,formatNumber,formatMoney}=useI18n();
 const band=rate===undefined?openingAreaBand(area):openingSellingBand(area,rate,opening);
 const label=rate===undefined?term(areaBands.find(item=>item.band===band)!.label):term(band==='green'?'Green target met':'Below selling target');
 const title=rate===undefined?label:`${label} · ${term('System rate: {rate} / m²',{rate:formatMoney(rate)})} · ${term('Minimum rate for green: {rate} / m²',{rate:formatMoney(openingMinimumSellingRate(area,opening))})}`;
 return <span className={`opening-area-badge flex-wrap gap-x-1.5 opening-area-${band}`} title={title}>
  <span>{term('Each opening: {area} m²',{area:formatNumber(area)})}</span>{rate===undefined?<span className="sr-only"> · {label}</span>:<span>· {label}</span>}
 </span>;
}
