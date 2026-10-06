"use client";
import { useEffect,useState } from 'react';
import type { FieldProject } from '@/lib/offline/types';
import { fieldFetch } from '@/lib/offline/client';
export function ProjectRecord({projectId}:{projectId:string}){
 const [project,setProject]=useState<FieldProject|null>(null);const [error,setError]=useState(false);
 useEffect(()=>{const controller=new AbortController();fieldFetch('/api/workspace',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();setProject(data.projects.find((p:FieldProject)=>p.id===projectId)??null);}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[projectId]);
 if(error)return <p className="mb-5 text-sm text-amber-800 print:hidden">Unable to load the project creator and assignment. Refresh to try again.</p>;
 if(!project)return null;
 return <section aria-label="Project record" className="my-5 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2 print:hidden"><div><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created by</h2><p className="mt-2 font-semibold text-slate-900">{project.registeredBy}</p>{project.original_creator_role&&<p className="mt-1 text-slate-600">{project.original_creator_role}</p>}<p className="mt-1 text-xs text-slate-500">{new Date(project.created_at).toLocaleString()}</p></div><div><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned Outdoor Sales</h2><p className="mt-2 font-semibold text-slate-900">{project.assignedOutdoorSales??'Not assigned'}</p>{project.assignedToYou&&<p className="mt-1 text-blue-700">Assigned to you for measurements</p>}</div></section>;
}
