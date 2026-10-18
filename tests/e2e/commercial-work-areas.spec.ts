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
 for(const [index,area,location,type] of [[0,'facade','1','Curtain Wall'],[1,'facade','2','Curtain Wall'],[2,'internal','Office','Window'],[3,'internal','Bathroom','Door']] as const){
  await (area==='facade'?facade:internal).check();
  if(area==='facade'){await expect(room).toHaveCount(0);await number.fill(location);}
  else{await expect(number).toHaveCount(0);await room.selectOption(location);}
  await page.getByLabel(label('Floor','الطابق'),{exact:true}).selectOption('GF');
  await structure.selectOption(type);
  if(type==='Curtain Wall')await expect(page.getByRole('button',{name:label('Take photo','التقاط صورة'),exact:true})).toBeVisible();
  else{await page.getByRole('radio',{name:label('No arch','بدون قوس'),exact:true}).check();await page.getByRole('radio',{name:label('Sliding','سلايد'),exact:true}).check();}
  await page.getByLabel(label('Width (cm)','العرض (سم)'),{exact:true}).fill('200');
  await page.getByLabel(label('Height (cm)','الارتفاع (سم)'),{exact:true}).fill('300');
  if(index===0||index===2)await page.screenshot({path:test.info().outputPath(area+'-form.png'),fullPage:true});
  await save.click();await expect.poll(async()=>(await savedFieldState(page)).openings.length).toBe(index+1);
 }
 await page.reload();
 await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(4);
 await expect(page.getByRole('table')).toContainText(label('Facade 1','واجهة 1'));
 await expect(page.getByRole('table')).toContainText(label('Facade 2','واجهة 2'));
 await expect(page.getByRole('table')).toContainText(label('Internal works','اعمال داخلية'));
 await page.getByRole('button',{name:label('Edit opening 1','تعديل الفتحة ١'),exact:true}).click();
 await expect(facade).toBeChecked();await expect(number).toHaveValue('1');await expect(room).toHaveCount(0);
 await number.fill('3');
 await page.getByRole('button',{name:label('Save measurement changes','حفظ تعديلات القياسات'),exact:true}).click();
 await expect.poll(async()=>(await savedFieldState(page)).openings[0].facadeNumber).toBe(3);
 const openings=(await savedFieldState(page)).openings;
 expect(openings[0]).toMatchObject({workArea:'facade',facadeNumber:3,otherRoom:'Facade 3'});
 expect(openings[2]).toMatchObject({workArea:'internal',room:'Office',structuralType:'Window'});
 expect(openings[3]).toMatchObject({workArea:'internal',room:'Bathroom',structuralType:'Door'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('saved-areas.png'),fullPage:true});
 if(!online){expect(posts).toHaveLength(0);await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});}
 await expect.poll(()=>posts.length).toBe(5);await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 expect(posts[0].payload).toMatchObject({workArea:'facade',facadeNumber:1});expect(posts[4].payload.opening).toMatchObject({workArea:'facade',facadeNumber:3});
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
