"use client";

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { normalizeRegistrationOpening, type RegistrationOpening } from '@/lib/measurements/registrationOpening';
import type { MeasuredOpening } from '@/lib/workflow/pricing';
import { button, field, Notice, secondary } from './ui';

export function QuotationFacadeForm({facades,onAdd,onCancel}:{facades:MeasuredOpening[];onAdd:(facade:RegistrationOpening)=>void;onCancel:()=>void}) {
 const {term}=useI18n();
 const [error,setError]=useState('');
 const [facadeNumber,setFacadeNumber]=useState(()=>{
  const used=new Set(facades.map(facade=>facade.facade_number));
  const next=Math.max(0,...facades.map(facade=>facade.facade_number??0))+1;
  if(next<=1000)return String(next);
  for(let number=1;number<=1000;number++)if(!used.has(number))return String(number);
  return '';
 });
 function add(event:React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const facade=normalizeRegistrationOpening({id:crypto.randomUUID(),structuralType:'Facade',workArea:'facade',facadeNumber:Number(facadeNumber),width:Number(form.get('width')),height:Number(form.get('height')),quantity:1,hasArch:false,hasRollerShutter:false});
  if(!facade){setError('Enter a facade number and valid width and length.');return;}
  if(facades.some(saved=>saved.facade_number===facade.facadeNumber)){setError('This facade number is already saved. Edit it or choose another number.');return;}
  onAdd(facade);
 }
 return <form onSubmit={add} aria-label={term('New facade')} className="mt-4 space-y-4 border-t border-slate-200 pt-4">
  <p className="text-sm text-slate-600">{term('The new facade will be saved with this quotation revision.')}</p>
  <Notice error={error}/>
  <div className="grid gap-4 sm:grid-cols-3">
   <label className="text-sm">{term('Facade number')}<input required type="number" inputMode="numeric" min={1} max={1000} step={1} value={facadeNumber} onChange={event=>{setFacadeNumber(event.target.value);setError('');}} className={field}/></label>
   <label className="text-sm">{term('Width (cm)')}<input name="width" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field}/></label>
   <label className="text-sm">{term('Length (cm)')}<input name="height" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field}/></label>
  </div>
  <div className="flex flex-wrap gap-3"><button type="submit" className={button}>{term('Add to quotation draft')}</button><button type="button" className={secondary} onClick={onCancel}>{term('Cancel facade')}</button></div>
 </form>;
}
