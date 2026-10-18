import {expect,test} from '@playwright/test';
import {savedFieldState} from './helpers/fieldState';
import type {FieldChange,FieldState} from '../../src/lib/offline/types';
test.use({serviceWorkers:'block'});
for(const locale of ['en','ar'])for(const online of [true,false])test(`${locale}: skylight photo, drawing and sections persist ${online?'online':'offline'}`,async({page,isMobile})=>{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Outdoor employee',role:'Outdoor Sales'};
 const id='11111111-1111-4111-8111-111111111111';
 const state:FieldState={actor,projects:[{id,project_name:'Skylight field test',project_number:'PRJ-SKYLIGHT',created_by:actor.id,registeredBy:actor.name,address:'Baghdad',phone:null,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',structure_readiness:'ready',sales_status:'new_lead',next_follow_up_at:null,project_notes:null}],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 const posts:FieldChange[]=[];let captureReads=0;
 const label=(en:string,ar:string)=>locale==='en'?en:ar;
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/api/**',async route=>{
  if(route.request().url().includes('/skylight-capture/')){captureReads++;return route.fulfill({status:500,json:{error:'Unexpected media request'}});}
  if(route.request().method()!=='POST')return route.fulfill({json:state});
  const change=route.request().postDataJSON();posts.push(change);
  const local=await savedFieldState(page);
  // Server snapshots intentionally omit image bytes. A refresh must retain cached media.
  state.openings=local.openings.map(({skylight,...opening})=>({...opening,hasSkylightCapture:Boolean(skylight)}));state.projects=local.projects;
  return route.fulfill({json:{project:state.projects[0]}});
 });
 await page.goto('/offline?path=/initial-measurements/'+id);
 const structure=page.getByRole('combobox',{name:label('Structural type','النوع الإنشائي'),exact:true});
 await expect(structure).toBeVisible();
 if(!online)await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});
 await page.getByLabel(label('Floor','الطابق'),{exact:true}).fill('Roof');
 await page.getByRole('combobox',{name:label('Room','الغرفة'),exact:true}).selectOption('Kitchen');
 await structure.selectOption('Skylight');
 const camera=page.getByLabel(label('Take skylight photo','التقاط صورة للسكاي لايت'),{exact:true});
 await expect(camera).toHaveAttribute('capture','environment');
 const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const ctx=c.getContext('2d')!;ctx.fillStyle='#e2e8f0';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#334155';ctx.fillRect(100,100,300,900);ctx.fillRect(100,700,1200,300);return c.toDataURL('image/png').split(',')[1];});
 await camera.setInputFiles({name:'skylight.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
 await expect(page.getByAltText(label('Skylight site photo','صورة السكاي لايت في الموقع'))).toBeVisible();
 const canvas=page.getByLabel(label('Draw skylight shape','ارسم شكل السكاي لايت'),{exact:true});
 await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!;
 const points=[[.2,.2],[.2,.8],[.8,.8],[.8,.6],[.4,.6],[.4,.2],[.2,.2]].map(([x,y])=>({x:box.x+box.width*x,y:box.y+box.height*y}));
 if(isMobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});for(const p of points.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y,{steps:3});await page.mouse.up();}
 await expect(page.getByRole('button',{name:label('Undo stroke','تراجع عن آخر خط'),exact:true})).toBeEnabled();
 for(const values of [['200','600'],['300','250']]){
  await page.getByRole('button',{name:label('Add width / length section','إضافة جزء بعرض وطول'),exact:true}).click();
  await page.getByLabel(label('Section width (cm)','عرض الجزء (سم)'),{exact:true}).last().fill(values[0]);
  await page.getByLabel(label('Section length (cm)','طول الجزء (سم)'),{exact:true}).last().fill(values[1]);
 }
 await page.getByLabel(label('Width (cm)','العرض (سم)'),{exact:true}).fill('500');
 await page.getByLabel(label('Length (cm)','الطول (سم)'),{exact:true}).fill('600');
 await page.getByRole('button',{name:label('Save & add opening','حفظ وإضافة فتحة'),exact:true}).click();
 await expect.poll(async()=>(await savedFieldState(page)).openings.length).toBe(1);
 const saved=(await savedFieldState(page)).openings[0].skylight!;
 expect(saved.photo).toMatch(/^data:image\/jpeg;base64,/);expect(saved.photo!.length).toBeLessThan(700000);
 expect(saved.drawing).toMatch(/^data:image\/png;base64,/);expect(saved.sections).toEqual([{label:'A',width:200,length:600},{label:'B',width:300,length:250}]);
 if(!online){expect(posts).toHaveLength(0);await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));}
 await page.reload();
 const view=page.getByRole('button',{name:new RegExp(label('Skylight shape and measurements','شكل السكاي لايت وقياساته'))});
 await view.click();
 await expect(page.getByAltText(label('Skylight shape drawing','رسم شكل السكاي لايت'))).toBeVisible();
 await expect(page.getByAltText(label('Skylight site photo','صورة السكاي لايت في الموقع'))).toBeVisible();
 expect((await savedFieldState(page)).openings[0].skylight).toEqual(saved);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('skylight-saved.png'),fullPage:true});
 if(!online)await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect.poll(()=>posts.length).toBe(1);
 await expect.poll(async()=>(await savedFieldState(page)).queue.length).toBe(0);
 expect(posts[0].payload.skylight).toEqual(saved);expect(captureReads).toBe(0);
});

test('Indoor Sales downloads a saved skylight on demand and reopens it offline',async({page})=>{
 const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Indoor employee',role:'Indoor Sales',branch:'Karkh' as const};
 const id='11111111-1111-4111-8111-111111111111',openingId='22222222-2222-4222-8222-222222222222';
 const state:FieldState={actor,projects:[{id,project_name:'Skylight review',project_number:'PRJ-SKYLIGHT',created_by:actor.id,registeredBy:actor.name,address:'Baghdad',phone:null,created_at:'2026-10-18T08:00:00Z',updated_at:'2026-10-18T08:00:00Z',structure_readiness:'ready',sales_status:'ready_for_quotation',next_follow_up_at:null,project_notes:null}],openings:[{id:openingId,projectId:id,floor:'Roof',room:'Other',otherRoom:'Roof',width:500,height:600,quantity:1,structuralType:'Skylight',openingType:null,hasSkylightCapture:true}],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]};
 let reads=0;
 const capture={drawing:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6B1kAAAAASUVORK5CYII=',sections:[{label:'A',width:200,length:600}]};
 await page.addInitScript(()=>localStorage.setItem('alumex_locale','en'));
 await page.route('**/api/**',route=>{if(route.request().url().includes('/skylight-capture/')){reads++;return route.fulfill({json:{skylight:capture}});}return route.fulfill({json:state});});
 await page.goto('/offline?path=/initial-measurements/'+id);
 const button=page.getByRole('button',{name:/Skylight shape and measurements/});await expect(button).toBeVisible();expect(reads).toBe(0);
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));await button.click();
 await expect(page.getByText('Connect once to download this skylight photo and drawing.',{exact:true})).toBeVisible();expect(reads).toBe(0);
 await button.click();await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true}));await button.click();
 await expect(page.getByAltText('Skylight shape drawing')).toBeVisible();expect(reads).toBe(1);
 await expect.poll(async()=>(await savedFieldState(page)).openings[0].skylight?.sections.length).toBe(1);
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));await page.reload();await button.click();
 await expect(page.getByAltText('Skylight shape drawing')).toBeVisible();expect(reads).toBe(1);
});
