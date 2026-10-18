"use client";
import {useI18n} from '@/components/i18n/I18nProvider';
import {FieldLogoutButton} from '@/components/offline/FieldLogoutButton';
import {measurementTasks} from '@/lib/workflow/salesTasks';
import type {SalesWorkspaceData} from '@/lib/offline/types';

export function OutdoorWorkspaceNav({state,path,onNavigate}:{state:Pick<SalesWorkspaceData,'actor'|'projects'>|null;path:string;onNavigate:(path:string)=>void}){
 const {term,formatNumber}=useI18n();
 const count=state?measurementTasks(state.projects,state.actor).length:0;
 return <nav aria-label={term('Outdoor Sales workspace')} className="mx-auto flex max-w-5xl flex-wrap gap-3 px-5 pt-5 print:hidden">
  {[['/dashboard','Measurement assignments'],['/intake','New project']].map(([href,label])=><button type="button" key={href} onClick={()=>onNavigate(href)} aria-current={path===href?'page':undefined} className={`relative min-h-12 rounded-md px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 ${path===href?'bg-blue-600 text-white':'border border-slate-300 bg-white text-slate-700'}`}>
   {term(label)}
   {href==='/dashboard'&&count>0&&<span role="status" aria-label={term('{count} measurement tasks waiting',{count:formatNumber(count)})} className="absolute -end-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white ring-2 ring-white"><span aria-hidden="true">{count>99?`${formatNumber(99)}+`:formatNumber(count)}</span></span>}
  </button>)}
  <FieldLogoutButton formClassName="ms-auto" className="min-h-12 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:opacity-60" />
 </nav>;
}
