import {expect,test} from '@playwright/test';
import {savedFieldState} from './helpers/fieldState';
import type {FieldChange,FieldState} from '../../src/lib/offline/types';
test.use({serviceWorkers:'block'});
for(const locale of ['en','ar'])test(`${locale}: simplified Outdoor workspace counts tasks and switches connection without losing a draft`,async({page})=>{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
 const state:FieldState={actor,projects:[],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 const statuses=['new_lead','new_lead','ready_for_quotation','new_lead','cancelled','new_lead'];
 state.projects=statuses.map((sales_status,i)=>({id:`11111111-1111-4111-8111-11111111111${i}`,project_name:`Site ${i}`,project_number:`PRJ-${i}`,created_by:actor.id,assigned_outdoor_sales_id:i===5?'other':actor.id,measurement_delayed:i===3,registeredBy:actor.name,address:'Baghdad',phone:null,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',structure_readiness:'ready',sales_status,next_follow_up_at:null,project_notes:null}));
 state.openings=[{id:'22222222-2222-4222-8222-222222222222',projectId:state.projects[0].id,floor:'Roof',room:'Kitchen',otherRoom:'',width:100,height:100,structuralType:'Skylight',openingType:null}];
 let network=true;const posts:FieldChange[]=[];
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',async route=>{
  if(!network)return route.abort('internetdisconnected');
  if(route.request().method()!=='POST')return route.fulfill({json:state});
  const change=route.request().postDataJSON() as FieldChange;posts.push(change);
  if(change.action==='finish')state.projects[0].sales_status='ready_for_quotation';
  return route.fulfill({json:{project:state.projects[0]}});
 });
 await page.goto('/offline?path=/intake');
 const nav=page.getByRole('navigation',{name:locale==='en'?'Outdoor Sales workspace':'مساحة عمل المبيعات الخارجية'});
 const badge=nav.getByRole('status');await expect(badge).toHaveText('2');
 await expect(nav.getByRole('button')).toHaveCount(3);
 await expect(nav.getByRole('button',{name:locale==='en'?'Logout':'تسجيل الخروج',exact:true})).toBeVisible();
 for(const text of ['Alumex · Device workspace','Open online system','Device workspace','Synced · Offline saving ready','Last synced','View measurement tasks','New measurement assignments'])await expect(page.getByText(text,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('complementary')).toHaveCount(0);
 const name=page.locator('input[autocomplete="name"]');await name.fill('Keep my draft');await page.locator('input[type="tel"]').fill('07700000000');
 const url=page.url();network=false;
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});
 const address=page.locator('input[autocomplete="street-address"]');await address.fill('Baghdad, Mansour');
 network=true;await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect(name).toHaveValue('Keep my draft');await expect(address).toHaveValue('Baghdad, Mansour');expect(page.url()).toBe(url);
 await page.screenshot({path:test.info().outputPath('simple-workspace.png'),fullPage:true});
 // Finish one real queued task offline; the badge updates immediately, then syncs automatically.
 network=false;await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});
 await page.goto('/offline?path=/initial-measurements/'+state.projects[0].id);
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await page.getByRole('button',{name:locale==='en'?'Finish measurements — ready for quotation':'إنهاء القياسات — جاهز لعرض السعر',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:locale==='en'?'Submit measurements':'إرسال القياسات',exact:true}).click();
 await expect(badge).toHaveText('1');expect(posts).toHaveLength(0);
 expect((await savedFieldState(page)).queue).toHaveLength(1);
 network=true;await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);expect(posts).toHaveLength(1);expect(posts[0].action).toBe('finish');
 await expect(badge).toHaveText('1');
 // Once the last waiting task closes on the server, its badge disappears on refresh.
 state.projects[1].sales_status='ready_for_quotation';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(badge).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
