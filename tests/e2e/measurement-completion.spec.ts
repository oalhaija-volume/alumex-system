import {expect,test} from '@playwright/test';
import {savedFieldState} from './helpers/fieldState';
import type {FieldChange,FieldState} from '../../src/lib/offline/types';
test.use({serviceWorkers:'block'});
const id='11111111-1111-4111-8111-111111111111';
function initialState():FieldState{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
 return {actor,projects:[{id,project_name:'Completion report sample',project_number:'PRJ-REPORT',created_by:actor.id,assigned_outdoor_sales_id:actor.id,registeredBy:actor.name,address:'Baghdad',phone:null,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',structure_readiness:'ready',sales_status:'new_lead',next_follow_up_at:null,project_notes:null}],openings:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',projectId:id,floor:'GF',room:'Kitchen',otherRoom:'',width:120,height:150,quantity:1,structuralType:'Window',openingType:'Sliding',hasArch:false}],measurementReports:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
}
for(const locale of ['en','ar'])for(const online of [true,false])test(`${locale}: completion popup saves optional photo and note ${online?'online':'offline'}`,async({page})=>{
 const state=initialState(),posts:FieldChange[]=[];const label=(en:string,ar:string)=>locale==='en'?en:ar;
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',async route=>{
  if(route.request().method()!=='POST')return route.fulfill({json:state});
  posts.push(route.request().postDataJSON());const local=await savedFieldState(page);state.projects=local.projects;state.measurementReports=local.measurementReports?.map(report=>({...report,photo:undefined}));
  return route.fulfill({json:{project:state.projects[0]}});
 });
 await page.goto('/offline?path=/initial-measurements/'+id);
 const finish=page.getByRole('button',{name:label('Finish measurements — ready for quotation','إنهاء القياسات — جاهز لعرض السعر'),exact:true});
 await expect(finish).toBeVisible();
 if(!online){await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));}
 await finish.click();const dialog=page.getByRole('dialog',{name:label('Finish measurements','إنهاء القياسات'),exact:true});await expect(dialog).toBeVisible();expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(513);
 expect((await savedFieldState(page)).projects[0].sales_status).toBe('new_lead');expect(posts).toHaveLength(0);
 const note=dialog.getByLabel(label('Note for Indoor Sales (optional)','ملاحظة للمبيعات الداخلية (اختياري)'));
 await note.fill('يرجى مراجعة المدخل الجانبي');
 await dialog.getByRole('button',{name:label('Back to measurements','العودة إلى القياسات'),exact:true}).click();
 await expect(dialog).not.toBeVisible();await expect(finish).toBeFocused();expect((await savedFieldState(page)).queue).toHaveLength(0);
 await finish.click();await expect(note).toHaveValue('يرجى مراجعة المدخل الجانبي');
 const camera=dialog.getByLabel(label('Take measurement photo','التقاط صورة للقياسات'),{exact:true});await expect(camera).toHaveAttribute('capture','environment');
 const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const ctx=c.getContext('2d')!;ctx.fillStyle='#e2e8f0';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#1d4ed8';ctx.fillRect(200,200,600,700);return c.toDataURL('image/png').split(',')[1];});
 await camera.setInputFiles({name:'site.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
 await expect(dialog.getByAltText(label('Measurement site photo','صورة موقع القياسات'))).toBeVisible();
 await expect(dialog.getByRole('button',{name:label('Submit measurements','إرسال القياسات'),exact:true})).toBeInViewport();
 await dialog.screenshot({path:test.info().outputPath('completion-popup.png')});
 await dialog.getByRole('button',{name:label('Submit measurements','إرسال القياسات'),exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect.poll(async()=>(await savedFieldState(page)).projects[0].sales_status).toBe('ready_for_quotation');
 const report=(await savedFieldState(page)).measurementReports![0];expect(report.note).toBe('يرجى مراجعة المدخل الجانبي');expect(report.photo).toMatch(/^data:image\/jpeg;base64,/);expect(report.photo!.length).toBeLessThan(700000);
 if(online)await expect.poll(()=>posts.length).toBe(1);else expect(posts).toHaveLength(0);
 await page.reload();await expect(page.getByText(report.note,{exact:true})).toBeVisible();await expect(page.getByAltText(label('Measurement site photo','صورة موقع القياسات'))).toBeVisible();
 if(!online)await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);expect(posts).toHaveLength(1);expect(posts[0].action).toBe('finish');expect(posts[0].payload).toMatchObject({note:report.note,photo:report.photo});
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const locale of ['en','ar'])test(`${locale}: submit without photo or note`,async({page})=>{
 const state=initialState();const posts:FieldChange[]=[];
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',async route=>{if(route.request().method()!=='POST')return route.fulfill({json:state});posts.push(route.request().postDataJSON());state.projects=(await savedFieldState(page)).projects;return route.fulfill({json:{project:state.projects[0]}});});
 await page.goto('/offline?path=/initial-measurements/'+id);
 await page.getByRole('button',{name:locale==='en'?'Finish measurements — ready for quotation':'إنهاء القياسات — جاهز لعرض السعر',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:locale==='en'?'Submit measurements':'إرسال القياسات',exact:true}).click();
 await expect.poll(()=>posts.length).toBe(1);expect(posts[0].payload).toEqual({note:'',photo:''});expect((await savedFieldState(page)).measurementReports).toHaveLength(0);
});
for(const locale of ['en','ar'])test(`${locale}: Indoor Sales reads notes and downloads the photo for offline review`,async({page})=>{
 const state=initialState();state.actor={...state.actor,role:'Indoor Sales',branch:'Karkh'};state.projects[0].sales_status='ready_for_quotation';
 const report={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',project_id:id,note:'مراجعة المدخل الجانبي',has_photo:true,recorded_by:state.actor.id,recorded_by_name:'Outdoor employee',recorded_at:'2026-10-18T08:00:00Z'};state.measurementReports=[report];
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6B1kAAAAASUVORK5CYII=';let reads=0;
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',route=>{if(route.request().url().includes('/measurement-reports/')){reads++;return route.fulfill({json:{photo}});}return route.fulfill({json:state});});
 await page.goto('/offline?path=/initial-measurements/'+id);await expect(page.getByText(report.note,{exact:true})).toBeVisible();expect(reads).toBe(0);
 await page.getByRole('button',{name:locale==='en'?'View site photo':'عرض صورة الموقع',exact:true}).click();
 await expect(page.getByAltText(locale==='en'?'Measurement site photo':'صورة موقع القياسات')).toBeVisible();expect(reads).toBe(1);
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));await page.reload();
 await expect(page.getByAltText(locale==='en'?'Measurement site photo':'صورة موقع القياسات')).toBeVisible();expect(reads).toBe(1);
});
