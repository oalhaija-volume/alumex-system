"use client";
/* eslint-disable @next/next/no-img-element -- Device photos and drawings use local data URLs. */
import {useRef,useState} from 'react';
import {useI18n} from '@/components/i18n/I18nProvider';
import type {SkylightCapture} from '@/lib/measurements/registrationOpening';
import {SkylightDrawingPad} from './SkylightDrawingPad';

async function preparePhoto(file:File){
 if(!file.type.startsWith('image/')||file.size>25*1024*1024)throw new Error('Choose a photo smaller than 25 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('Photo processing is unavailable. Try another photo.');
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [0.8,0.65,0.45]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=700000)return result;}
  throw new Error('Photo processing is unavailable. Try another photo.');
 }finally{URL.revokeObjectURL(url);}
}
export function SkylightCaptureEditor({value,onChange,busy,onBusyChange}:{value:SkylightCapture;onChange:(capture:SkylightCapture)=>void;busy:boolean;onBusyChange:(busy:boolean)=>void}){
 const {term}=useI18n(),camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null);
 const [error,setError]=useState('');
 async function selectPhoto(file?:File){if(!file)return;setError('');onBusyChange(true);try{onChange({...value,photo:await preparePhoto(file)});}catch(cause){setError(cause instanceof Error&&cause.message.startsWith('Choose a photo')?cause.message:'Photo processing is unavailable. Try another photo.');}finally{onBusyChange(false);}}
 const field='mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base';
 return <section aria-label={term('Skylight shape and measurements')} className="space-y-5 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
  <h3 className="font-semibold text-slate-900">{term('Skylight shape and measurements')}</h3>
  <div className="flex flex-wrap gap-3">
   <button type="button" disabled={busy} onClick={()=>camera.current?.click()} className="min-h-12 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{term('Take photo')}</button>
   <button type="button" disabled={busy} onClick={()=>gallery.current?.click()} className="min-h-12 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-50">{term('Choose photo')}</button>
   <input ref={camera} type="file" accept="image/*" capture="environment" aria-label={term('Take skylight photo')} className="hidden" onChange={event=>{void selectPhoto(event.target.files?.[0]);event.target.value='';}}/>
   <input ref={gallery} type="file" accept="image/*" aria-label={term('Choose skylight photo')} className="hidden" onChange={event=>{void selectPhoto(event.target.files?.[0]);event.target.value='';}}/>
  </div>
  {busy&&<p role="status" className="text-sm">{term('Preparing photo…')}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{term(error)}</p>}
  {value.photo&&<div><img src={value.photo} alt={term('Skylight site photo')} className="max-h-80 w-full rounded-md object-contain"/><button type="button" disabled={busy} onClick={()=>onChange({...value,photo:undefined})} className="mt-2 min-h-11 px-3 text-sm text-red-700">{term('Remove photo')}</button></div>}
  <SkylightDrawingPad value={value.drawing??''} disabled={busy} onChange={drawing=>onChange({...value,drawing})}/>
  <div className="space-y-4">
   <p className="text-sm text-slate-600">{term('For an L shape or other irregular shape, add the width and length of each section. Match the labels to your photo or drawing.')}</p>
   {value.sections.map((section,index)=><fieldset key={index} disabled={busy} className="rounded-md border border-slate-200 bg-white p-3">
    <legend className="px-1 text-sm font-semibold">{term('Section')} {index+1}</legend>
    <label className="block text-sm">{term('Section label')}<input required maxLength={100} value={section.label} className={field} onChange={e=>onChange({...value,sections:value.sections.map((s,i)=>i===index?{...s,label:e.target.value}:s)})}/></label>
    <div className="mt-3 grid grid-cols-2 gap-3">{(['width','length'] as const).map(axis=><label key={axis} className="text-sm">{term(axis==='width'?'Section width (cm)':'Section length (cm)')}<input required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field} value={section[axis]||''} onChange={e=>onChange({...value,sections:value.sections.map((s,i)=>i===index?{...s,[axis]:Number(e.target.value)}:s)})}/></label>)}</div>
    <button type="button" onClick={()=>onChange({...value,sections:value.sections.filter((_,i)=>i!==index)})} className="mt-3 min-h-11 px-2 text-sm text-red-700">{term('Remove section')}</button>
   </fieldset>)}
   <button type="button" disabled={busy||value.sections.length>=30} onClick={()=>onChange({...value,sections:[...value.sections,{label:String.fromCharCode(65+value.sections.length%26),width:0,length:0}]})} className="min-h-11 rounded-md border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-800">{term('Add width / length section')}</button>
  </div>
 </section>;
}
