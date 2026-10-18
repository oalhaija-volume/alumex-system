"use client";
/* eslint-disable @next/next/no-img-element -- Saved field images use bounded local data URLs. */
import {useState} from 'react';
import {useI18n} from '@/components/i18n/I18nProvider';
import {normalizeSkylightCapture,type RegistrationOpening} from '@/lib/measurements/registrationOpening';
import {activeFieldUser,readFieldState,updateFieldState} from '@/lib/offline/store';

export function SkylightCapturePreview({projectId,opening,number}:{projectId:string;opening:RegistrationOpening;number:number}){
 const {term,formatNumber}=useI18n();
 const [capture,setCapture]=useState(opening.skylight),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function open(){
  if(expanded){setExpanded(false);return;}setExpanded(true);if(capture)return;
  setBusy(true);setError('');const account=activeFieldUser();
  try{
   const cached=(await readFieldState(account))?.openings.find(o=>o.id===opening.id&&o.projectId===projectId)?.skylight;
   if(account!==activeFieldUser())return;
   if(cached){setCapture(cached);return;}
   if(!navigator.onLine)throw Error('Connect once to download this skylight photo and drawing.');
   const response=await fetch(`/api/skylight-capture/${projectId}/${opening.id}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Unable to load skylight details.');
   const value=normalizeSkylightCapture((await response.json()).skylight);
   if(!value)throw Error('Unable to load skylight details.');
   if(account!==activeFieldUser())return;
   setCapture(value);
   if(account)await updateFieldState(account,state=>{
    if(!state)throw Error('Account unavailable.');
    return {...state,openings:state.openings.map(o=>o.id===opening.id&&o.projectId===projectId?{...o,skylight:value}:o)};
   }).catch(()=>setError('Photo loaded, but device storage is unavailable for offline use.'));
  }catch(cause){setError(cause instanceof Error&&cause.message.startsWith('Connect once')?cause.message:'Unable to load skylight details.');}
  finally{setBusy(false);}
 }
 return <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
  <button type="button" disabled={busy} aria-expanded={expanded} onClick={()=>void open()} className="min-h-11 text-start text-sm font-semibold text-blue-800">{term('Skylight shape and measurements')} · {term('Opening')} {formatNumber(number)}</button>
  {expanded&&<div className="mt-3 space-y-4">
   {busy&&<p role="status">{term('Loading…')}</p>}
   {error&&<p role="alert" className="text-sm text-amber-800">{term(error)}</p>}
   {capture?.photo&&<figure><img src={capture.photo} alt={term('Skylight site photo')} className="max-h-[480px] w-full rounded-md object-contain"/><figcaption className="mt-2 text-sm text-slate-600">{term('Skylight site photo')}</figcaption></figure>}
   {capture?.drawing&&<figure><img src={capture.drawing} alt={term('Skylight shape drawing')} className="w-full rounded-md border border-slate-200"/><figcaption className="mt-2 text-sm text-slate-600">{term('Skylight shape drawing')}</figcaption></figure>}
   {!!capture?.sections.length&&<dl className="space-y-2">{capture.sections.map((section,index)=><div key={index} className="flex flex-wrap justify-between gap-2 rounded-md bg-slate-50 p-3 text-sm"><dt>{term('Section')} {section.label}</dt><dd>{term('Width × length (cm)')}: <bdi>{formatNumber(section.width)} × {formatNumber(section.length)}</bdi></dd></div>)}</dl>}
  </div>}
 </section>;
}
