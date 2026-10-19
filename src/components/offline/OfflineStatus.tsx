"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { useEffect,useState,useSyncExternalStore } from 'react';
import { isOfflineDevice } from '@/lib/offline/device';
import { prepareOffline,syncFieldChanges,isFieldOnline } from '@/lib/offline/client';
import { activeFieldUser,readFieldState } from '@/lib/offline/store';

const subscribeDevice = () => () => {};
export function OfflineStatus({quiet=false}:{quiet?:boolean}){
 const showOffline = useSyncExternalStore(subscribeDevice, isOfflineDevice, () => false);
 const { term,errorMessage,formatNumber,formatDateTime } = useI18n();
 const [online,setOnline]=useState(true);
 const [count,setCount]=useState(0);
 const [error,setError]=useState('');
 const [setupError,setSetupError]=useState('');
 const [shellError,setShellError]=useState('');
 const [ready,setReady]=useState(false);
 const [shellReady,setShellReady]=useState(false);
 const [syncedAt,setSyncedAt]=useState<string|null>(null);
 useEffect(()=>{
  let mounted=true,connecting=false;
  async function refresh(){
   const state=await readFieldState().catch(()=>null);
   if(!mounted)return;
   setOnline(isFieldOnline());setCount(state?.queue.length??0);
   setError(state?.queue.find(c=>c.error)?.error??'');setReady(!!state);setSyncedAt(state?.syncedAt??null);
  }
  async function connect(){
   if(connecting)return;
   connecting=true;
   try{
    await refresh();
    if(navigator.onLine){await syncFieldChanges();if(activeFieldUser())await prepareOffline();}
    if(mounted)setSetupError('');
   }catch(e){if(mounted)setSetupError(e instanceof Error?e.message:'Offline setup unavailable.');}
   finally{connecting=false;await refresh();}
  }
  async function prepareShell(){
   if(!('serviceWorker' in navigator))throw new Error('Offline reopening is unavailable in this browser.');
   // A failed/slow shell installation must never block IndexedDB preparation.
   const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
   const readyRegistration=await navigator.serviceWorker.ready;
   if(mounted)setShellReady(true);
   (registration.active??readyRegistration.active)?.postMessage({type:'REFRESH_OFFLINE_SHELL'});
  }
  async function setup(){
   try{await prepareOffline();void navigator.storage?.persist?.().catch(()=>false);await syncFieldChanges();}
   catch(e){if(mounted)setSetupError(e instanceof Error?e.message:'Offline setup unavailable.');}
   await refresh();
  }
  void refresh();
  if(isOfflineDevice())void prepareShell().catch(()=>{if(mounted)setShellError('Offline reopening is unavailable in this browser.');});
  else if('serviceWorker' in navigator)void navigator.serviceWorker.getRegistration().then(registration=>registration?.update()).catch(()=>{});
  void setup();
  window.addEventListener('field-change',refresh);window.addEventListener('field-connection',refresh);
  window.addEventListener('online',connect);window.addEventListener('offline',refresh);window.addEventListener('focus',connect);
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void connect();},30000);
  return()=>{mounted=false;clearInterval(timer);window.removeEventListener('field-change',refresh);window.removeEventListener('field-connection',refresh);window.removeEventListener('online',connect);window.removeEventListener('offline',refresh);window.removeEventListener('focus',connect);};
 },[]);
 const issue=error||setupError||shellError;
 if(!showOffline)return null;
 const status=!ready?term('Preparing offline storage…'):count?term(count===1?'{count} change saved on this device · {status}':'{count} changes saved on this device · {status}',{count:formatNumber(count),status:term(online?'Sync pending':'Offline')}):!shellReady?term('Saved data ready · Preparing offline reopening…'):online?term('Synced · Offline saving ready'):term('Offline · Saved work is available on this device');
 // Outdoor staff need an alert only when saved work needs attention. Synchronization
 // and shell preparation keep running even when the routine status is not rendered.
 if(quiet)return issue?<div role="alert" className="mx-auto max-w-5xl px-5 pt-4 text-sm text-red-700">{errorMessage(issue)} {error&&<button onClick={()=>void syncFieldChanges()} className="min-h-11 px-2 font-semibold underline">{term('Retry sync')}</button>}</div>:null;
 return <div className="border-b border-slate-200 bg-white px-5 py-3 text-sm print:hidden">
  <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
   <div><p role="status" className={issue?'text-red-700':!online||count?'text-amber-800':'text-slate-600'}>{status}</p>{syncedAt&&<p className="mt-1 text-xs text-slate-500">{term('Last synced')} <time dateTime={syncedAt} dir="ltr" className="inline-block">{formatDateTime(syncedAt)}</time></p>}</div>
   <a href="/offline?path=/dashboard" className="font-semibold text-blue-600">{term('Device workspace')}</a>
  </div>
  {issue&&<p role="alert" className="mx-auto mt-2 max-w-5xl text-xs text-red-700">{errorMessage(issue)} {error&&<button onClick={()=>void syncFieldChanges()} className="underline">{term('Retry sync')}</button>}</p>}
 </div>;
}
