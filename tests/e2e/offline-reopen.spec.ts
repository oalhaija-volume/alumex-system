import { savedFieldState as savedState } from './helpers/fieldState';
import { chromium, devices, expect, test, type BrowserContext } from '@playwright/test';
import type { FieldChange, FieldState } from '../../src/lib/offline/types';

for(const role of ['Indoor Sales','Outdoor Sales'])test(`${role}: real cached app survives browser restart, saves measurements offline, and reconnects exactly once`,async({},testInfo)=>{
 test.setTimeout(90000);
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Offline employee',role,branch:'Karkh' as const};
 const remote:FieldState={actor,projects:[],openings:[],queue:[],outdoorSales:[],indoorSales:[{id:actor.id,name:actor.name}],syncedAt:null};
 const received:FieldChange[]=[];
 const errors:string[]=[];
 const base=String(testInfo.project.use.baseURL);
 let context:BrowserContext|undefined;
 let networkAvailable=true;
 async function launch(offline=false){
  const current=await chromium.launchPersistentContext(testInfo.outputPath('device-profile'),{
   ...devices[testInfo.project.name.includes('mobile')?'Pixel 7':'Desktop Chrome'],
   executablePath:testInfo.project.use.launchOptions?.executablePath,serviceWorkers:'allow',
  });
  context=current;networkAvailable=!offline;
  await current.setOffline(offline);
  // Every API call is intercepted: no test record can reach Supabase.
  await current.route('**/api/**',async route=>{
   if(!networkAvailable)return route.abort('internetdisconnected');
   const url=new URL(route.request().url());
   if(url.pathname!=='/api/offline')return route.fulfill({status:404,json:{error:'Unexpected endpoint'}});
   if(route.request().method()==='GET')return route.fulfill({json:remote});
   const change=route.request().postDataJSON() as FieldChange;
   received.push(change);
   const project=remote.projects.find(p=>p.id===change.projectId);
   if(change.action==='register'){
    const p=change.payload.project as Record<string,unknown>,client=change.payload.client as Record<string,unknown>;
    remote.projects.push({id:change.projectId,project_name:String(client.clientName),project_number:'PRJ-OFFLINE',created_by:actor.id,registeredBy:actor.name,branch:actor.branch,assigned_outdoor_sales_id:actor.id,assignedOutdoorSales:actor.name,assignedToYou:true,original_creator_role:actor.role,created_at:change.recordedAt,updated_at:change.recordedAt,building_type:p.buildingType as 'villa_house'|undefined,address:String(p.address??''),phone:String(client.mobile),structure_readiness:String(p.structureReadiness),sales_status:'new_lead',next_follow_up_at:null,project_notes:null});
   }else if(change.action==='opening')remote.openings.push({...change.payload,projectId:change.projectId} as FieldState['openings'][number]);
   else if(change.action==='finish'&&project)project.sales_status='ready_for_quotation';
   const result=remote.projects.find(p=>p.id===change.projectId)!;result.updated_at=new Date().toISOString();
   await route.fulfill({json:{project:result}});
  });
  const page=current.pages()[0]??await current.newPage();page.on('pageerror',e=>errors.push(e.message));
  return page;
 }
 try{
  let page=await launch();
  await page.goto(base+'/offline?path=/dashboard');
  await expect(page.getByRole('heading',{name:role==='Outdoor Sales'?(testInfo.project.name.includes('mobile')?'Measurement assignments':'My sales dashboard'):'Sales dashboard',exact:true})).toBeVisible();
  if(role==='Indoor Sales')await expect(page.getByText('Synced · Offline saving ready',{exact:true})).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(async()=>(await (await caches.open('alumex-field-shell-v15')).keys()).some(r=>new URL(r.url).pathname==='/offline'))).toBe(true);
  const cachePaths=await page.evaluate(async()=>{const cache=await caches.open('alumex-field-shell-v15');return(await cache.keys()).map(r=>new URL(r.url).pathname);});
  expect(cachePaths).toContain('/offline');expect(cachePaths.some(p=>p.startsWith('/api/'))).toBe(false);
  await context!.close();context=undefined;
  page=await launch(true);
  const began=Date.now();await page.goto(base+'/offline?path=/intake');
  await expect(page.getByPlaceholder('Enter full name')).toBeVisible();
  const reopenMs=Date.now()-began;
  if(role==='Outdoor Sales')await page.locator('input[name="buildingType"][value="villa_house"]').check();
  await page.getByPlaceholder('Enter full name').fill('Offline reopening sample');
  await page.getByPlaceholder('07xx xxx xxxx').fill('07700000000');
  if(role==='Outdoor Sales')await page.locator('input[autocomplete="street-address"]').fill('Baghdad, Mansour');
  else{const coordinates=page.locator('input[type="number"]');await coordinates.nth(0).fill('33.3');await coordinates.nth(1).fill('44.4');await page.locator('#outdoor-assignee').selectOption(actor.id);}
  await page.getByRole('button',{name:/Continue to measurements/}).click();
  await expect(page.getByRole('heading',{name:'Initial measurements',exact:true})).toBeVisible();
  await page.getByLabel('Floor',{exact:true}).fill('Ground');
  await page.getByRole('combobox',{name:'Room',exact:true}).selectOption('Kitchen');
  await page.getByRole('combobox',{name:'Structural type',exact:true}).selectOption('Window');
  await page.getByRole('radio',{name:'Sliding',exact:true}).check();
  await page.getByLabel('Width (cm)',{exact:true}).fill('120');await page.getByLabel('Height (cm)',{exact:true}).fill('150');
  await page.getByRole('button',{name:'Save & add opening',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Saved openings (1)',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Finish measurements — ready for quotation',exact:true}).click();
  await expect(page.getByText(role==='Outdoor Sales'?'Measurements submitted. Indoor Sales will prepare the quotation.':'Measurements complete. This project is ready for quotation.',{exact:true})).toBeVisible();
  const before=await savedState(page);expect(before.queue.map(c=>c.action)).toEqual(['register','opening','finish']);
  const url=page.url();await context!.close();context=undefined;
  page=await launch(true);await page.goto(url);
  await expect(page.getByRole('heading',{name:'Saved openings (1)',exact:true})).toBeVisible();
  expect((await savedState(page)).queue.map(c=>c.id)).toEqual(before.queue.map(c=>c.id));
  await page.screenshot({path:testInfo.outputPath('reopened-offline.png'),fullPage:true});
  networkAvailable=true;await context!.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect.poll(async()=>(await savedState(page)).queue.length).toBe(0);
  expect(received.map(c=>c.id)).toEqual(before.queue.map(c=>c.id));
  expect(remote.projects).toHaveLength(1);expect(remote.projects[0].sales_status).toBe('ready_for_quotation');expect(remote.openings).toHaveLength(1);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(400);expect(received).toHaveLength(3);
  if(role==='Indoor Sales')await expect(page.getByText('Synced · Offline saving ready',{exact:true})).toBeVisible();
  await expect(page.getByText('Offline reopening sample · PRJ-OFFLINE',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  await testInfo.attach('offline-reopen-timing',{body:JSON.stringify({reopenMs,browserRestart:true,queuedChanges:3,synchronizedChanges:3}),contentType:'application/json'});
 }finally{await context?.close();}
});
