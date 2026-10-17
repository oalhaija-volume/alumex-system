import type { Page } from '@playwright/test';
import type { FieldState } from '../../../src/lib/offline/types';

export async function savedFieldState(page:Page){
 return page.evaluate(()=>new Promise<FieldState>((resolve,reject)=>{
  const request=indexedDB.open('alumex-field-v1',1);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result;
   const read=db.transaction('accounts').objectStore('accounts').get(localStorage.getItem('alumex-field-active')!);
   read.onsuccess=()=>{db.close();resolve(read.result);};read.onerror=()=>reject(read.error);
  };
 }));
}
