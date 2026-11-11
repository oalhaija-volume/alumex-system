"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import Link from 'next/link';
import { catalogGroups,catalogKind,catalogUsage } from '@/lib/workflow/catalogRules';
import { useEffect,useRef,useState } from 'react';
import type { CatalogItem } from '@/lib/workflow/pricing';
import { api,button,card,field,Notice,secondary,useResource,Workspace } from './ui';

const sectionNameError='Enter an aluminum section name between 1 and 100 characters.';
const sectionPriceError='Enter a positive price up to 10,000,000,000 IQD.';
const validPrice=(value:string)=>value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0.01&&Number(value)<=1e10;
const cleanSectionName=(value:string)=>value.trim().replace(/\s+/g,' ');
const validSectionName=(value:string)=>cleanSectionName(value).length>0&&cleanSectionName(value).length<=100;

function AddAluminumSection({disabled,onBusyChange,onCreated}:{disabled:boolean;onBusyChange:(busy:boolean)=>void;onCreated:(item:CatalogItem)=>void}){
 const {term}=useI18n();
 const [expanded,setExpanded]=useState(false);
 const [name,setName]=useState('');
 const [price,setPrice]=useState('');
 const [busy,setBusy]=useState(false);
 const [errors,setErrors]=useState<{name?:string;price?:string}>({});
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const nameInput=useRef<HTMLInputElement>(null);
 const priceInput=useRef<HTMLInputElement>(null);
 const addButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(expanded)nameInput.current?.focus();},[expanded]);

 function close(){
  setExpanded(false);setName('');setPrice('');setErrors({});setError('');
  requestAnimationFrame(()=>addButton.current?.focus());
 }
 async function create(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||disabled)return;
  const validation={name:validSectionName(name)?undefined:sectionNameError,price:validPrice(price)?undefined:sectionPriceError};
  setErrors(validation);setError('');setNotice('');
  if(validation.name||validation.price){(validation.name?nameInput:priceInput).current?.focus();return;}
  setBusy(true);onBusyChange(true);
  try{
   const response=await fetch('/api/catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:cleanSectionName(name),price:Number(price)})});
   const result=await response.json() as {item?:CatalogItem;error?:string;field?:string};
   if(!response.ok||!result.item){
    const message=result.error??'Unable to add the aluminum section. Try again.';
    if(result.field==='name'||result.field==='price'){
     const target=result.field;
     setErrors({[target]:message});
     requestAnimationFrame(()=>(target==='name'?nameInput:priceInput).current?.focus());
    }else setError(message);
    return;
   }
   onCreated(result.item);close();
   setNotice('Aluminum section added. It is now available in new quotations.');
  }catch{setError('Unable to add the aluminum section. Try again.');}
  finally{setBusy(false);onBusyChange(false);}
 }

 return <section aria-label={term('Add aluminum section')} className={card}>
  <div className="flex flex-wrap items-center justify-between gap-4">
   <div className="min-w-0"><h2 className="text-lg font-semibold">{term('Aluminum sections')}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{term('Add a section with its price per m² for window and door quotations.')}</p></div>
   <button ref={addButton} type="button" disabled={disabled||expanded} aria-expanded={expanded} aria-controls="add-aluminum-section-form" onClick={()=>{setNotice('');setExpanded(true);}} className={`${secondary} w-full sm:w-auto`}>{term('Add aluminum section')}</button>
  </div>
  {notice&&<p role="status" className="mt-4 text-sm text-green-700">{term(notice)}</p>}
  {expanded&&<form id="add-aluminum-section-form" aria-label={term('Add aluminum section')} aria-busy={busy} onSubmit={event=>void create(event)} noValidate className="mt-5 border-t border-slate-200 pt-5">
   <Notice error={error}/>
   <div className="grid gap-4 sm:grid-cols-2">
    <div className="min-w-0"><label htmlFor="aluminum-section-name" className="text-sm font-medium">{term('Section name')}</label>
     <input ref={nameInput} id="aluminum-section-name" required maxLength={100} disabled={busy||disabled} value={name} dir="auto" autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name?'aluminum-section-name-error':undefined} onChange={event=>{setName(event.target.value);setErrors(current=>({...current,name:undefined}));setError('');}} onBlur={()=>setErrors(current=>({...current,name:validSectionName(name)?current.name:sectionNameError}))} className={field}/>
     {errors.name&&<p id="aluminum-section-name-error" role="alert" className="mt-2 text-sm text-red-800">{term(errors.name)}</p>}
    </div>
    <div className="min-w-0"><label htmlFor="aluminum-section-price" className="text-sm font-medium">{term('Price (IQD / m²)')}</label>
     <input ref={priceInput} id="aluminum-section-price" required type="number" min="0.01" max="10000000000" step="0.01" inputMode="decimal" disabled={busy||disabled} value={price} aria-invalid={!!errors.price} aria-describedby={errors.price?'aluminum-section-price-error':undefined} onChange={event=>{setPrice(event.target.value);setErrors(current=>({...current,price:undefined}));setError('');}} onBlur={()=>setErrors(current=>({...current,price:validPrice(price)?current.price:sectionPriceError}))} className={field}/>
     {errors.price&&<p id="aluminum-section-price-error" role="alert" className="mt-2 text-sm text-red-800">{term(errors.price)}</p>}
    </div>
   </div>
   <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
    <button type="button" disabled={busy} onClick={close} className={secondary}>{term('Cancel')}</button>
    <button type="submit" disabled={busy||disabled} className={button}>{busy?term('Adding…'):term('Add section')}</button>
   </div>
  </form>}
 </section>;
}

export function CatalogWorkspace({canEdit=false}:{canEdit?:boolean}){
 const {term,formatNumber}=useI18n();
 const {data,setData,error,setError,loading}=useResource<{items:CatalogItem[]}>('/api/catalog');
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [creating,setCreating]=useState(false);
 const [notice,setNotice]=useState('');
 const changes=(data?.items??[]).filter(item=>drafts[item.id]!==undefined&&(drafts[item.id].trim()===''||Number(drafts[item.id])!==Number(item.unit_price))).map(item=>({id:item.id,price:Number(drafts[item.id])}));
 const invalid=(value:string)=>value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0.01||Number(value)>1e10;
 function edit(id:string,value:string){setDrafts(current=>({...current,[id]:value}));setNotice('');setError('');}
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||creating||!canEdit||!changes.length)return;
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
  {loading?<p>{term('Loading catalog…')}</p>:<div className="space-y-8">
  {canEdit&&data&&<AddAluminumSection disabled={busy} onBusyChange={setCreating} onCreated={item=>setData(current=>({items:[...(current?.items??[]),item].sort((a,b)=>a.name.localeCompare(b.name))}))}/>}
  <form onSubmit={event=>void save(event)} noValidate className="space-y-8">
   <p className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">{term('Skylights are priced in the dedicated calculator.')} <Link href="/skylight" className="font-semibold underline">{term('Open skylight calculator')}</Link></p>
   {catalogGroups.map(group=>{
    const items=data?.items.filter(item=>catalogKind(item)===group.kind)??[];
    return items.length?<section key={group.kind} aria-label={term(group.label)} className="space-y-3">
     <div><h2 className="text-lg font-semibold">{term(group.label)}</h2><p className="mt-1 text-sm text-slate-500">{term(group.description)}</p></div>
     {items.map(item=>{
      const value=drafts[item.id]??String(item.unit_price);
      const changed=changes.some(change=>change.id===item.id);
      return <div key={item.id} className={`${card} grid items-end gap-4 sm:grid-cols-[1fr_180px] ${changed?'border-blue-300':''}`}>
       <div className="min-w-0"><h3 dir="auto" className="break-words font-semibold">{term(item.name)}</h3><p className="mt-1 text-sm text-slate-500">{term('per')} {term(item.unit)}{!item.is_active?` · ${term('Inactive')}`:''}</p><p className="mt-2 text-xs leading-5 text-slate-500">{term(catalogUsage(item))}</p>{Number(value)<0.01&&<p className="mt-2 text-sm text-amber-700">{term('Price required before quoting')}</p>}</div>
       <label className="min-w-0 text-sm">{term('Price (IQD)')}<input disabled={!canEdit||busy||creating} aria-label={term('{name} price',{name:term(item.name)})} aria-invalid={changed&&invalid(value)} type="number" min="0.01" max="10000000000" step="0.01" value={value} onChange={event=>edit(item.id,event.target.value)} className={field}/></label>
      </div>;
     })}
    </section>:null;
   })}
   {canEdit&&<div className="sticky bottom-4 z-20 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
    <Notice error={error}/>
    {notice&&<p role="status" className="mb-3 text-sm text-green-700">{term(notice)}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-slate-600">{changes.length?term('Changed prices: {count}',{count:formatNumber(changes.length)}):term('No unsaved price changes')}</p><button disabled={busy||creating||!changes.length} type="submit" className={`${button} w-full sm:w-auto`}>{busy?term('Saving…'):term('Save all changes')}</button></div>
   </div>}
  </form></div>}
  {!canEdit&&<Notice error={error}/>}
 </Workspace>;
}
