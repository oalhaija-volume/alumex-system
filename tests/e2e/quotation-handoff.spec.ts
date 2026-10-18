import {expect,test} from '@playwright/test';
import type {FieldState} from '../../src/lib/offline/types';
test.use({serviceWorkers:'block'});
for(const role of ['Outdoor Sales','Indoor Sales'])for(const locale of ['en','ar'])test(`${role} ${locale}: completed measurements hand off quotation preparation by role`,async({page})=>{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Measurement employee',role,branch:'Karkh' as const};
 const id='11111111-1111-4111-8111-111111111111';
 const state:FieldState={actor,projects:[{id,project_name:'Completed measurement project',project_number:'PRJ-HANDOFF',structure_readiness:'ready',sales_status:'ready_for_quotation',address:'Baghdad',phone:null,created_by:actor.id,registeredBy:actor.name,assigned_outdoor_sales_id:actor.id,assignedToYou:true,assignedOutdoorSales:actor.name,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),next_follow_up_at:null,project_notes:null}],openings:[],queue:[],indoorSales:[],outdoorSales:[],syncedAt:null};
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',route=>route.fulfill({json:state}));
 await page.goto('/offline?path=/initial-measurements/'+id);
 const quotation=page.locator(`a[href="/quotation/${id}"]`);
 if(role==='Outdoor Sales'){
  await expect(page.getByText(locale==='en'?'Measurements submitted. Indoor Sales will prepare the quotation.':'تم إرسال القياسات. سيتولى موظف المبيعات الداخلية إعداد عرض السعر.',{exact:true})).toBeVisible();
  await expect(quotation).toHaveCount(0);
  await expect(page.locator('section a[href="/dashboard"]')).toBeVisible();
 }else await expect(quotation).toBeVisible();
 // The same role rule survives the offline device path, independent of viewport.
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await page.reload();
 await expect(page.getByRole('heading',{name:locale==='en'?'Initial measurements':'القياسات الأولية',exact:true})).toBeVisible();
 await expect(quotation).toHaveCount(role==='Outdoor Sales'?0:1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
