"use client";
import { useEffect,useState } from 'react';
import { prepareOffline,syncFieldChanges,isFieldOnline } from '@/lib/offline/client';
import { activeFieldUser,readFieldState } from '@/lib/offline/store';
export function OfflineStatus(){
 const [online,setOnline]=useState(true);const [count,setCount]=useState(0);const [error,setError]=useState('');const [ready,setReady]=useState(false);
 useEffect(()=>{
  let mounted=true;
  async function refresh(){const state=await readFieldState().catch(()=>null);if(!mounted)return;setOnline(isFieldOnline());setCount(state?.queue.length??0);setError(state?.queue.find(c=>c.error)?.error??'');setReady(!!state);}
  async function connect(){await refresh();if(navigator.onLine){await syncFieldChanges().catch(()=>{});if(activeFieldUser())await prepareOffline().catch(()=>{});}await refresh();}
  async function setup(){try{if('serviceWorker' in navigator){await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;}await prepareOffline();void navigator.storage?.persist?.().catch(()=>false);await syncFieldChanges();}catch(e){if(mounted)setError(e instanceof Error?e.message:'Offline setup unavailable.');}await refresh();}
  void setup();window.addEventListener('field-change',refresh);window.addEventListener('field-connection',refresh);window.addEventListener('online',connect);window.addEventListener('offline',refresh);window.addEventListener('focus',connect);
  const timer=window.setInterval(()=>void connect(),30000);
  return()=>{mounted=false;clearInterval(timer);window.removeEventListener('field-change',refresh);window.removeEventListener('field-connection',refresh);window.removeEventListener('online',connect);window.removeEventListener('offline',refresh);window.removeEventListener('focus',connect);};
 },[]);
 return <div className="border-b border-slate-200 bg-white px-5 py-3 text-sm print:hidden"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><p role="status" className={error?'text-red-700':!online||count?'text-amber-800':'text-slate-600'}>{!ready?'Preparing offline storage…':count?`${count} change${count===1?'':'s'} saved on this device · ${online?'Sync pending':'Offline'}`:online?'Synced · Offline saving ready':'Offline · Saved work is available on this device'}</p><a href="/offline" className="font-semibold text-blue-600">Device workspace</a></div>{error&&<p role="alert" className="mx-auto mt-2 max-w-5xl text-xs text-red-700">{error} <button onClick={()=>void syncFieldChanges()} className="underline">Retry sync</button></p>}</div>;
}
