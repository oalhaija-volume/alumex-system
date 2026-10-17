"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import Link from 'next/link';
import { catalogGroups,catalogKind,catalogUsage } from '@/lib/workflow/catalogRules';
import { useState } from 'react';
import type { CatalogItem } from '@/lib/workflow/pricing';
import { api,button,card,field,Notice,useResource,Workspace } from './ui';

export function CatalogWorkspace({canEdit=false}:{canEdit?:boolean}){
 const {term,formatNumber}=useI18n();
 const {data,setData,error,setError,loading}=useResource<{items:CatalogItem[]}>('/api/catalog');
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const changes=(data?.items??[]).filter(item=>drafts[item.id]!==undefined&&(drafts[item.id].trim()===''||Number(drafts[item.id])!==Number(item.unit_price))).map(item=>({id:item.id,price:Number(drafts[item.id])}));
 const invalid=(value:string)=>value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0.01||Number(value)>1e10;
 function edit(id:string,value:string){setDrafts(current=>({...current,[id]:value}));setNotice('');setError('');}
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!canEdit||!changes.length)return;
  setError('');setNotice('');
  if(changes.some(change=>invalid(drafts[change.id]))){setError('Enter a positive price for every changed item.');return;}
  setBusy(true);
  try{
   const result=await api<{prices:{id:string;price:number}[]}>('/api/catalog',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes})});
   const saved=new Map(result.prices.map(change=>[change.id,change.price]));
   setData(current=>current?{items:current.items.map(item=>saved.has(item.id)?{...item,unit_price:saved.get(item.id)!}:item)}:current);
   setDrafts({});setNotice('All changed prices saved. Existing quotations and contracts retain their agreed prices.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <Workspace title={term('Price catalog')} description={term('Preset prices in IQD. New quotations use these rates; saved quotations and signed contracts keep their original prices.')}>
  {loading?<p>{term('Loading catalog…')}</p>:<form onSubmit={event=>void save(event)} noValidate className="space-y-8">
   <p className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">{term('Skylights are priced in the dedicated calculator.')} <Link href="/skylight" className="font-semibold underline">{term('Open skylight calculator')}</Link></p>
   {catalogGroups.map(group=>{
    const items=data?.items.filter(item=>catalogKind(item)===group.kind)??[];
    return items.length?<section key={group.kind} aria-label={term(group.label)} className="space-y-3">
     <div><h2 className="text-lg font-semibold">{term(group.label)}</h2><p className="mt-1 text-sm text-slate-500">{term(group.description)}</p></div>
     {items.map(item=>{
      const value=drafts[item.id]??String(item.unit_price);
      const changed=changes.some(change=>change.id===item.id);
      return <div key={item.id} className={`${card} grid items-end gap-4 sm:grid-cols-[1fr_180px] ${changed?'border-blue-300':''}`}>
       <div><h3 className="font-semibold">{term(item.name)}</h3><p className="mt-1 text-sm text-slate-500">{term('per')} {term(item.unit)}{!item.is_active?` · ${term('Inactive')}`:''}</p><p className="mt-2 text-xs leading-5 text-slate-500">{term(catalogUsage(item))}</p>{Number(value)<0.01&&<p className="mt-2 text-sm text-amber-700">{term('Price required before quoting')}</p>}</div>
       <label className="text-sm">{term('Price (IQD)')}<input disabled={!canEdit||busy} aria-label={term('{name} price',{name:term(item.name)})} aria-invalid={changed&&invalid(value)} type="number" min="0.01" max="10000000000" step="0.01" value={value} onChange={event=>edit(item.id,event.target.value)} className={field}/></label>
      </div>;
     })}
    </section>:null;
   })}
   {canEdit&&<div className="sticky bottom-4 z-20 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
    <Notice error={error}/>
    {notice&&<p role="status" className="mb-3 text-sm text-green-700">{term(notice)}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-slate-600">{changes.length?term('Changed prices: {count}',{count:formatNumber(changes.length)}):term('No unsaved price changes')}</p><button disabled={busy||!changes.length} type="submit" className={`${button} w-full sm:w-auto`}>{busy?term('Saving…'):term('Save all changes')}</button></div>
   </div>}
  </form>}
  {!canEdit&&<Notice error={error}/>}
 </Workspace>;
}
