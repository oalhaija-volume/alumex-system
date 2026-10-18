import {expect,test} from '@playwright/test';
import type {FieldState} from '../../src/lib/offline/types';
import {savedFieldState} from './helpers/fieldState';
test.use({serviceWorkers:'block'});
const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
const id='11111111-1111-4111-8111-111111111111';
for(const locale of ['en','ar'])test(`${locale}: delayed visit survives offline reload, remains assigned, and resumes without losing measurements`,async({page},testInfo)=>{
 const state:FieldState={actor,projects:[{id,project_name:'Client delay example',project_number:'PRJ-DELAY',structure_readiness:'ready',sales_status:'new_lead',address:'Baghdad',phone:null,created_by:'creator',registeredBy:'Indoor employee',assigned_outdoor_sales_id:actor.id,assignedToYou:true,assignedOutdoorSales:actor.name,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',next_follow_up_at:null,project_notes:null}],openings:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',projectId:id,floor:'Ground',room:'Kitchen',otherRoom:'',width:120,height:150,structuralType:'Window',openingType:'Sliding'}],queue:[],syncedAt:null,outdoorSales:[actor],indoorSales:[]};
 const synced:string[]=[];
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',route=>{
  if(route.request().method()==='POST'){
   const change=route.request().postDataJSON();synced.push(change.action);
   Object.assign(state.projects[0],{measurement_delayed:change.action==='delay-measurements',updated_at:new Date().toISOString(),...(change.action==='delay-measurements'?{measurement_delay_note:change.payload.note,measurement_delayed_at:change.recordedAt,measurement_delayed_by:actor.id,measurementDelayedBy:actor.name}:{})});
   return route.fulfill({json:{project:state.projects[0]}});
  }
  return route.fulfill({json:state});
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/offline?path=/initial-measurements/'+id);
 const summary=page.getByText(locale==='en'?'Client asked to visit later':'طلب العميل تأجيل الزيارة',{exact:true});
 await expect(summary).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await summary.click();
 const form=page.getByRole('form',{name:locale==='en'?'Report client delay':'تسجيل التأجيل بطلب العميل'});
 await form.getByRole('button').click();
 expect((await savedFieldState(page)).queue).toHaveLength(0);
 const note=locale==='en'?'Client requested another visit next week.':'طلب العميل تأجيل الزيارة إلى الأسبوع المقبل.';
 await form.locator('textarea').fill(note);
 await form.getByRole('button').click();
 const resume=page.getByRole('button',{name:locale==='en'?'Resume measurements':'استئناف القياسات',exact:true});
 await expect(resume).toBeVisible();
 await expect(page.getByText(note,{exact:true})).toBeVisible();
 let local=await savedFieldState(page);
 expect(local.projects[0].measurement_delayed).toBe(true);expect(local.projects[0].assigned_outdoor_sales_id).toBe(actor.id);expect(local.openings).toHaveLength(1);
 expect(local.queue.map(c=>c.action)).toEqual(['delay-measurements']);expect(synced).toEqual([]);
 await page.reload();
 await expect(resume).toBeVisible();
 await expect(page.getByRole('button',{name:locale==='en'?'Finish measurements':'إكمال القياسات',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/client-delay/paused-${locale}-${testInfo.project.name}.png`,fullPage:true});
 await page.goto('/offline?path=/dashboard');
 await expect(page.getByText(note,{exact:true}).first()).toBeVisible();
 await page.goto('/offline?path=/initial-measurements/'+id);
 await resume.click();
 await expect(resume).toHaveCount(0);
 local=await savedFieldState(page);expect(local.projects[0].measurement_delayed).toBe(false);expect(local.openings).toHaveLength(1);
 expect(local.queue.map(c=>c.action)).toEqual(['delay-measurements','resume-measurements']);
 // Synchronize the exact saved actions in order after reconnecting.
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect.poll(()=>synced).toEqual(['delay-measurements','resume-measurements']);
 await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 expect((await savedFieldState(page)).projects[0].measurement_delayed).toBe(false);
 expect(errors).toEqual([]);
});

for(const locale of ['en','ar'])test(`${locale}: Indoor Sales sees client delays and follows the measurement link`,async({page})=>{
 const state:FieldState={actor:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Indoor employee',role:'Indoor Sales',branch:'Rasafa'},projects:[{id,project_name:'Shared delayed visit',project_number:'PRJ-DELAY',structure_readiness:'ready',sales_status:'new_lead',address:'Baghdad',phone:null,created_by:'creator',registeredBy:'Indoor employee',assigned_outdoor_sales_id:actor.id,assignedOutdoorSales:actor.name,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',next_follow_up_at:null,project_notes:null,measurement_delayed:true,measurement_delay_note:'Client requested a later visit.',measurement_delayed_at:'2026-10-18T09:00:00Z',measurementDelayedBy:actor.name}],openings:[],queue:[],syncedAt:null,outdoorSales:[actor],indoorSales:[]};
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',route=>route.fulfill({json:state}));
 await page.goto('/offline?path=/dashboard');
 await expect(page.getByText('Client requested a later visit.',{exact:true})).toBeVisible();
 await expect(page.locator('time[datetime="2026-10-18T09:00:00Z"]')).toHaveText('18/10/2026, 12:00');
 await page.getByRole('link',{name:locale==='en'?'Review delayed visit':'مراجعة الزيارة المؤجلة',exact:true}).click();
 await expect(page.getByRole('button',{name:locale==='en'?'Resume measurements':'استئناف القياسات',exact:true})).toBeVisible();
 await expect(page.getByRole('form',{name:locale==='en'?'Report client delay':'تسجيل التأجيل بطلب العميل'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
