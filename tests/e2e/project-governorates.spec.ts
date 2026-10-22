import {expect,test,type Page} from '@playwright/test';
import {savedFieldState} from './helpers/fieldState';
import type {FieldActor,FieldChange,FieldState} from '../../src/lib/offline/types';

// A tablet user agent keeps the device workspace available at both test widths.
// Business endpoints are fixtures; these tests never register a live project.
test.use({serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});
const actor:FieldActor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
const governorates=['البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء','النجف','الديوانية','الكوت','العمارة','الناصرية','السماوة'];

async function prepare(page:Page,locale:string,employee:FieldActor=actor){
 const state:FieldState={actor:employee,projects:[],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 const posts:FieldChange[]=[];
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.addInitScript(()=>{
  const savedOnline=sessionStorage.getItem('governorate-test-online');
  if(savedOnline!==null)Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>savedOnline==='true'});
 });
 await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f6"/></svg>'}));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='GET')return route.fulfill({json:path==='/api/notifications'?{notifications:[],unreadCount:0}:state});
  if(path!=='/api/offline'||request.method()!=='POST')return route.fulfill({status:400,json:{error:'Unexpected business write blocked by test'}});
  const change=request.postDataJSON() as FieldChange;
  posts.push(change);
  state.projects=(await savedFieldState(page)).projects.map(project=>({...project,project_number:'PRJ-GOVERNORATES',pending:false}));
  return route.fulfill({json:{project:state.projects.find(project=>project.id===change.projectId)}});
 });
 await page.goto('/offline?path=/intake');
 await expect(page).toHaveURL(/\/offline\?path=\/intake$/);
 await expect(page).toHaveTitle(/Alumex/i);
 await expect(page.getByRole('heading',{name:locale==='en'?'New client & project':'عميل ومشروع جديد',exact:true})).toBeVisible();
 await expect(page.locator('input[autocomplete="name"]')).toBeVisible();
 return {state,posts,errors};
}

async function setOnline(page:Page,online:boolean){
 await page.evaluate(online=>{
  sessionStorage.setItem('governorate-test-online',String(online));
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>online});
  window.dispatchEvent(new Event(online?'online':'offline'));
 },online);
}

async function fillRegistration(page:Page,locale:string,online:boolean){
 await page.locator('input[name="buildingType"][value="villa_house"]').check();
 await page.locator('input[autocomplete="name"]').fill('Governorate registration test');
 await page.locator('input[type="tel"]').fill('07700000000');
 await page.locator('input[name="readiness"][value="not_ready"]').check();
 await page.locator('#readiness-note').fill('Walls are not ready for measurements.');
 if(online)await page.getByRole('button',{name:locale==='en'?'Project location map':'خريطة موقع المشروع',exact:true}).click({position:{x:80,y:80}});
 else{
  await setOnline(page,false);
  await page.locator('input[autocomplete="street-address"]').fill('البصرة، شارع الجزائر');
 }
}

for(const locale of ['en','ar'])for(const online of [true,false])test(`${locale}: required governorate survives ${online?'online registration':'offline registration and synchronization'}`,async({page},testInfo)=>{
 const {posts,errors}=await prepare(page,locale);
 const branches=page.locator('input[name="projectBranch"]');
 await expect(branches).toHaveCount(3);
 expect(await branches.evaluateAll(nodes=>nodes.map(node=>(node as HTMLInputElement).value))).toEqual(['Karkh','Rasafa','Governorates']);
 await expect(page.getByRole('radio',{name:locale==='en'?'Governorates':'محافظات',exact:true})).toBeVisible();
 const governorate=page.locator('#project-governorate');
 await expect(governorate).toHaveCount(0);
 await page.locator('input[name="projectBranch"][value="Governorates"]').check();
 await expect(governorate).toHaveAttribute('required','');
 expect(await governorate.locator('option').allTextContents()).toEqual([locale==='en'?'Choose a governorate':'اختر المحافظة',...governorates]);
 await governorate.selectOption('النجف');
 await page.locator('input[name="projectBranch"][value="Karkh"]').check();
 await expect(governorate).toHaveCount(0);
 await page.locator('input[name="projectBranch"][value="Governorates"]').check();
 await expect(governorate).toHaveValue('');
 await fillRegistration(page,locale,online);
 const save=page.getByRole('button',{name:locale==='en'?/Save registration/:/حفظ التسجيل/});
 await save.click();
 await expect(page.locator('p[role="alert"]').filter({hasText:locale==='en'?'Choose the project governorate.':'اختر محافظة المشروع.'})).toBeVisible();
 expect(posts).toHaveLength(0);
 expect((await savedFieldState(page)).queue).toHaveLength(0);
 await governorate.selectOption('البصرة');
 await page.getByRole('group',{name:locale==='en'?/Project branch/:/فرع المشروع/}).screenshot({path:`artifacts/project-governorates/${testInfo.project.name}-${locale}-${online?'online':'offline'}-branch.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await save.click();
 await expect(page.getByRole('heading',{name:locale==='en'?'Registration saved':'تم حفظ التسجيل',exact:true})).toBeVisible();
 const saved=await savedFieldState(page);
 expect(saved.projects[0]).toMatchObject({branch:'Governorates',governorate:'البصرة'});
 if(online){
  await expect.poll(()=>posts.length).toBe(1);
  await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 }else{
  expect(posts).toHaveLength(0);
  expect(saved.queue).toHaveLength(1);
  expect(saved.queue[0].payload.project).toMatchObject({branch:'Governorates',governorate:'البصرة'});
  await page.reload();
  await expect(page.locator('input[autocomplete="name"]')).toBeVisible();
  expect((await savedFieldState(page)).projects[0]).toMatchObject({branch:'Governorates',governorate:'البصرة'});
  await setOnline(page,true);
  await expect.poll(()=>posts.length).toBe(1);
  await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 }
 expect(posts[0].payload.project).toMatchObject({branch:'Governorates',governorate:'البصرة'});
 expect((await savedFieldState(page)).projects[0]).toMatchObject({branch:'Governorates',governorate:'البصرة'});
 if(online){
  await page.getByRole('button',{name:locale==='en'?'Register another client':'تسجيل عميل آخر',exact:true}).click();
  await expect(page.locator('input[name="projectBranch"]:checked')).toHaveCount(0);
  await expect(governorate).toHaveCount(0);
  await page.locator('input[name="projectBranch"][value="Governorates"]').check();
  await expect(governorate).toHaveValue('');
 }
 expect(errors).toEqual([]);
});

test('switching from Governorates preserves the legacy Karkh payload without a stale governorate',async({page})=>{
 const {posts,errors}=await prepare(page,'en');
 await page.locator('input[name="projectBranch"][value="Governorates"]').check();
 await page.locator('#project-governorate').selectOption('الرمادي');
 await page.locator('input[name="projectBranch"][value="Karkh"]').check();
 await fillRegistration(page,'en',true);
 await page.getByRole('button',{name:/Save registration/}).click();
 await expect(page.getByRole('heading',{name:'Registration saved',exact:true})).toBeVisible();
 await expect.poll(()=>posts.length).toBe(1);
 expect(posts[0].payload.project).toMatchObject({branch:'Karkh'});
 expect(posts[0].payload.project).not.toHaveProperty('governorate');
 expect((await savedFieldState(page)).projects[0].governorate??null).toBeNull();
 expect(errors).toEqual([]);
});

for(const role of ['Indoor Sales','Sales Manager','Admin'])test(`${role} does not receive the Outdoor-only branch and governorate controls`,async({page})=>{
 const {errors}=await prepare(page,'en',{...actor,role,branch:'Karkh'});
 await expect(page.locator('input[name="projectBranch"]')).toHaveCount(0);
 await expect(page.locator('#project-governorate')).toHaveCount(0);
 expect(errors).toEqual([]);
});
