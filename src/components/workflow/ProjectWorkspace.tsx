"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldProject,SalesWorkspaceData } from '@/lib/offline/types';
import { followUpFormValues } from './FollowUpFields';
import { ProjectFollowUps } from './ProjectFollowUps';
import { MiniCRM } from './MiniCRM';
import { canAccessCRM } from '@/lib/auth/permissions';
import Link from 'next/link';
import { stageDetails,projectLink } from '@/lib/workflow/stages';
import { deleteOnlineProject } from '@/lib/offline/client';
import { useState } from 'react';
import { api,button,card,Notice,useResource,useNow,Workspace } from './ui';
type Project=FieldProject;
export function ProjectWorkspace({followUps=false,canDelete=false}:{followUps?:boolean;canDelete?:boolean}){
 const { term,formatDateTime } = useI18n();
 const {data,error,setError,loading,reload}=useResource<SalesWorkspaceData>('/api/workspace');const [busy,setBusy]=useState('');const [notice,setNotice]=useState('');const now=useNow();
 async function update(p:Project,action:string,form?:HTMLFormElement){setBusy(p.id);setError('');setNotice('');const values=form?(action==='follow-up'?followUpFormValues(form):{assignedOutdoorSalesId:new FormData(form).get('assignedOutdoorSalesId')}):{};try{const result=await api<{pending?:boolean}>('/api/workspace',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:p.id,action,...values})});await reload();setNotice(action==='ready'||action==='assign-measurements'?result.pending?'Measurement assignment saved on this device. The employee will be notified after sync.':'Measurements assigned. The employee will see the task in their mobile workspace.':'Follow-up saved.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function remove(p:Project){
  if(!window.confirm(term('Delete {number} — {name}?\n\nThis permanently removes its measurements, follow-ups, quotation and contract. The client record is kept. This cannot be undone.',{number:p.project_number,name:p.project_name})))return;
  setBusy(p.id);setError('');setNotice('');
  try{const result=await deleteOnlineProject(p.id);await reload();setNotice(result.cleanupPending?'Project deleted. Signed-file cleanup is pending.':'Project deleted.');}catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 if(followUps&&!loading&&!canAccessCRM(data?.actor.role))return <Notice error="CRM access is limited to Indoor Sales and company leadership."/>;
 if(followUps)return <MiniCRM data={data} error={error} notice={notice} loading={loading} busy={busy} now={now} canDelete={canDelete} onUpdate={update} onDelete={remove}/>;
 const projects=data?.projects??[];
 return <Workspace title="Projects" description="Every client project, its current step, and the employee who registered it.">
  <Notice error={error}/>
  {notice&&<p role="status" className="mb-5 text-green-700">{term(notice)}</p>}
  <Link href="/intake" className={`${button} mb-6 inline-block`}>{term("New client & project")}</Link>
  {loading?<p>{term("Loading projects…")}</p>:!projects.length?<div className={card}>{term("No projects yet. Start by registering a client.")}</div>:<div className="space-y-4">{projects.map(p=><article key={p.id} id={`project-${p.id}`} className={`${card} scroll-mt-5`}>
   <div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-semibold text-blue-600">{term(p.project_number)}{p.pending?` · ${term('Saved on device')}`:''}</p><h2 className="mt-2 text-xl font-semibold">{p.project_name}</h2><p className="mt-2 text-sm text-slate-600">{p.address}</p></div><span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{term(stageDetails(p).label)}</span></div>
   {p.readiness_note&&<p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700"><span className="font-semibold">{term('Reason not ready for measurement')}: </span><span dir="auto">{p.readiness_note}</span></p>}
   {p.phone&&<a dir="ltr" href={`tel:${p.phone}`} className="mt-3 inline-block text-sm font-medium text-blue-600">{p.phone}</a>}
   <p className="mt-4 text-xs text-slate-500">{term("Created by")} {p.registeredBy==='Employee'?term('Employee'):p.registeredBy}{p.original_creator_role?` (${term(p.original_creator_role)})`:""} · {formatDateTime(p.created_at)}</p>
   <p className="mt-2 text-sm text-slate-600">{term('Outdoor Sales')}: {p.assignedOutdoorSales??term("Not assigned")}</p>
   {p.assignedToYou&&<p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">{term('Assigned to you')} · {term(stageDetails(p).action)}</p>}
   <Link href={projectLink(p,canAccessCRM(data?.actor.role))} className="mt-5 inline-block py-2 text-sm font-semibold text-blue-600">{term("Open project →")}</Link>
   <div className="mt-3 flex flex-wrap gap-5">{canAccessCRM(data?.actor.role)&&<Link href={`/projects/${p.id}/follow-ups`} className="inline-block min-h-11 py-2 text-sm font-semibold text-blue-600">{term("View follow-up history →")}</Link>}</div>
   {canDelete&&<div className="mt-4 border-t border-slate-100 pt-3"><button type="button" disabled={!!busy||p.pending} onClick={()=>void remove(p)} className="min-h-11 rounded-md px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">{busy===p.id?term("Please wait…"):term("Delete project")}</button>{p.pending&&<span className="block text-xs text-slate-500">{term("Sync saved changes before deleting.")}</span>}</div>}
   {canAccessCRM(data?.actor.role)&&<ProjectFollowUps projectId={p.id}/>}
  </article>)}</div>}
 </Workspace>;
}
