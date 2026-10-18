import {expect,test} from '@playwright/test';
import {savedFieldState} from './helpers/fieldState';
import type {FieldChange,FieldState} from '../../src/lib/offline/types';
import type {BuildingType} from '../../src/lib/intake/buildingType';
test.use({serviceWorkers:'block'});
const id='11111111-1111-4111-8111-111111111111';
function fixture(building_type:BuildingType):FieldState{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
 return {actor,projects:[{id,project_name:'Building measurements',project_number:'PRJ-AREAS',building_type,created_by:actor.id,registeredBy:actor.name,address:'Baghdad',phone:null,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',structure_readiness:'ready',sales_status:'new_lead',next_follow_up_at:null,project_notes:null}],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
}
for(const locale of ['en','ar'])for(const online of [true,false])test(`${locale}: commercial facades and internal rooms persist ${online?'online':'offline'}`,async({page})=>{
 const state=fixture('commercial_building'),posts:FieldChange[]=[];
 const label=(en:string,ar:string)=>locale==='en'?en:ar;
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',async route=>{
  if(route.request().method()!=='POST')return route.fulfill({json:state});
  posts.push(route.request().postDataJSON());const local=await savedFieldState(page);state.projects=local.projects;state.openings=local.openings;
  return route.fulfill({json:{project:state.projects[0]}});
 });
 await page.goto('/offline?path=/initial-measurements/'+id);
 const facade=page.getByRole('radio',{name:label('Facade','واجهة'),exact:true});
 const internal=page.getByRole('radio',{name:label('Internal works','اعمال داخلية'),exact:true});
 const room=page.getByRole('combobox',{name:label('Room','الغرفة'),exact:true});
 const number=page.getByLabel(label('Facade number','رقم الواجهة'),{exact:true});
 const structure=page.getByRole('combobox',{name:label('Structural type','النوع الإنشائي'),exact:true});
 const save=page.getByRole('button',{name:label('Save & add opening','حفظ وإضافة فتحة'),exact:true});
 await expect(facade).toBeVisible();await expect(room).toHaveCount(0);
 if(!online){await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));}
 for(let index=0;index<4;index++){
  if(index===0)await facade.check();
  else await page.getByRole('button',{name:label('Add another facade','إضافة واجهة أخرى'),exact:true}).click();
  await expect(number).toHaveValue(String(index+1));
  await expect(room).toHaveCount(0);await expect(structure).toHaveCount(0);
  await expect(page.getByLabel(label('Floor','الطابق'),{exact:true})).toHaveCount(0);
  await expect(page.getByLabel(label('Number of identical openings','عدد الفتحات المتطابقة'),{exact:true})).toHaveCount(0);
  await page.getByLabel(label('Width (cm)','العرض (سم)'),{exact:true}).fill(String(1000+index*100));
  await page.getByLabel(label('Length (cm)','الطول (سم)'),{exact:true}).fill(String(2000+index*100));
  if(index===0)await page.screenshot({path:test.info().outputPath('facade-form.png'),fullPage:true});
  await page.getByRole('button',{name:label('Save facade','حفظ الواجهة'),exact:true}).click();
  await expect.poll(async()=>(await savedFieldState(page)).openings.length).toBe(index+1);
 }
 for(const [index,location,type] of [[4,'Office','Window'],[5,'Bathroom','Door']] as const){
  await page.getByRole('button',{name:label('Add internal opening','إضافة فتحة داخلية'),exact:true}).click();
  await expect(internal).toBeChecked();await expect(number).toHaveCount(0);await room.selectOption(location);
  await page.getByLabel(label('Floor','الطابق'),{exact:true}).selectOption('F1');
  await structure.selectOption(type);
  await page.getByRole('radio',{name:label('No arch','بدون قوس'),exact:true}).check();
  await page.getByRole('radio',{name:label('Sliding','سلايد'),exact:true}).check();
  await page.getByLabel(label('Width (cm)','العرض (سم)'),{exact:true}).fill('200');
  await page.getByLabel(label('Height (cm)','الارتفاع (سم)'),{exact:true}).fill('300');
  if(index===4)await page.screenshot({path:test.info().outputPath('internal-form.png'),fullPage:true});
  await save.click();await expect.poll(async()=>(await savedFieldState(page)).openings.length).toBe(index+1);
 }
 await page.reload();
 const facadeList=page.getByRole('region',{name:label('Saved facades','الواجهات المحفوظة'),exact:true});
 await expect(facadeList.getByRole('table').locator('tbody tr')).toHaveCount(4);
 await expect(page.getByRole('table').last().locator('tbody tr')).toHaveCount(2);
 await page.getByRole('button',{name:label('Edit facade 1','تعديل واجهة 1'),exact:true}).click();
 await expect(facade).toBeChecked();await expect(number).toHaveValue('1');await expect(room).toHaveCount(0);
 await page.getByLabel(label('Length (cm)','الطول (سم)'),{exact:true}).fill('2500');
 await page.getByRole('button',{name:label('Save measurement changes','حفظ تعديلات القياسات'),exact:true}).click();
 await expect.poll(async()=>(await savedFieldState(page)).openings[0].height).toBe(2500);
 const openings=(await savedFieldState(page)).openings;
 expect(openings[0]).toMatchObject({workArea:'facade',facadeNumber:1,otherRoom:'Facade 1',structuralType:'Facade',floor:'Whole building',quantity:1,width:1000,height:2500,openingType:null});
 expect(openings[4]).toMatchObject({workArea:'internal',room:'Office',structuralType:'Window'});
 expect(openings[5]).toMatchObject({workArea:'internal',room:'Bathroom',structuralType:'Door'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('saved-areas.png'),fullPage:true});
 if(!online){expect(posts).toHaveLength(0);await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});}
 await expect.poll(()=>posts.length).toBe(7);await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 expect(posts[0].payload).toMatchObject({structuralType:'Facade',workArea:'facade',facadeNumber:1});expect(posts[6].payload.opening).toMatchObject({workArea:'facade',facadeNumber:1,height:2500});

});
for(const locale of ['en','ar'])for(const type of ['villa_house','residential_building'] as const)test(`${locale}: ${type} retains the existing room menu`,async({page})=>{
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',route=>route.fulfill({json:fixture(type)}));
 await page.goto('/offline?path=/initial-measurements/'+id);
 const room=page.getByRole('combobox',{name:locale==='en'?'Room':'الغرفة',exact:true});
 await expect(room).toBeVisible();await expect(room.locator('option')).toHaveCount(12);
 await expect(page.getByRole('radio',{name:locale==='en'?'Facade':'واجهة',exact:true})).toHaveCount(0);
 await expect(page.getByRole('radio',{name:locale==='en'?'Internal works':'اعمال داخلية',exact:true})).toHaveCount(0);
 await room.selectOption('Bedroom');await expect(room).toHaveValue('Bedroom');
 await room.selectOption('Bathroom');await expect(room).toHaveValue('Bathroom');
});
