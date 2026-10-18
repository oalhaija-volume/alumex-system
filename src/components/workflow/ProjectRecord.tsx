"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { useEffect,useState } from 'react';
import type { FieldProject } from '@/lib/offline/types';
import { fieldFetch } from '@/lib/offline/client';
export function ProjectRecord({projectId,inactive=false}:{projectId:string;inactive?:boolean}){
 const { term,formatDateTime } = useI18n();
 const [project,setProject]=useState<FieldProject|null>(null);const [error,setError]=useState(false);
 useEffect(()=>{const controller=new AbortController();fieldFetch('/api/workspace',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();setProject(data.projects.find((p:FieldProject)=>p.id===projectId)??null);}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[projectId]);
 if(error)return <p className="mb-5 text-sm text-amber-800 print:hidden">{term("Unable to load the project creator and assignment. Refresh to try again.")}</p>;
 if(!project)return null;
 return <section aria-label={term("Project record")} className="my-5 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2 print:hidden"><div><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term("Created by")}</h2><p className="mt-2 font-semibold text-slate-900">{project.registeredBy==='Employee'?term('Employee'):project.registeredBy}</p>{project.branch&&<p className="mt-1 font-medium text-slate-700">{term(project.branch==='Karkh'?'From Karkh':'From Rasafa')}</p>}{project.original_creator_role&&<p className="mt-1 text-slate-600">{term(project.original_creator_role)}</p>}<time dateTime={project.created_at} dir="ltr" className="mt-1 block text-xs text-slate-500 w-fit max-w-full">{formatDateTime(project.created_at)}</time></div><div><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term(inactive||project.measurement_delayed||project.client_cancelled_at?'Last assigned for measurements':'Measurements by')}</h2><p className="mt-2 font-semibold text-slate-900">{project.assignedOutdoorSales??term("Not assigned")}</p>{project.assignedToYou&&!inactive&&!project.measurement_delayed&&!project.client_cancelled_at&&<p className="mt-1 text-blue-700">{term("Assigned to you for measurements")}</p>}</div></section>;
}
