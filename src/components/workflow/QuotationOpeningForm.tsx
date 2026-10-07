"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { useState } from 'react';
import { normalizeRegistrationOpening, registrationRoomTypes, registrationStructureTypes, type RegistrationOpening } from '@/lib/measurements/registrationOpening';
import { button,card,field,Notice,secondary } from './ui';

export function QuotationOpeningForm({onAdd,onCancel}:{onAdd:(opening:RegistrationOpening)=>void;onCancel:()=>void}) {
 const { term } = useI18n();
 const [structure,setStructure]=useState('');
 const [room,setRoom]=useState('');
 const [error,setError]=useState('');
 function add(event:React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const opening=normalizeRegistrationOpening({id:crypto.randomUUID(),floor:form.get('floor'),room,otherRoom:form.get('otherRoom'),structuralType:structure,openingType:form.get('movement'),width:Number(form.get('width')),height:Number(form.get('height'))});
  if(!opening){setError('Complete the floor, room, dimensions and opening types.');return;}
  onAdd(opening);
 }
 return <form onSubmit={add} className={`${card} space-y-5 border-blue-300`} aria-label={term("New opening")}>
  <h2 className="text-lg font-semibold">{term("Add an opening")}</h2>
  <p className="text-sm text-slate-500">{term("Register each opening separately. It will be saved with this quotation revision.")}</p>
  <Notice error={error}/>
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="text-sm">{term("Floor")}<input name="floor" required maxLength={100} placeholder={term("Ground, 1, 2…")} className={field}/></label>
   <label className="text-sm">{term("Room")}<select aria-label={term("Room")} required value={room} onChange={e=>setRoom(e.target.value)} className={field}><option value="">{term("Choose room")}</option>{registrationRoomTypes.map(r=><option key={r} value={r}>{term(r)}</option>)}</select></label>
  </div>
  {room==='Other'&&<label className="block text-sm">{term("Room name")}<input name="otherRoom" required maxLength={100} className={field}/></label>}
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="text-sm">{term("Structural type")}<select aria-label={term("Structural type")} required value={structure} onChange={e=>setStructure(e.target.value)} className={field}><option value="">{term("Choose structural type")}</option>{registrationStructureTypes.map(s=><option key={s} value={s}>{term(s)}</option>)}</select></label>
   {['Window','Door'].includes(structure)?<label className="text-sm">{term("Opening type")}<select aria-label={term("Opening type")} required name="movement" className={field} defaultValue=""><option value="">{term("Choose opening type")}</option><option value="Sliding">{term("Sliding")}</option><option value="Hinged">{term("Hinged")}</option></select></label>:structure==='Louver'?<p className="self-end pb-3 text-sm text-slate-600">{term("Louver opening type: Hinged")}</p>:null}
   <label className="text-sm">{term("Width (cm)")}<input name="width" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field}/></label>
   <label className="text-sm">{term("Height (cm)")}<input name="height" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field}/></label>
  </div>
  <div className="flex flex-wrap gap-3"><button className={button}>{term("Add to quotation draft")}</button><button type="button" className={secondary} onClick={onCancel}>{term("Cancel opening")}</button></div>
 </form>;
}
