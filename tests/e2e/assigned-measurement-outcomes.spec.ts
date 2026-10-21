import {expect,test} from '@playwright/test';
import type {FieldState} from '../../src/lib/offline/types';
import {savedFieldState} from './helpers/fieldState';
test.use({serviceWorkers:'block'});
for(const locale of ['en','ar'])test(`${locale}: visit outcomes only appear after assignment to the Outdoor creator`,async({page})=>{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
 const id='11111111-1111-4111-8111-111111111111';
 const state:FieldState={actor,projects:[{id,project_name:'New unassigned project',project_number:'PRJ-ASSIGN',created_by:actor.id,registeredBy:actor.name,assigned_outdoor_sales_id:null,structure_readiness:'ready',sales_status:'new_lead',address:'Baghdad',phone:null,next_follow_up_at:null,project_notes:null,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z'}],openings:[],queue:[],syncedAt:null,outdoorSales:[actor],indoorSales:[]};
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',route=>route.fulfill({json:state}));
 await page.goto('/offline?path=/initial-measurements/'+id);
 await expect(page.getByText('PRJ-ASSIGN',{exact:false}).first()).toBeVisible();
 const delay=page.getByText(locale==='en'?'Unable to take measurements':'تعذر أخذ القياسات',{exact:true});
 const cancel=page.getByText(locale==='en'?'Client cancelled project':'ألغى العميل المشروع',{exact:true});
 await expect(delay).toHaveCount(0);await expect(cancel).toHaveCount(0);
 // Simulate receiving an assignment snapshot, including a change while the screen is open.
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 async function assign(assigned:string|null){
  await page.evaluate(assigned=>new Promise<void>((resolve,reject)=>{
   const request=indexedDB.open('alumex-field-v1',1);
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('accounts','readwrite'),store=tx.objectStore('accounts');
    const key=localStorage.getItem('alumex-field-active')!;
    const read=store.get(key);
    read.onsuccess=()=>{const state=read.result as FieldState;state.projects[0].assigned_outdoor_sales_id=assigned;store.put(state,key);};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.oncomplete=()=>{db.close();window.dispatchEvent(new Event('field-change'));resolve();};
   };
  }),assigned);
 }
 await assign(actor.id);
 await expect(delay).toBeVisible();await expect(cancel).toBeVisible();
 await assign('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 await expect(delay).toHaveCount(0);await expect(cancel).toHaveCount(0);
 await assign(null);
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await page.reload();
 await expect(page.getByText('PRJ-ASSIGN',{exact:false}).first()).toBeVisible();
 await expect(delay).toHaveCount(0);await expect(cancel).toHaveCount(0);
 expect((await savedFieldState(page)).queue).toHaveLength(0);
 expect(errors).toEqual([]);
});
