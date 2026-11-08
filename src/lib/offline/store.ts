import type { FieldState } from './types';
import { visibleFieldState } from './projectAccess';
const DATABASE='alumex-field-v1';
const ACTIVE='alumex-field-active';
const STORAGE_TIMEOUT=5000;
const unavailable=()=>new Error('Device storage is full or unavailable. Your changes have not been saved.');
type AccountRead={promise:Promise<FieldState|null>;invalidated:boolean};
const accountReads=new Map<string,AccountRead>();
const accountWrites=new Map<string,Set<Promise<FieldState>>>();
function invalidateRead(id:string|null){if(!id)return;const read=accountReads.get(id);if(read)read.invalidated=true;accountReads.delete(id);}
export function activeFieldUser(){return typeof window==='undefined'?null:localStorage.getItem(ACTIVE);}
export type FieldChangeDetail={source:'snapshot'|'account';userId:string|null};
export function setFieldUser(id:string|null){const previous=activeFieldUser();if(id)localStorage.setItem(ACTIVE,id);else localStorage.removeItem(ACTIVE);if(previous!==id){invalidateRead(previous);invalidateRead(id);window.dispatchEvent(new CustomEvent<FieldChangeDetail>('field-change',{detail:{source:'account',userId:id}}));}}
async function database(){
 return new Promise<IDBDatabase>((resolve,reject)=>{
  let settled=false;
  const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);reject(unavailable());};
  const timer=setTimeout(fail,STORAGE_TIMEOUT);
  try{
   const request=indexedDB.open(DATABASE,1);
   request.onblocked=fail;
   request.onerror=fail;
   request.onupgradeneeded=()=>{
    // A timed-out open can still finish later. Do not change storage after its
    // caller has already been told that the operation could not finish.
    if(settled){request.transaction?.abort();return;}
    try{request.result.createObjectStore('accounts');}
    catch{fail();request.transaction?.abort();}
   };
   request.onsuccess=()=>{
    const db=request.result;
    if(settled){db.close();return;}
    settled=true;clearTimeout(timer);
    db.onversionchange=()=>db.close();
    resolve(db);
   };
  }catch{fail();}
 });
}
async function accountRecord<T>(id:string,mode:IDBTransactionMode,read:(store:IDBObjectStore,state:FieldState|null)=>T):Promise<T>{
 const db=await database();
 return new Promise<T>((resolve,reject)=>{
  let settled=false;
  let tx:IDBTransaction|undefined;
  let value:T;
  function fail(cause:unknown=unavailable()){
   if(settled)return;
   settled=true;clearTimeout(timer);db.close();reject(cause);
  }
  function abort(){try{tx?.abort();}catch{/* An already completed transaction cannot be aborted. */}}
  const timer=setTimeout(()=>{fail();abort();},STORAGE_TIMEOUT);
  try{
   tx=db.transaction('accounts',mode);
   tx.onabort=()=>fail();
   tx.onerror=()=>fail();
   tx.oncomplete=()=>{
    if(settled)return;
    settled=true;clearTimeout(timer);db.close();resolve(value);
   };
   const store=tx.objectStore('accounts');
   const request=store.get(id);
   request.onerror=()=>fail();
   request.onsuccess=()=>{
    if(settled)return;
    try{value=read(store,request.result??null);}
    catch(cause){fail(cause);abort();}
   };
  }catch(cause){fail(cause);abort();}
 });
}
// Only synchronization reads retained records directly. UI callers use the
// branch-scoped read below; mutation callbacks still receive the full record.
export async function readStoredFieldState(id=activeFieldUser()):Promise<FieldState|null>{
 if(!id)return null;
 const existing=accountReads.get(id);if(existing)return existing.promise;
 const read:AccountRead={invalidated:false,promise:Promise.resolve(null)};
 read.promise=(async()=>{
  const writes=accountWrites.get(id);
  if(writes?.size)await Promise.allSettled(writes);
  if(read.invalidated)return readStoredFieldState(id);
  const state=await accountRecord(id,'readonly',(_store,state)=>state);
  // A write may have started while IndexedDB was reading. Share the new read
  // instead of delivering a pre-save record to subscribers after that save.
  return read.invalidated?readStoredFieldState(id):state;
 })().finally(()=>{if(accountReads.get(id)===read)accountReads.delete(id);});
 accountReads.set(id,read);
 return read.promise;
}
export async function readFieldState(id=activeFieldUser()):Promise<FieldState|null>{const state=await readStoredFieldState(id);return state&&id===activeFieldUser()?visibleFieldState(state):null;}
export async function updateFieldState(id:string,change:(state:FieldState|null)=>FieldState,source?:'snapshot'):Promise<FieldState>{
 invalidateRead(id);
 const saving=accountRecord(id,'readwrite',(store,state)=>{const next=change(state);store.put(next,id);return next;});
 const writes=accountWrites.get(id)??new Set<Promise<FieldState>>();writes.add(saving);accountWrites.set(id,writes);
 let next:FieldState;
 try{next=await saving;}finally{writes.delete(saving);if(!writes.size)accountWrites.delete(id);}
 window.dispatchEvent(source?new CustomEvent<FieldChangeDetail>('field-change',{detail:{source,userId:id}}):new Event('field-change'));
 return visibleFieldState(next);
}
