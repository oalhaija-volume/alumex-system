import {expect,test} from '@playwright/test';
import {savedFieldState} from './helpers/fieldState';
import type {FieldChange,FieldState} from '../../src/lib/offline/types';

test.use({serviceWorkers:'block'});
for(const locale of ['en','ar'])for(const readiness of ['ready','not_ready'])test(`${locale}: offline ${readiness} registration needs only an address and syncs after reload`,async({page})=>{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
 const state:FieldState={actor,projects:[],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 const posts:FieldChange[]=[];
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/offline*',async route=>{
  if(route.request().method()!=='POST')return route.fulfill({json:state});
  const change=route.request().postDataJSON();posts.push(change);
  state.projects=(await savedFieldState(page)).projects.map(project=>({...project,project_number:'PRJ-ADDRESS',pending:false}));
  return route.fulfill({json:{project:state.projects.find(project=>project.id===change.projectId)}});
 });
 await page.goto('/offline?path=/intake');
 await expect(page.locator('input[autocomplete="name"]')).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await page.locator('input[name="buildingType"][value="villa_house"]').check();
 await page.locator('input[autocomplete="name"]').fill('Offline address client');
 await page.locator('input[type="tel"]').fill('07700000000');
 await page.locator(`input[value="${readiness}"]`).check();
 if(readiness==='not_ready')await page.locator('#readiness-note').fill('Walls unfinished');
 const save=page.getByRole('button',{name:readiness==='ready'?(locale==='en'?/Continue to measurements/:/متابعة إلى القياسات/):(locale==='en'?/Save registration/:/حفظ التسجيل/)});
 await expect(page.locator('input[type="number"]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:locale==='en'?'Project location map':'خريطة موقع المشروع',exact:true})).toHaveCount(0);
 await save.click();
 await expect(page.locator('p[role="alert"]')).toContainText(locale==='en'?'Enter the project site address.':'أدخل عنوان موقع المشروع.');
 expect((await savedFieldState(page)).queue).toHaveLength(0);
 const address=locale==='en'?'Baghdad, Mansour, Street 14':'بغداد، المنصور، شارع ١٤';
 await page.locator('input[autocomplete="street-address"]').fill(address);
 if(readiness==='not_ready'){
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
  await expect(page.locator('input[autocomplete="street-address"]')).toHaveValue(address);
  await expect(page.getByRole('button',{name:locale==='en'?'Project location map':'خريطة موقع المشروع',exact:true})).toHaveCount(0);
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});
 }
 await page.screenshot({path:test.info().outputPath('address-form.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await save.click();
 await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(1);
 if(readiness==='ready')await expect(page).toHaveURL(/\/offline\?project=/);
 else await expect(page.locator('section[role="status"]')).toBeVisible();
 const saved=await savedFieldState(page);
 expect(saved.projects[0].address).toBe(address);
 expect(saved.queue[0].payload.project).toMatchObject({address,locationLatitude:null,locationLongitude:null});
 expect(posts).toHaveLength(0);
 await page.reload();
 if(readiness==='ready')await expect(page.getByRole('heading',{name:locale==='en'?'Initial measurements':'القياسات الأولية',exact:true})).toBeVisible();
 else await expect(page.locator('input[autocomplete="name"]')).toBeVisible();
 expect((await savedFieldState(page)).projects[0].address).toBe(address);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect.poll(()=>posts.length).toBe(1);
 await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 expect(posts[0].payload.project).toMatchObject({address,locationLatitude:null,locationLongitude:null});
 expect((await savedFieldState(page)).projects[0].address).toBe(address);
});
