"use client";
import { useI18n } from "@/components/i18n/I18nProvider";
import { fieldFetch } from '@/lib/offline/client';
import { useEffect,useState } from 'react';
export const field='mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100';
export const button='min-h-12 rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:bg-blue-700';
export const secondary='min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
export const card='rounded-lg border border-slate-200 bg-white p-5 sm:p-7';
export async function api<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await (url==='/api/workspace'?fieldFetch:fetch)(url,{cache:'no-store',...init});const data=await response.json();if(!response.ok)throw new Error(data.error??'Unable to complete request.');return data;
}
export function useResource<T>(url:string){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();let version=0;let timer:ReturnType<typeof setTimeout>;
  async function refresh(){const current=++version;try{const result=await api<T>(url,{signal:controller.signal});if(!controller.signal.aborted&&current===version){setData(result);setError('');}}catch(e){if(!controller.signal.aborted&&current===version)setError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}}
  function changed(){clearTimeout(timer);timer=setTimeout(()=>void refresh(),150);}
  void refresh();
  if(url==='/api/workspace'){window.addEventListener('field-change',changed);window.addEventListener('focus',changed);}
  return()=>{controller.abort();clearTimeout(timer);window.removeEventListener('field-change',changed);window.removeEventListener('focus',changed);};
 },[url]);
 async function reload(){setData(await api<T>(url));}
 return {data,setData,error,setError,loading,reload};
}
export function Workspace({title,description,children}:{title:string;description:string;children:React.ReactNode}){const {term}=useI18n();return <section className="sales-document mx-auto max-w-5xl px-5 py-9 sm:px-8 sm:py-12 print:max-w-none print:p-0"><h1 className="text-3xl font-semibold tracking-tight print:hidden">{term(title)}</h1><p className="mt-3 mb-8 text-sm leading-6 text-slate-500 print:hidden">{term(description)}</p>{children}</section>;}
export function Notice({error}:{error:string}){const {errorMessage}=useI18n();return error?<div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage(error)}</div>:null;}
export function useNow(){
 const [now,setNow]=useState(0);
 useEffect(()=>{const refresh=()=>setNow(Date.now());const first=setTimeout(refresh,0);const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearTimeout(first);clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
 return now;
}
