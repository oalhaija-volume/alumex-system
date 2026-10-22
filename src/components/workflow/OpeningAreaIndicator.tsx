"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { openingAreaBand } from '@/lib/workflow/pricing';

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

export function OpeningAreaBadge({area}:{area:number}) {
 const {term,formatNumber}=useI18n();
 const band=openingAreaBand(area);
 const label=areaBands.find(item=>item.band===band)!.label;
 return <span className={`opening-area-badge opening-area-${band}`} title={term(label)}>
  {term('Each opening: {area} m²',{area:formatNumber(area)})}<span className="sr-only"> · {term(label)}</span>
 </span>;
}
