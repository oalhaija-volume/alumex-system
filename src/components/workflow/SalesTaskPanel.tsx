"use client";
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { SalesWorkspaceData } from '@/lib/offline/types';
import { assignedFollowUps,dueFollowUps,measurementTasks } from '@/lib/workflow/salesTasks';
import { followUpTypeLabel } from '@/lib/workflow/followUps';
import { card } from './ui';

export function SalesTaskPanel({data,now}:{data:SalesWorkspaceData;now:number}){
 const {term,formatDateTime,formatNumber}=useI18n();
 const tasks=measurementTasks(data.projects,data.actor);
 const followUps=assignedFollowUps(data.projects,data.actor);
 const due=dueFollowUps(data.projects,data.actor,now);
 const outdoor=data.actor?.role==='Outdoor Sales';
 return <div className="mb-8 space-y-6">
  {(outdoor||data.actor?.role==='Admin')&&<section id="measurement-tasks" aria-label={term('Measurement tasks')} className={card}>
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{term(outdoor?'My measurement tasks':'Measurement tasks')}</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">{formatNumber(tasks.length)}</span></div>
   <p className="mt-2 text-sm text-slate-500">{term('Ready sites assigned for initial measurements. Completed measurements leave this list automatically.')}</p>
   {!tasks.length?<p className="mt-5 text-sm text-slate-500">{term('No measurement tasks waiting.')}</p>:<ul className="mt-4 divide-y divide-slate-200">{tasks.map(p=><li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-xs text-slate-500">{term(p.project_number)}</p><h3 className="mt-1 font-semibold">{p.project_name}</h3><p className="mt-1 text-sm text-slate-500">{p.address}</p><p className="mt-1 text-xs text-slate-500">{term('Created by')} {p.registeredBy==='Employee'?term('Employee'):p.registeredBy} · {p.assignedOutdoorSales??term('Not assigned')}</p></div><Link href={`/initial-measurements/${p.id}`} className="min-h-11 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white">{term('Record measurements')}</Link></li>)}</ul>}
  </section>}
  {!outdoor&&<section aria-label={term('Follow-up reminders')} className={card}>
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{term('Follow-up reminders')}</h2><span role="status" className={`rounded-full px-3 py-1 text-sm font-semibold ${due.length?'bg-amber-50 text-amber-800':'bg-slate-100 text-slate-600'}`}>{term('{count} due',{count:formatNumber(due.length)})}</span></div>
   <p className="mt-2 text-sm text-slate-500">{term('Due reminders stay here until the next follow-up is recorded or the sales process is complete.')}</p>
   {!followUps.length?<p className="mt-5 text-sm text-slate-500">{term('No follow-ups scheduled for you.')}</p>:<ul className="mt-4 divide-y divide-slate-200">{followUps.map(p=><li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-xs text-slate-500">{term(p.project_number)}</p><h3 className="mt-1 font-semibold">{p.project_name}</h3><p className="mt-1 text-sm">{term(followUpTypeLabel(p.follow_up_type))}{p.follow_up_type==='other'&&p.follow_up_detail?` · ${p.follow_up_detail}`:''}</p><p className={`mt-1 text-sm ${Date.parse(p.next_follow_up_at!)<=now?'font-semibold text-amber-800':'text-slate-500'}`}>{term(Date.parse(p.next_follow_up_at!)<=now?'Due now':'Upcoming')} · {formatDateTime(p.next_follow_up_at!)}</p><p className="mt-1 text-xs text-slate-500">{term('Responsible Indoor Sales')}: {p.followUpOwner??term('Not assigned')}</p></div><Link href={`/mini-crm#project-${p.id}`} className="min-h-11 rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-blue-700">{term('Record follow-up')}</Link></li>)}</ul>}
  </section>}
 </div>;
}
