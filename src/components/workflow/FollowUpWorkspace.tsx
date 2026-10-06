"use client";
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { activeFieldUser,readFieldState,updateFieldState } from '@/lib/offline/store';
import { isFieldOnline,prepareOffline } from '@/lib/offline/client';
import type { FollowUpEntry,FollowUpHistory } from '@/lib/workflow/followUps';
import { card,Notice,Workspace } from './ui';
function date(value:string){return new Date(value).toLocaleString();}
export function FollowUpWorkspace({projectId}:{projectId:string}){
 const [data,setData]=useState<FollowUpHistory|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [cached,setCached]=useState(false);
 useEffect(()=>{let active=true;const controller=new AbortController();
  async function load(){
   try{
    let saved=await readFieldState();if(!saved&&isFieldOnline())saved=await prepareOffline().catch(()=>null);const account=activeFieldUser();let history=saved?.followUpHistories?.[projectId];let fromCache=true;
    if(isFieldOnline()){
     let response:Response|null=null;try{response=await fetch(`/api/projects/${projectId}/follow-ups`,{cache:'no-store',signal:controller.signal});}catch{ /* Use downloaded history when unreachable. */ }
     if(response){
      if(!response.ok){const result=await response.json();throw new Error(result.error??'Unable to load follow-ups.');}
      history=await response.json() as FollowUpHistory;fromCache=false;
      if(saved&&account&&activeFieldUser()===account){const snapshot=history;await updateFieldState(account,state=>({...state!,followUpHistories:{...state?.followUpHistories,[projectId]:snapshot}}));}
     }
    }
    saved=await readFieldState();if(account!==activeFieldUser())return;
    const localProject=saved?.projects.find(p=>p.id===projectId);
    const pending:FollowUpEntry[]=(saved?.queue??[]).filter(c=>c.projectId===projectId&&['follow-up','ready'].includes(c.action)).map(c=>({id:c.id,action:c.action==='ready'?'ready':'follow-up',note:typeof c.payload.note==='string'?c.payload.note:'',nextFollowUp:typeof c.payload.nextFollowUp==='string'?c.payload.nextFollowUp:null,recordedAt:c.recordedAt,recordedBy:saved!.actor.name,pending:true}));
    if(!history&&localProject)history={project:localProject,entries:[]};
    if(!history)throw new Error('Connect to the internet to download this project’s follow-up history.');
    const pendingIds=new Set(pending.map(e=>e.id));const entries=[...pending,...history.entries.filter(e=>!pendingIds.has(e.id))].sort((a,b)=>(b.recordedAt??'').localeCompare(a.recordedAt??''));
    if(active){setData({...history,project:pending.length&&localProject?localProject:history.project,entries});setCached(fromCache);setError('');}
   }catch(e){if(active)setError((e as Error).message);}finally{if(active)setLoading(false);}
  }
  void load();window.addEventListener('online',load);
  return()=>{active=false;controller.abort();window.removeEventListener('online',load);};
 },[projectId]);
 return <Workspace title="Project follow-ups" description="The history of follow-up notes and site readiness updates for this project."><div className="mb-6 flex flex-wrap gap-5 text-sm font-semibold text-blue-600"><Link href="/mini-crm">← Follow-ups</Link><Link href="/projects">All projects</Link></div><Notice error={error}/>{loading?<p>Loading follow-ups…</p>:data&&<><section className={`${card} mb-6`}><p className="text-xs font-semibold text-blue-600">{data.project.project_number}</p><h2 className="mt-2 text-xl font-semibold">{data.project.project_name}</h2><p className="mt-3 text-sm text-slate-600">{data.project.structure_readiness==='ready'?'Site ready for measurements':data.project.next_follow_up_at?`Next follow-up: ${date(data.project.next_follow_up_at)}`:'No follow-up scheduled yet.'}</p></section>{cached&&<p role="status" className="mb-5 text-sm text-amber-800">Showing history saved on this device and pending notes. Connect to see the latest updates.</p>}{!data.entries.length?<div className={card}>No follow-ups recorded yet. Save a follow-up note in Mini CRM to start this history.</div>:<ol className="space-y-4">{data.entries.map(entry=><li key={entry.id} className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{entry.action==='ready'?'Site marked ready':entry.action==='snapshot'?'Previously saved note':'Follow-up recorded'}</h3>{entry.pending&&<span className="rounded bg-amber-50 px-3 py-1 text-xs text-amber-800">Saved on device · Pending sync</span>}</div><p className="mt-2 text-xs text-slate-500">{entry.recordedAt?date(entry.recordedAt):'Original date not recorded'} · {entry.recordedBy}</p>{entry.note&&<p dir="auto" className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">{entry.note}</p>}{entry.nextFollowUp&&<p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">Scheduled follow-up: {date(entry.nextFollowUp)}</p>}</li>)}</ol>}</>}</Workspace>;
}
