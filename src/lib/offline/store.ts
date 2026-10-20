import type { FieldState } from './types';
import { visibleFieldState } from './projectAccess';
const DATABASE='alumex-field-v1';
const ACTIVE='alumex-field-active';
export function activeFieldUser(){return typeof window==='undefined'?null:localStorage.getItem(ACTIVE);}
export type FieldChangeDetail={source:'snapshot'|'account';userId:string|null};
export function setFieldUser(id:string|null){const previous=activeFieldUser();if(id)localStorage.setItem(ACTIVE,id);else localStorage.removeItem(ACTIVE);if(previous!==id)window.dispatchEvent(new CustomEvent<FieldChangeDetail>('field-change',{detail:{source:'account',userId:id}}));}
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DATABASE,1);r.onupgradeneeded=()=>r.result.createObjectStore('accounts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('This browser cannot save work offline. Enable device storage before continuing.'));});}
// Only synchronization reads retained records directly. UI callers use the
// branch-scoped read below; mutation callbacks still receive the full record.
export async function readStoredFieldState(id=activeFieldUser()):Promise<FieldState|null>{if(!id)return null;const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('accounts','readonly');const r=tx.objectStore('accounts').get(id);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
export async function readFieldState(id=activeFieldUser()):Promise<FieldState|null>{const state=await readStoredFieldState(id);return state?visibleFieldState(state):null;}
export async function updateFieldState(id:string,change:(state:FieldState|null)=>FieldState,source?:'snapshot'):Promise<FieldState>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('accounts','readwrite');const store=tx.objectStore('accounts');let next:FieldState;const r=store.get(id);r.onsuccess=()=>{try{next=change(r.result??null);store.put(next,id);}catch(e){tx.abort();reject(e);}};tx.oncomplete=()=>{db.close();window.dispatchEvent(source?new CustomEvent<FieldChangeDetail>('field-change',{detail:{source,userId:id}}):new Event('field-change'));resolve(visibleFieldState(next));};tx.onerror=()=>{db.close();reject(new Error('Device storage is full or unavailable. Your changes have not been saved.'));};tx.onabort=()=>db.close();});}
