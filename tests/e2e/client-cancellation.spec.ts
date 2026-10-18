import {expect,test} from '@playwright/test';
import type {FieldState} from '../../src/lib/offline/types';
import {savedFieldState} from './helpers/fieldState';
test.use({serviceWorkers:'block'});
for(const role of ['Outdoor Sales','Indoor Sales'])for(const locale of ['en','ar'])test(`${role} ${locale}: client cancellation preserves records offline and syncs once`,async({page},testInfo)=>{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Sales employee',role,branch:role==='Indoor Sales'?'Karkh' as const:null};
 const id='11111111-1111-4111-8111-111111111111';
 const state:FieldState={actor,projects:[{id,project_name:'Cancellation sample',project_number:'PRJ-CANCEL',created_by:actor.id,registeredBy:actor.name,assigned_outdoor_sales_id:actor.id,assignedOutdoorSales:actor.name,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',structure_readiness:'ready',sales_status:'new_lead',phone:null,address:'Baghdad',next_follow_up_at:null,project_notes:null}],openings:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',projectId:id,floor:'Ground',room:'Kitchen',otherRoom:'',width:120,height:150,structuralType:'Window',openingType:'Sliding'}],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 const synced:string[]=[];const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',route=>{
  if(route.request().method()==='POST'){
   const change=route.request().postDataJSON();synced.push(change.id);
   expect(change.action).toBe('cancel-project');expect(change.payload.confirmed).toBe(true);
   Object.assign(state.projects[0],{sales_status:'cancelled',measurement_delayed:false,client_cancellation_note:change.payload.note,client_cancelled_at:change.recordedAt,client_cancelled_by:actor.id,clientCancelledBy:actor.name,updated_at:new Date().toISOString()});
   return route.fulfill({json:{project:state.projects[0]}});
  }
  return route.fulfill({json:{...state,entries:[]}});
 });
 const path=role==='Outdoor Sales'?'/initial-measurements/'+id:'/mini-crm';
 await page.goto('/offline?path='+path);
 await page.getByText(locale==='en'?'Client cancelled project':'ألغى العميل المشروع',{exact:true}).click();
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 const form=page.getByRole('form',{name:locale==='en'?'Client cancellation':'إلغاء المشروع بطلب العميل',exact:true});
 await form.getByRole('button').click();expect((await savedFieldState(page)).queue).toHaveLength(0);
 const reason=locale==='en'?'Client decided not to proceed.':'قرر العميل عدم متابعة المشروع.';
 await form.locator('textarea').fill(reason);await form.getByRole('button').click();
 await expect.poll(async()=>(await savedFieldState(page)).projects[0].sales_status).toBe('cancelled');
 if(role==='Indoor Sales')await page.getByRole('combobox',{name:locale==='en'?'Project stage':'مرحلة المشروع',exact:true}).selectOption('client-cancelled');
 await expect(page.getByText(reason,{exact:true})).toBeVisible();
 const saved=await savedFieldState(page);expect(saved.projects).toHaveLength(1);expect(saved.openings).toHaveLength(1);expect(saved.queue).toHaveLength(1);expect(saved.queue[0].action).toBe('cancel-project');
 expect(saved.projects[0].client_cancelled_by).toBe(actor.id);expect(synced).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/client-outcome/cancellation-${role.split(' ')[0]}-${locale}-${testInfo.project.name}.png`,fullPage:true});
 await page.reload();
 if(role==='Indoor Sales')await page.getByRole('combobox',{name:locale==='en'?'Project stage':'مرحلة المشروع',exact:true}).selectOption('client-cancelled');
 await expect(page.getByText(reason,{exact:true})).toBeVisible();
 await expect(page.getByText(locale==='en'?'Client cancelled project':'ألغى العميل المشروع',{exact:true})).toHaveCount(0);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 expect(synced).toEqual([saved.queue[0].id]);expect((await savedFieldState(page)).openings).toHaveLength(1);expect(errors).toEqual([]);
});
