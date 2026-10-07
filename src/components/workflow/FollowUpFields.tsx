"use client";
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldActor,FieldProject } from '@/lib/offline/types';
import { followUpTypes } from '@/lib/workflow/followUps';
import { field } from './ui';

export function FollowUpFields({project,actor,indoorSales,values}:{project:FieldProject;actor?:FieldActor;indoorSales:{id:string;name:string}[];values?:Record<string,unknown>}){
 const {term}=useI18n();
 const [type,setType]=useState(String(values?.followUpType??project.follow_up_type??''));
 const owner=String(values?.followUpOwnerId??project.follow_up_owner_id??(actor?.role==='Indoor Sales'?actor.id:''));
 const date=String(values?.nextFollowUp??project.next_follow_up_at??'');
 const localDate=date&&Number.isFinite(Date.parse(date))?new Date(Date.parse(date)-new Date(date).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 return <div className="grid gap-4 sm:grid-cols-2">
  <label className="text-sm">{term('Follow-up type')}<select required name="followUpType" aria-label={term('Follow-up type')} value={type} onChange={e=>setType(e.target.value)} className={field}><option value="">{term('Choose follow-up type')}</option>{followUpTypes.map(t=><option key={t.value} value={t.value}>{term(t.label)}</option>)}</select></label>
  {type==='other'&&<label className="text-sm">{term('Other follow-up type')}<input required name="followUpDetail" maxLength={120} defaultValue={String(values?.followUpDetail??project.follow_up_detail??'')} className={field}/></label>}
  <label className="text-sm">{term('Responsible Indoor Sales')}<select required name="followUpOwnerId" aria-label={term('Responsible Indoor Sales')} defaultValue={indoorSales.some(e=>e.id===owner)?owner:''} className={field}><option value="">{term('Choose Indoor Sales employee')}</option>{indoorSales.map(e=><option key={e.id} value={e.id}>{e.name==='Employee'?term('Employee'):e.name}</option>)}</select></label>
  <label className="text-sm">{term('Next follow-up')}<input required name="nextFollowUp" type="datetime-local" defaultValue={localDate} className={field}/></label>
  <label className="text-sm sm:col-span-2">{term('Follow-up note')}<textarea aria-label={term('Follow-up note')} name="note" maxLength={2000} rows={2} defaultValue={String(values?.note??project.project_notes??'')} className={field}/></label>
  {!indoorSales.length&&<p className="text-sm text-amber-800 sm:col-span-2">{term('No active Indoor Sales employees available. Add one in Employees and reconnect to refresh this list.')}</p>}
  <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{term('The responsible employee will see an in-system reminder when this follow-up is due.')}</p>
 </div>;
}

export function followUpFormValues(form:HTMLFormElement){
 const values=new FormData(form);const date=String(values.get('nextFollowUp')??'');
 return {note:String(values.get('note')??''),nextFollowUp:date&&Number.isFinite(Date.parse(date))?new Date(date).toISOString():'',followUpType:String(values.get('followUpType')??''),followUpDetail:String(values.get('followUpDetail')??''),followUpOwnerId:String(values.get('followUpOwnerId')??'')};
}
