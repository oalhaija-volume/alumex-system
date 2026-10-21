"use client";
import { OutdoorWorkspaceNav } from '@/components/workflow/OutdoorWorkspaceNav';
import { isPhoneRequest, isMobileWorkspaceRoute } from '@/lib/auth/mobileAccess';
import { MobileOutdoorProvider } from '@/components/workflow/MobileOutdoorContext';
import { OutdoorMobileWorkspace } from '@/components/workflow/OutdoorMobileWorkspace';
import { OutdoorProjectLog } from '@/components/workflow/OutdoorProjectLog';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { canAccessCRM,isCRMRoute,canPrepareQuotation } from '@/lib/auth/permissions';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useEffect,useState } from 'react';
import { OutdoorIntake } from '@/components/intake/OutdoorIntake';
import { InitialMeasurements } from '@/components/measurements/InitialMeasurements';
import { FollowUpWorkspace } from '@/components/workflow/FollowUpWorkspace';
import { SalesReminders } from '@/components/workflow/SalesReminders';
import { SalesDashboard } from '@/components/workflow/SalesDashboard';
import { ProjectWorkspace } from '@/components/workflow/ProjectWorkspace';
import { SyncConflicts } from "./SyncConflicts";
import { OfflineStatus } from './OfflineStatus';
import { readFieldState } from '@/lib/offline/store';
import { isOfflineDevice } from '@/lib/offline/device';
import type { FieldState } from '@/lib/offline/types';
export function OfflineWorkspace(){
 const [allowed,setAllowed]=useState(false);
 useEffect(()=>{if(!isOfflineDevice()){window.location.replace('/dashboard');return;}const timer=setTimeout(()=>setAllowed(true),0);return()=>clearTimeout(timer);},[]);
 return allowed?<DeviceWorkspace/>:null;
}
function DeviceWorkspace(){
 const { term } = useI18n();
 const [state,setState]=useState<FieldState|null>(null);const [loaded,setLoaded]=useState(false);const [requestedPath,setPath]=useState('/intake');const [navigationVersion,setNavigationVersion]=useState(0);const [message,setMessage]=useState('');
 useEffect(()=>{let live=true;async function refresh(){const saved=await readFieldState().catch(()=>null);if(live){setState(saved);setLoaded(true);}}const params=new URLSearchParams(location.search);const timer=setTimeout(()=>{const initialPath=params.get('path')??(params.get('project')?'/initial-measurements/'+params.get('project'):'/intake');setPath(initialPath.includes('#')?initialPath:initialPath+location.hash);void refresh();},0);window.addEventListener('field-change',refresh);return()=>{live=false;clearTimeout(timer);window.removeEventListener('field-change',refresh);};},[]);
 const outdoor = state?.actor.role === 'Outdoor Sales';
 const mobileOutdoor = state?.actor.role === 'Outdoor Sales' && isPhoneRequest(new Headers({'user-agent': navigator.userAgent}));
 const basePath=requestedPath.split('#')[0];
 const path = mobileOutdoor && !isMobileWorkspaceRoute(basePath) ? '/dashboard' : basePath;
 useEffect(()=>{
  const fragment=requestedPath.split('#')[1];
  if(!fragment||!/^project-[0-9a-f-]{36}$/i.test(fragment))return;
  function focusProject(){
   const target=document.getElementById(fragment);
   if(!target)return false;
   target.tabIndex=-1;target.scrollIntoView({block:'start'});target.focus({preventScroll:true});
   return true;
  }
  if(focusProject())return;
  const observer=new MutationObserver(()=>{if(focusProject())observer.disconnect();});
  observer.observe(document.body,{childList:true,subtree:true});
  const timer=setTimeout(()=>observer?.disconnect(),15000);
  return()=>{observer?.disconnect();clearTimeout(timer);};
 },[requestedPath,navigationVersion]);
 function navigate(next:string){
  let route=next.split('#')[0];
  if(/^\/(quotation|contract)\//.test(route)&&!canPrepareQuotation(state?.actor.role)){setMessage(term('Measurements submitted. Indoor Sales will prepare the quotation.'));return;}
  if(mobileOutdoor&&!isMobileWorkspaceRoute(route)){next='/dashboard';route=next;}
  if(isCRMRoute(route)&&!canAccessCRM(state?.actor.role)){setMessage(term('CRM access is limited to Indoor Sales and company leadership.'));return;}
  if(/^\/projects\/[0-9a-f-]{36}\/follow-ups$/i.test(route)||/^\/(dashboard|intake|project-log|projects|mini-crm)$/.test(route)||/^\/initial-measurements\/[0-9a-f-]{36}$/i.test(route)){
   setPath(next);setNavigationVersion(version=>version+1);setMessage('');
   const fragment=next.includes('#')?'#'+next.split('#')[1]:'';
   history.replaceState(null,'','/offline?path='+encodeURIComponent(next)+fragment);
  }else if(navigator.onLine&&!state?.queue.length)location.assign(next);
  else setMessage('Quotations and contracts need an internet connection. Your field work stays saved here.');
 }
 const projectId=path.startsWith('/initial-measurements/')?path.split('/')[2]:null;
 return <MobileOutdoorProvider value={mobileOutdoor}><div className="min-h-dvh bg-slate-50 text-slate-900">{loaded&&!outdoor&&<header className="border-b border-slate-200 bg-white px-5 py-5"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4"><span className="text-xl font-semibold">{term("Alumex · Device workspace")}</span><a href="/intake" className="text-sm text-blue-600">{term("Open online system")}</a><div className="flex items-center gap-3"><NotificationCenter compact onNavigate={navigate}/><LanguageSwitcher/></div></div></header>}<OfflineStatus quiet={!loaded||outdoor}/><SalesReminders/>{loaded&&!state?<div className="mx-auto max-w-xl p-8"><h1 className="text-xl font-semibold">{term("Sign in online to prepare this device")}</h1><p className="mt-3 text-sm text-slate-600">{term("Offline work is available after an employee signs in and the device downloads its workspace.")}</p><a href="/login" className="mt-5 inline-block text-blue-600">{term("Sign in")}</a></div>:state?<>{outdoor?<OutdoorWorkspaceNav state={state} path={path} onNavigate={navigate}/>:<nav className="mx-auto flex max-w-5xl flex-wrap gap-2 px-5 pt-5">{[['/dashboard',mobileOutdoor?'Measurement assignments':'Dashboard'],['/intake','New project'],['/projects','Projects'],['/mini-crm','Follow-ups']].filter(([href])=>mobileOutdoor?isMobileWorkspaceRoute(href):href!=='/mini-crm'||canAccessCRM(state.actor.role)).map(([href,label])=><button key={href} onClick={()=>navigate(href)} className={`min-h-11 rounded-md px-4 text-sm font-semibold ${path===href?'bg-blue-600 text-white':'border border-slate-300 bg-white text-slate-700'}`}>{term(label)}</button>)}<span className="w-full py-2 text-xs text-slate-500">{term('Signed in as {name}. Saved changes sync when the app is open and connected. Don’t clear site data while changes are waiting to sync.',{name:state.actor.name==='Employee'?term('Employee'):state.actor.name})}</span></nav>}<SyncConflicts state={state}/>{message&&<p role="alert" className="mx-auto max-w-5xl px-5 pt-4 text-amber-800">{term(message)}</p>}<div onClickCapture={event=>{const link=(event.target as HTMLElement).closest('a[href]');const href=link?.getAttribute('href');if(href?.startsWith('/')&&!href.startsWith('/api/')){event.preventDefault();event.stopPropagation();navigate(href);}}}>{isCRMRoute(path)&&!canAccessCRM(state.actor.role)?<p role="alert" className="mx-auto max-w-5xl p-5 text-sm text-red-700">{term('CRM access is limited to Indoor Sales and company leadership.')}</p>:path==='/dashboard'?(outdoor?<OutdoorMobileWorkspace/>:<SalesDashboard/>):path==='/project-log'&&outdoor?<OutdoorProjectLog/>:/^\/projects\/[^/]+\/follow-ups$/.test(path)?<FollowUpWorkspace key={path} projectId={path.split('/')[2]}/>:projectId?<InitialMeasurements key={projectId} projectId={projectId} role={state.actor.role}/>:path==='/projects'||path==='/mini-crm'?<ProjectWorkspace key={`${requestedPath}:${navigationVersion}`} followUps={path==='/mini-crm'}/>:<OutdoorIntake key={path}/>}</div></>:<p className="p-8">{term("Loading saved workspace…")}</p>}</div></MobileOutdoorProvider>;
}
