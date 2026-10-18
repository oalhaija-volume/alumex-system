"use client";
/* eslint-disable @next/next/no-img-element -- Saved field photos use bounded data URLs. */
import {useEffect,useState} from 'react';
import {useI18n} from '@/components/i18n/I18nProvider';
import {activeFieldUser,readFieldState,updateFieldState} from '@/lib/offline/store';
import {isDeviceWorkspace,isFieldOnline} from '@/lib/offline/client';
import {retainMeasurementReport,type MeasurementReport} from '@/lib/measurements/completion';
export function MeasurementReports({projectId}:{projectId:string}){
 const {term,formatDateTime}=useI18n();const [reports,setReports]=useState<MeasurementReport[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState<string|null>(null);
 useEffect(()=>{
  let live=true,version=0;const controller=new AbortController();
  async function refresh(){
   const current=++version;const account=activeFieldUser(),cached=await readFieldState(account).catch(()=>null);
   if(!live||current!==version||account!==activeFieldUser())return;
   const saved=(cached?.measurementReports??[]).filter(r=>r.project_id===projectId);setReports(saved);
   if(isDeviceWorkspace()||!isFieldOnline()||cached?.queue.some(c=>c.projectId===projectId))return;
   try{
    const response=await fetch(`/api/measurement-reports/${projectId}`,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error();const data=await response.json();
    if(live&&current===version&&account===activeFieldUser())setReports((data.reports??[]).map((r:MeasurementReport)=>retainMeasurementReport(r,saved)));
   }catch{if(live&&current===version&&!controller.signal.aborted)setError('Unable to load measurement notes.');}
  }
  void refresh();window.addEventListener('field-change',refresh);
  return()=>{live=false;controller.abort();window.removeEventListener('field-change',refresh);};
 },[projectId]);
 async function loadPhoto(report:MeasurementReport){
  const account=activeFieldUser();setBusy(report.id);setError('');
  try{
   if(!isFieldOnline())throw Error('Connect once to download this measurement photo.');
   const response=await fetch(`/api/measurement-reports/${projectId}?report=${report.id}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Unable to load measurement photo.');
   const {photo}=await response.json();if(typeof photo!=='string')throw Error('Unable to load measurement photo.');
   if(account!==activeFieldUser())return;
   setReports(current=>current.map(r=>r.id===report.id?{...r,photo}:r));
   if(account)await updateFieldState(account,state=>{if(!state)throw Error('Account unavailable.');return {...state,measurementReports:[...(state.measurementReports??[]).filter(r=>r.id!==report.id),{...report,photo}]};}).catch(()=>setError('Photo loaded, but device storage is unavailable for offline use.'));
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to load measurement photo.');}finally{setBusy(null);}
 }
 if(!reports.length&&!error)return null;
 return <section aria-label={term('Measurement notes and photos')} className="my-5 space-y-4 rounded-lg border border-slate-200 bg-white p-5 print:hidden">
  <h2 className="font-semibold text-slate-900">{term('Measurement notes and photos')}</h2>
  {error&&<p role="alert" className="text-sm text-amber-800">{term(error)}</p>}
  {[...reports].sort((a,b)=>Date.parse(b.recorded_at)-Date.parse(a.recorded_at)).map(report=><article key={report.id} className="space-y-3 border-t border-slate-100 pt-3 text-sm">
   <p className="text-slate-500"><bdi>{report.recorded_by_name}</bdi> · <time dateTime={report.recorded_at} dir="ltr">{formatDateTime(report.recorded_at)}</time></p>
   {report.note&&<p className="whitespace-pre-wrap break-words text-slate-800">{report.note}</p>}
   {report.photo?<img src={report.photo} alt={term('Measurement site photo')} className="max-h-80 w-full rounded-md object-contain"/>:report.has_photo&&<button type="button" disabled={busy===report.id} onClick={()=>void loadPhoto(report)} className="min-h-11 font-semibold text-blue-700">{term(busy===report.id?'Loading…':'View site photo')}</button>}
  </article>)}
 </section>;
}
