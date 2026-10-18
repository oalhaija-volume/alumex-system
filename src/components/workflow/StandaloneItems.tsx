"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { catalogKind, isPushout } from '@/lib/workflow/catalogRules';
import { additionalOptions, facadeAddonOptions, type AdditionalChoice, type SurfaceMeasurement, type CatalogItem } from '@/lib/workflow/pricing';
import { card, field, secondary } from './ui';

export function StandaloneItems({items,catalog,onChange,recordedAreas=[]}:{recordedAreas?:SurfaceMeasurement[];items:AdditionalChoice[];catalog:CatalogItem[];onChange:(items:AdditionalChoice[])=>void}){
 const {term,formatMoney,formatNumber}=useI18n();
 const update=(id:string,patch:Partial<AdditionalChoice>)=>onChange(items.map(item=>item.id===id?{...item,...patch}:item));
 const rateLabel=(product:CatalogItem)=>product.unit_price>0?`${formatMoney(product.unit_price)} / ${term(product.unit)}`:term('Price required');
 return <section className={`${card} space-y-5`}>
  <div><h2 className="font-semibold">{term('Standalone products & facade services')}</h2><p className="mt-2 text-sm text-slate-500">{term('Enter building areas for facade work. These services are quoted separately from opening add-ons.')}</p></div>
  <label className="block text-sm">{term('Add product or service')}<select aria-label={term('Add product or service')} className={field} value="" onChange={e=>{const product=catalog.find(p=>p.id===e.target.value);if(product)onChange([...items,{id:product.id,quantity:1,...(catalogKind(product)==='facade'?{measurements:recordedAreas.length?recordedAreas.map(a=>({...a})):[{label:'',width:0,height:0,quantity:1}]}:{}),extras:[]}]);}}><option value="">{term('Choose from the price catalog')}</option>{additionalOptions(catalog).filter(p=>!items.some(item=>item.id===p.id)).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
  {items.map(item=>{
   const product=catalog.find(p=>p.id===item.id);
   const facade=product&&catalogKind(product)==='facade';
   const areas=item.measurements??[];
   const extras=item.extras??[];
   const allowed=product?facadeAddonOptions(product,catalog):[];
   return <section key={item.id} aria-label={term(product?.name??'Unavailable item')} className="space-y-4 rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{term(product?.name??'Unavailable item')}</h3>{product&&<p className="mt-1 text-xs text-slate-500">{rateLabel(product)}</p>}</div><button type="button" aria-label={term('Remove {name}',{name:term(product?.name)})} className="min-h-11 px-3 text-sm text-red-700" onClick={()=>onChange(items.filter(x=>x.id!==item.id))}>{term('Remove')}</button></div>
    {facade?<>
     {recordedAreas.length>0&&<button type="button" className={secondary} onClick={()=>update(item.id,{measurements:recordedAreas.map(a=>({...a}))})}>{term('Use recorded facade dimensions')}</button>}
     {!areas.length&&<p className="text-sm text-amber-800">{term('Enter the measured areas for this facade service.')}</p>}
     {areas.map((area,index)=><fieldset key={index} className="rounded-md bg-slate-50 p-3">
      <legend className="px-1 text-sm font-medium">{term('Facade area {number}',{number:formatNumber(index+1)})}</legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
       <label className="text-sm">{term('Area / elevation name')}<input className={field} maxLength={100} value={area.label} onChange={e=>update(item.id,{measurements:areas.map((a,i)=>i===index?{...a,label:e.target.value}:a)})}/></label>
       {(['width','height','quantity'] as const).map(dimension=><label key={dimension} className="text-sm">{term(dimension==='width'?'Width (m)':dimension==='height'?'Height (m)':'Quantity')}<input type="number" min={dimension==='quantity'?1:0.001} max={dimension==='quantity'?10000:1000} step={dimension==='quantity'?1:0.001} className={field} value={area[dimension]||''} onChange={e=>update(item.id,{measurements:areas.map((a,i)=>i===index?{...a,[dimension]:Number(e.target.value)}:a)})}/></label>)}
       <button type="button" className="min-h-11 self-end px-2 text-sm text-red-700" aria-label={term('Remove facade area {number}',{number:formatNumber(index+1)})} onClick={()=>update(item.id,{measurements:areas.filter((_,i)=>i!==index)})}>{term('Remove')}</button>
      </div>
     </fieldset>)}
     <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={areas.length>=100} className={secondary} onClick={()=>update(item.id,{measurements:[...areas,{label:'',width:0,height:0,quantity:1}]})}>{term('+ Add measured area')}</button><p className="text-sm font-semibold">{term('Total area')}: {formatNumber(areas.reduce((sum,a)=>sum+a.width*a.height*a.quantity,0),3)} {term('m²')}</p></div>
    </>:<label className="block text-sm">{term(product?.unit==='sqm'?'Area (m²)':product?.unit==='meter'?'Length (m)':'Quantity')}<input aria-label={term('{name} project quantity',{name:term(product?.name)})} className={`${field} max-w-40`} type="number" min={product?.unit==='item'?1:0.01} max="1000000" step={product?.unit==='item'?1:0.01} value={item.quantity||''} onChange={e=>update(item.id,{quantity:Number(e.target.value)})}/></label>}
    {!!allowed.length&&<label className="block text-sm">{term('Facade add-on')}<select aria-label={term('Facade add-on')} className={field} value="" onChange={e=>{if(e.target.value)update(item.id,{extras:[...extras,{id:e.target.value,quantity:1}]});}}><option value="">{term('Choose add-on')}</option>{allowed.filter(p=>!extras.some(e=>e.id===p.id)).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>}
    {extras.map(extra=>{const p=catalog.find(p=>p.id===extra.id);return <div key={extra.id} className="flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"><div className="flex-1 text-sm">{p?.unit==='sqm'?<><p>{term(p.name)}</p><p className="mt-1 text-xs text-slate-500">{term('Uses the total measured facade area')}</p></>:<label>{term(p?.name??'Unavailable item')}<input aria-label={term('{name} quantity',{name:term(p?.name)})} type="number" min={p?.unit==='item'?1:0.01} step={p?.unit==='item'?1:0.01} max="1000000" className={field} value={extra.quantity||''} onChange={e=>update(item.id,{extras:extras.map(x=>x.id===extra.id?{...x,quantity:Number(e.target.value)}:x)})}/></label>}</div><button type="button" className="min-h-11 px-3 text-sm text-red-700" onClick={()=>update(item.id,{extras:extras.filter(x=>x.id!==extra.id)})}>{term('Remove')}</button>{p&&isPushout(p)&&<p className="w-full text-xs text-slate-500">{term('Each pushout is charged separately at the catalog unit price.')}</p>}</div>;})}
   </section>;
  })}
 </section>;
}
