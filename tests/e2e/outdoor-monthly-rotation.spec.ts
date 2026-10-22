import {expect,test,type Page} from '@playwright/test';
import {savedFieldState} from './helpers/fieldState';
import type {FieldActor,FieldChange,FieldState} from '../../src/lib/offline/types';

// Desktop and mobile viewports use a tablet user agent to exercise the field
// workspace. Every business request is intercepted; no live project is written.
test.use({serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});

const employees=[
 {name:'Mohammad',outdoorRotationStartBranch:'Karkh'},
 {name:'Ali',outdoorRotationStartBranch:'Karkh'},
 {name:'Ehab',outdoorRotationStartBranch:'Rasafa'},
 {name:'Sajjad',outdoorRotationStartBranch:'Rasafa'},
] as const;
const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function prepare(page:Page,locale:string,employee:Pick<FieldActor,'name'|'outdoorRotationStartBranch'>,date:string){
 await page.clock.setFixedTime(new Date(date));
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 const state:FieldState={actor:{id:actorId,role:'Outdoor Sales',...employee},projects:[],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 const posts:FieldChange[]=[];
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f6"/></svg>'}));
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='GET')return route.fulfill({json:path==='/api/notifications'?{notifications:[],unreadCount:0}:state});
  if(path==='/api/offline')posts.push(request.postDataJSON() as FieldChange);
  return route.fulfill({status:400,json:{error:'Business write blocked by rotation test'}});
 });
 await page.goto('/offline?path=/intake');
 await expect(page).toHaveURL(/\/offline\?path=\/intake$/);
 await expect(page).toHaveTitle(/Alumex|ألومكس/i);
 await expect(page.getByRole('heading',{name:locale==='en'?'New client & project':'عميل ومشروع جديد',exact:true})).toBeVisible();
 await expect(page.locator('input[name="projectBranch"]')).not.toHaveCount(0);
 return {posts,errors};
}

async function fillOfflineRegistration(page:Page){
 await page.evaluate(()=>{
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
  window.dispatchEvent(new Event('offline'));
 });
 await page.locator('input[name="buildingType"][value="villa_house"]').check();
 await page.locator('input[autocomplete="name"]').fill('Monthly rotation test');
 await page.locator('input[type="tel"]').fill('07700000000');
 await page.locator('input[autocomplete="street-address"]').fill('Baghdad, field visit');
 await page.locator('input[name="readiness"][value="not_ready"]').check();
 await page.locator('#readiness-note').fill('Site is not ready for measurements.');
}

function saveButton(page:Page,locale:string){
 return page.getByRole('button',{name:locale==='en'?/Save registration/:/حفظ التسجيل/});
}

for(const locale of ['en','ar'])for(const employee of employees)for(const half of ['first','second'])test(`${locale}: ${employee.name} can register only the assigned Baghdad branch in the ${half} half`,async({page},testInfo)=>{
 const date=half==='first'?'2026-10-10T09:00:00Z':'2026-10-20T09:00:00Z';
 const assigned=half==='first'?employee.outdoorRotationStartBranch:employee.outdoorRotationStartBranch==='Karkh'?'Rasafa':'Karkh';
 const forbidden=assigned==='Karkh'?'Rasafa':'Karkh';
 const {posts,errors}=await prepare(page,locale,employee,date);
 const branches=page.locator('input[name="projectBranch"]');
 expect(await branches.evaluateAll(nodes=>nodes.map(node=>(node as HTMLInputElement).value))).toEqual([assigned,'Governorates']);
 await expect(page.locator(`input[name="projectBranch"][value="${forbidden}"]`)).toHaveCount(0);
 await expect(page.locator('input[name="projectBranch"]:checked')).toHaveCount(0);
 await expect(page.locator('#project-branch-assignment')).toContainText(locale==='en'?assigned:assigned==='Karkh'?'الكرخ':'الرصافة');
 await expect(page.locator('#project-branch-rotation')).toHaveText(locale==='en'?'The Baghdad assignment changes on the 1st and 16th of each month (Baghdad time).':'تتغير منطقة العمل في بغداد يومي 1 و16 من كل شهر بتوقيت بغداد.');
 await page.locator('input[name="projectBranch"][value="Governorates"]').check();
 await expect(page.locator('#project-governorate')).toBeVisible();
 await page.locator('#project-governorate').selectOption('البصرة');
 await page.locator(`input[name="projectBranch"][value="${assigned}"]`).check();
 await expect(page.locator('#project-governorate')).toHaveCount(0);
 if(employee.name==='Mohammad'&&half==='second'){
  await page.getByRole('group',{name:locale==='en'?/Project branch/:/فرع المشروع/}).screenshot({path:testInfo.outputPath('monthly-assignment.png')});
  await page.screenshot({path:testInfo.outputPath('monthly-assignment-page.png'),fullPage:false});
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await fillOfflineRegistration(page);
 await saveButton(page,locale).click();
 await expect(page.getByRole('heading',{name:locale==='en'?'Registration saved':'تم حفظ التسجيل',exact:true})).toBeVisible();
 const saved=await savedFieldState(page);
 expect(saved.projects[0].branch).toBe(assigned);
 expect(saved.queue).toHaveLength(1);
 expect(saved.queue[0].payload.project).toMatchObject({branch:assigned});
 expect(saved.queue[0].payload.project).not.toHaveProperty('governorate');
 expect(posts).toHaveLength(0);
 expect(errors).toEqual([]);
});

for(const locale of ['en','ar'])test(`${locale}: an unconfigured employee can still register Governorates`,async({page})=>{
 const {posts,errors}=await prepare(page,locale,{name:'Unconfigured employee'},'2026-10-20T09:00:00Z');
 const branches=page.locator('input[name="projectBranch"]');
 await expect(branches).toHaveCount(1);
 await expect(branches).toHaveValue('Governorates');
 await expect(page.locator('#project-branch-assignment')).toContainText(locale==='en'?'ask Admin to set your rotation':'اطلب من المسؤول تحديد تناوبك');
 await branches.check();
 await page.locator('#project-governorate').selectOption('النجف');
 await fillOfflineRegistration(page);
 await saveButton(page,locale).click();
 await expect(page.getByRole('heading',{name:locale==='en'?'Registration saved':'تم حفظ التسجيل',exact:true})).toBeVisible();
 const saved=await savedFieldState(page);
 expect(saved.queue[0].payload.project).toMatchObject({branch:'Governorates',governorate:'النجف'});
 expect(posts).toHaveLength(0);
 expect(errors).toEqual([]);
});

for(const boundary of [
 {name:'16th',before:'2026-10-15T20:59:59Z',after:'2026-10-15T21:00:00Z',previous:'Karkh',next:'Rasafa',event:'focus'},
 {name:'new month',before:'2026-10-31T20:59:59Z',after:'2026-10-31T21:00:00Z',previous:'Rasafa',next:'Karkh',event:'visibilitychange'},
])test(`Baghdad ${boundary.name} clears a stale branch after ${boundary.event}`,async({page})=>{
 const {errors}=await prepare(page,'en',employees[0],boundary.before);
 await page.locator(`input[name="projectBranch"][value="${boundary.previous}"]`).check();
 await page.locator('input[autocomplete="name"]').fill('Keep the draft');
 await page.clock.setFixedTime(new Date(boundary.after));
 await page.evaluate(event=>{(event==='focus'?window:document).dispatchEvent(new Event(event));},boundary.event);
 await expect(page.locator(`input[name="projectBranch"][value="${boundary.previous}"]`)).toHaveCount(0);
 await expect(page.locator(`input[name="projectBranch"][value="${boundary.next}"]`)).toBeVisible();
 await expect(page.locator('input[name="projectBranch"]:checked')).toHaveCount(0);
 await expect(page.locator('input[autocomplete="name"]')).toHaveValue('Keep the draft');
 await page.locator('input[name="projectBranch"][value="Governorates"]').check();
 await page.locator('#project-governorate').selectOption('البصرة');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('input[name="projectBranch"][value="Governorates"]')).toBeChecked();
 await expect(page.locator('#project-governorate')).toHaveValue('البصرة');
 expect(errors).toEqual([]);
});

for(const locale of ['en','ar'])test(`${locale}: submit checks the current Baghdad date before queuing a stale branch`,async({page})=>{
 const {posts,errors}=await prepare(page,locale,employees[0],'2026-10-15T20:59:59Z');
 await page.locator('input[name="projectBranch"][value="Karkh"]').check();
 await fillOfflineRegistration(page);
 // No focus/visibility event: submission itself must reject the expired choice.
 await page.clock.setFixedTime(new Date('2026-10-15T21:00:00Z'));
 await saveButton(page,locale).click();
 await expect(page.locator('p[role="alert"]')).toHaveText(locale==='en'?'You can only create projects for your assigned branch or Governorates during this half of the month.':'يمكنك إنشاء مشاريع للفرع المخصص لك أو للمحافظات فقط خلال هذا النصف من الشهر.');
 await expect(page.locator('input[name="projectBranch"][value="Karkh"]')).toHaveCount(0);
 await expect(page.locator('input[name="projectBranch"]:checked')).toHaveCount(0);
 expect((await savedFieldState(page)).queue).toHaveLength(0);
 expect(posts).toHaveLength(0);
 await page.locator('input[name="projectBranch"][value="Rasafa"]').check();
 await saveButton(page,locale).click();
 await expect(page.getByRole('heading',{name:locale==='en'?'Registration saved':'تم حفظ التسجيل',exact:true})).toBeVisible();
 expect((await savedFieldState(page)).queue[0].payload.project).toMatchObject({branch:'Rasafa'});
 expect(errors).toEqual([]);
});
