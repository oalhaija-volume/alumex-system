"use client";
/* eslint-disable @next/next/no-img-element -- Compressed device photos use bounded data URLs. */
import {useEffect,useRef,useState} from 'react';
import {useI18n} from '@/components/i18n/I18nProvider';
import {preparePhoto} from '@/lib/measurements/preparePhoto';
import type {MeasurementCompletion} from '@/lib/measurements/completion';
export function MeasurementCompletionDialog({open,busy,error,onCancel,onSubmit}:{open:boolean;busy:boolean;error:string;onCancel:()=>void;onSubmit:(value:MeasurementCompletion)=>Promise<boolean>}){
 const {term,errorMessage}=useI18n();const dialog=useRef<HTMLDialogElement>(null),camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null);
 const [note,setNote]=useState(''),[photo,setPhoto]=useState(''),[processing,setProcessing]=useState(false),[photoError,setPhotoError]=useState('');
 const disabled=busy||processing;
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 async function select(file?:File){if(!file)return;setProcessing(true);setPhotoError('');try{setPhoto(await preparePhoto(file));}catch(cause){setPhotoError(cause instanceof Error&&cause.message.startsWith('Choose a photo')?cause.message:'Photo processing is unavailable. Try another photo.');}finally{setProcessing(false);}}
 return <dialog ref={dialog} aria-labelledby="measurement-completion-title" onCancel={event=>{event.preventDefault();if(!disabled)onCancel();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(32rem,calc(100vw_-_2rem))] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/50 sm:p-6">
  <h2 id="measurement-completion-title" className="text-xl font-semibold">{term('Finish measurements')}</h2>
  <p className="mt-2 text-sm leading-6 text-slate-600">{term('Add an optional site photo and note for Indoor Sales before submitting.')}</p>
  <form className="mt-5 space-y-5" onSubmit={async event=>{event.preventDefault();if(disabled)return;if(await onSubmit({note,photo})){setNote('');setPhoto('');setPhotoError('');}}}>
   <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <legend className="mb-3 text-sm font-semibold">{term('Site photo (optional)')}</legend>
    <div className="flex flex-wrap gap-3">
     <button type="button" onClick={()=>camera.current?.click()} className="min-h-12 rounded-md border border-blue-600 px-4 text-sm font-semibold text-blue-700">{term('Take photo')}</button>
     <button type="button" onClick={()=>gallery.current?.click()} className="min-h-12 rounded-md border border-slate-300 px-4 text-sm font-semibold">{term('Choose photo')}</button>
     <input ref={camera} type="file" accept="image/*" capture="environment" aria-label={term('Take measurement photo')} className="hidden" onChange={event=>{void select(event.target.files?.[0]);event.target.value='';}}/>
     <input ref={gallery} type="file" accept="image/*" aria-label={term('Choose measurement photo')} className="hidden" onChange={event=>{void select(event.target.files?.[0]);event.target.value='';}}/>
    </div>
    {photo&&<div><img src={photo} alt={term('Measurement site photo')} className="max-h-32 w-full rounded-md object-contain"/><button type="button" onClick={()=>setPhoto('')} className="min-h-11 text-sm text-red-700">{term('Remove photo')}</button></div>}
    <label className="block text-sm font-medium">{term('Note for Indoor Sales (optional)')}<textarea maxLength={2000} rows={3} value={note} onChange={event=>setNote(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 p-3 text-base"/></label>
   </fieldset>
   {processing&&<p role="status" className="text-sm">{term('Preparing photo…')}</p>}
   {open&&(photoError||error)&&<p role="alert" className="text-sm text-red-700">{errorMessage(photoError||error)}</p>}
   <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
    <button type="button" disabled={disabled} onClick={onCancel} className="min-h-12 rounded-md border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50">{term('Back to measurements')}</button>
    <button disabled={disabled} className="min-h-12 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{term(busy?'Saving…':'Submit measurements')}</button>
   </div>
  </form>
 </dialog>;
}
