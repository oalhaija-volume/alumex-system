"use client";
import { useState } from 'react';
import { normalizeRegistrationOpening, registrationRoomTypes, registrationStructureTypes, type RegistrationOpening } from '@/lib/measurements/registrationOpening';
import { button,card,field,Notice,secondary } from './ui';

export function QuotationOpeningForm({onAdd,onCancel}:{onAdd:(opening:RegistrationOpening)=>void;onCancel:()=>void}) {
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
 return <form onSubmit={add} className={`${card} space-y-5 border-blue-300`} aria-label="New opening">
  <h2 className="text-lg font-semibold">Add an opening</h2>
  <p className="text-sm text-slate-500">Register each opening separately. It will be saved with this quotation revision.</p>
  <Notice error={error}/>
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="text-sm">Floor<input name="floor" required maxLength={100} placeholder="Ground, 1, 2…" className={field}/></label>
   <label className="text-sm">Room<select aria-label="Room" required value={room} onChange={e=>setRoom(e.target.value)} className={field}><option value="">Choose room</option>{registrationRoomTypes.map(r=><option key={r}>{r}</option>)}</select></label>
  </div>
  {room==='Other'&&<label className="block text-sm">Room name<input name="otherRoom" required maxLength={100} className={field}/></label>}
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="text-sm">Structural type<select aria-label="Structural type" required value={structure} onChange={e=>setStructure(e.target.value)} className={field}><option value="">Choose structural type</option>{registrationStructureTypes.map(s=><option key={s}>{s}</option>)}</select></label>
   {['Window','Door'].includes(structure)?<label className="text-sm">Opening type<select aria-label="Opening type" required name="movement" className={field} defaultValue=""><option value="">Choose opening type</option><option>Sliding</option><option>Hinged</option></select></label>:structure==='Louver'?<p className="self-end pb-3 text-sm text-slate-600">Louver opening type: Hinged</p>:null}
   <label className="text-sm">Width (cm)<input name="width" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field}/></label>
   <label className="text-sm">Height (cm)<input name="height" required type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" className={field}/></label>
  </div>
  <div className="flex flex-wrap gap-3"><button className={button}>Add to quotation draft</button><button type="button" className={secondary} onClick={onCancel}>Cancel opening</button></div>
 </form>;
}
