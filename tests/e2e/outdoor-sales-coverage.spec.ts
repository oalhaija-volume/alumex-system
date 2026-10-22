import {expect,test,type Page} from '@playwright/test';
import type {OutdoorSalesCoverageData} from '../../src/lib/dashboard/outdoorSalesCoverage';
import type {FieldState} from '../../src/lib/offline/types';

// The device workspace isolates dashboard rendering at both viewport widths.
// All API requests use fixtures, and every business write is blocked.
test.use({serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});
const leaders=['Company Owner','Sales Director','CEO','Admin'];
const firstHalf:OutdoorSalesCoverageData={asOf:'2026-10-15T20:59:59Z',staff:[
 {id:'mohammad',name:'Mohammad Ahmad',branch:'Karkh'},
 {id:'ali',name:'Ali Ammar',branch:'Karkh'},
 {id:'ehab',name:'Ehab',branch:'Rasafa'},
 {id:'sajjad',name:'Sajjad Hasan',branch:'Rasafa'},
]};
const secondHalf:OutdoorSalesCoverageData={asOf:'2026-10-15T21:00:00Z',staff:firstHalf.staff.map(employee=>({...employee,branch:employee.branch==='Karkh'?'Rasafa':'Karkh'}))};
const nextMonth:OutdoorSalesCoverageData={...firstHalf,asOf:'2026-10-31T21:00:00Z'};

async function dashboard(page:Page,role:string,locale:string,value:OutdoorSalesCoverageData=secondHalf,hold=false){
 const state:FieldState={actor:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Dashboard employee',role,branch:'Karkh'},projects:[],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 const coverage={value,status:200,requests:0};
 const runtimeErrors:string[]=[],consoleErrors:string[]=[],writes:string[]=[];
 let release=()=>{};
 let held:Promise<void>|null=hold?new Promise(resolve=>{release=()=>{held=null;resolve();};}):null;
 page.on('pageerror',error=>runtimeErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await page.clock.setFixedTime(new Date('2032-03-04T09:00:00Z'));
 await page.addInitScript(locale=>{
  localStorage.setItem('alumex_locale',locale);
  Reflect.deleteProperty(Navigator.prototype,'serviceWorker');
 },locale);
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET'){
   writes.push(`${request.method()} ${path}`);
   return route.fulfill({status:400,json:{error:'Unexpected business write blocked by coverage test'}});
  }
  if(path==='/api/outdoor-sales-coverage'){
   coverage.requests++;
   if(held)await held;
   return route.fulfill({status:coverage.status,json:coverage.status===200?coverage.value:{error:'Unable to load Outdoor Sales coverage.'}});
  }
  return route.fulfill({json:path==='/api/notifications'?{notifications:[],unreadCount:0}:state});
 });
 await page.goto('/offline?path=/dashboard');
 await expect(page).toHaveURL(/\/offline\?path=\/dashboard$/);
 await expect(page).toHaveTitle(/Alumex|ألومكس/i);
 await expect(page.locator('h1')).toBeVisible();
 if(leaders.includes(role))await expect(page.getByRole('heading',{name:locale==='en'?'Outdoor Sales Coverage':'توزيع المبيعات الخارجية',exact:true})).toBeVisible();
 else await expect(page.getByRole('navigation',{name:role==='Outdoor Sales'?(locale==='en'?'Outdoor Sales workspace':'مساحة عمل المبيعات الخارجية'):undefined}).first()).toBeVisible();
 return {coverage,runtimeErrors,consoleErrors,writes,release};
}

function card(page:Page,locale:string){return page.getByRole('region',{name:locale==='en'?'Outdoor Sales Coverage':'توزيع المبيعات الخارجية',exact:true});}
function group(page:Page,locale:string,branch:'Karkh'|'Rasafa'){return card(page,locale).getByRole('region',{name:locale==='en'?branch:branch==='Karkh'?'الكرخ':'الرصافة',exact:true});}
async function assertCoverage(page:Page,locale:string,value:OutdoorSalesCoverageData,date:string){
 const coverage=card(page,locale);
 await expect(coverage.locator('time')).toHaveAttribute('datetime',value.asOf);
 await expect(coverage.locator('time')).toHaveText(date);
 await expect(coverage).toContainText(locale==='en'?'Baghdad time':'بتوقيت بغداد');
 await expect(coverage).toContainText(locale==='en'?'All Outdoor Sales staff can work in Governorates throughout the month.':'يمكن لجميع موظفي المبيعات الخارجية العمل في المحافظات طوال الشهر.');
 for(const branch of ['Karkh','Rasafa'] as const){
  await expect(group(page,locale,branch).getByRole('listitem')).toHaveText(value.staff.filter(employee=>employee.branch===branch).map(employee=>employee.name));
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await page.locator('nextjs-portal').allTextContents()).join(' ')).not.toMatch(/Build Error|Runtime Error|Unhandled Runtime Error/);
}

for(const role of leaders)for(const locale of ['en','ar'])test(`${role} ${locale}: leadership sees current staff grouped by branch`,async({page},testInfo)=>{
 const check=await dashboard(page,role,locale);
 await assertCoverage(page,locale,secondHalf,'16/10/2026');
 if(role==='Admin')await card(page,locale).screenshot({path:testInfo.outputPath('outdoor-sales-coverage.png')});
 expect(check.coverage.requests).toBeGreaterThan(0);
 expect(check.runtimeErrors).toEqual([]);expect(check.consoleErrors).toEqual([]);expect(check.writes).toEqual([]);
});

for(const role of ['Indoor Sales','Sales Manager','Outdoor Sales','HR','Project Engineer','Operations Manager'])test(`${role}: coverage card is absent and makes no coverage request`,async({page})=>{
 const check=await dashboard(page,role,'en');
 // The dashboard must finish rendering its own role before checking absence.
 if(role==='Indoor Sales'||role==='Sales Manager')await expect(page.getByRole('heading',{name:'Sales dashboard',exact:true})).toBeVisible();
 if(role==='Outdoor Sales')await expect(page.getByRole('heading',{name:'Measurement assignments',exact:true})).toBeVisible();
 else await expect(page.getByRole('region',{name:'Project filters',exact:true})).toBeVisible();
 await expect(card(page,'en')).toHaveCount(0);
 expect(check.coverage.requests).toBe(0);
 expect(check.runtimeErrors).toEqual([]);expect(check.consoleErrors).toEqual([]);expect(check.writes).toEqual([]);
});

for(const locale of ['en','ar'])for(const [name,value,date] of [['first half',firstHalf,'15/10/2026'],['month change',nextMonth,'01/11/2026']] as const)test(`${locale}: coverage uses the server ${name} date rather than the device clock`,async({page})=>{
 const check=await dashboard(page,'CEO',locale,value);
 await assertCoverage(page,locale,value,date);
 expect(check.runtimeErrors).toEqual([]);expect(check.consoleErrors).toEqual([]);
});

test('focus refresh moves staff between branches when the server assignment changes',async({page})=>{
 const check=await dashboard(page,'Sales Director','en',firstHalf);
 await assertCoverage(page,'en',firstHalf,'15/10/2026');
 check.coverage.value=secondHalf;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await assertCoverage(page,'en',secondHalf,'16/10/2026');
 check.coverage.value=nextMonth;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await assertCoverage(page,'en',nextMonth,'01/11/2026');
 expect(check.coverage.requests).toBeGreaterThanOrEqual(3);
 expect(check.runtimeErrors).toEqual([]);expect(check.consoleErrors).toEqual([]);expect(check.writes).toEqual([]);
});

for(const locale of ['en','ar'])test(`${locale}: missing rotations and empty branch groups are explicit`,async({page})=>{
 const value:OutdoorSalesCoverageData={asOf:secondHalf.asOf,staff:[{id:'unconfigured',name:'New Outdoor Employee',branch:null}]};
 const check=await dashboard(page,'Admin',locale,value);
 const unconfigured=card(page,locale).getByRole('region',{name:locale==='en'?'Rotation not configured':'التناوب غير محدد',exact:true});
 await expect(unconfigured).toContainText('New Outdoor Employee');
 for(const branch of ['Karkh','Rasafa'] as const)await expect(group(page,locale,branch)).toContainText(locale==='en'?'No Outdoor Sales staff assigned.':'لا يوجد موظفو مبيعات خارجية مخصصون لهذه المنطقة.');
 expect(check.runtimeErrors).toEqual([]);expect(check.consoleErrors).toEqual([]);
});

test('loading, failed refresh, and recovery do not show stale coverage as current',async({page})=>{
 const check=await dashboard(page,'Admin','en',firstHalf,true);
 await expect(card(page,'en').getByRole('status')).toHaveText('Loading Outdoor Sales coverage…');
 await expect(group(page,'en','Karkh')).toHaveCount(0);
 check.release();
 await assertCoverage(page,'en',firstHalf,'15/10/2026');
 check.coverage.status=503;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(card(page,'en').getByRole('alert')).toHaveText('Unable to load Outdoor Sales coverage.');
 await expect(group(page,'en','Karkh')).toHaveCount(0);
 await expect(card(page,'en').locator('time')).toHaveCount(0);
 check.coverage.status=200;check.coverage.value=secondHalf;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await assertCoverage(page,'en',secondHalf,'16/10/2026');
 await expect(card(page,'en').getByRole('alert')).toHaveCount(0);
 expect(check.runtimeErrors).toEqual([]);expect(check.writes).toEqual([]);
 expect(check.consoleErrors.every(message=>message.includes('503'))).toBe(true);
});
