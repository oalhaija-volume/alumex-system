"use client";
/* eslint-disable @next/next/no-img-element -- Device photos use local data URLs. */
import {useRef,useState} from 'react';
import {preparePhoto} from '@/lib/measurements/preparePhoto';
import {useI18n} from '@/components/i18n/I18nProvider';
import type {CurtainWallCapture} from '@/lib/measurements/registrationOpening';

export function CurtainWallCaptureEditor({value,onChange,busy,onBusyChange}:{value:CurtainWallCapture;onChange:(capture:CurtainWallCapture)=>void;busy:boolean;onBusyChange:(busy:boolean)=>void}){
 const {term}=useI18n(),camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null);
 const [error,setError]=useState('');
 async function selectPhoto(file?:File){if(!file)return;setError('');onBusyChange(true);try{onChange({...value,photo:await preparePhoto(file)});}catch(cause){setError(cause instanceof Error&&cause.message.startsWith('Choose a photo')?cause.message:'Photo processing is unavailable. Try another photo.');}finally{onBusyChange(false);}}
 const field='mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base';
 return <section aria-label={term('Curtain Wall photo and note')} className="space-y-5 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
  <h3 className="font-semibold text-slate-900">{term('Curtain Wall photo and note')}</h3>
  <p className="text-sm text-slate-600">{term('Photo and note are optional. Indoor Sales can review them with this opening.')}</p>
  <div className="flex flex-wrap gap-3">
   <button type="button" disabled={busy} onClick={()=>camera.current?.click()} className="min-h-12 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{term('Take photo')}</button>
   <button type="button" disabled={busy} onClick={()=>gallery.current?.click()} className="min-h-12 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-50">{term('Choose photo')}</button>
   <input ref={camera} type="file" accept="image/*" capture="environment" aria-label={term('Take Curtain Wall photo')} className="hidden" onChange={event=>{void selectPhoto(event.target.files?.[0]);event.target.value='';}}/>
   <input ref={gallery} type="file" accept="image/*" aria-label={term('Choose Curtain Wall photo')} className="hidden" onChange={event=>{void selectPhoto(event.target.files?.[0]);event.target.value='';}}/>
  </div>
  {busy&&<p role="status" className="text-sm">{term('Preparing photo…')}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{term(error)}</p>}
  {value.photo&&<div><img src={value.photo} alt={term('Curtain Wall site photo')} className="max-h-80 w-full rounded-md object-contain"/><button type="button" disabled={busy} onClick={()=>onChange({...value,photo:undefined})} className="mt-2 min-h-11 px-3 text-sm text-red-700">{term('Remove photo')}</button></div>}
  <label className="block text-sm font-medium text-slate-800">{term('Curtain Wall note (optional)')}<textarea disabled={busy} maxLength={2000} rows={3} className={field+' py-3'} value={value.note} onChange={event=>onChange({...value,note:event.target.value})}/></label>
 </section>;
}
