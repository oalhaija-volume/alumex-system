import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleLoader(dependencies={}) {
 const cache=new Map();
 return function load(path) {
  if(cache.has(path))return cache.get(path);
  const exports={};cache.set(path,exports);
  const code=ts.transpileModule(readFileSync(new URL(`../${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',code)(name=>{
   if(name in dependencies)return dependencies[name];
   if(name.startsWith('@/'))return load(`src/${name.slice(2)}`);
   if(name.startsWith('./'))return load(`${path.slice(0,path.lastIndexOf('/'))}/${name.slice(2)}`);
   if(name.startsWith('../')){
    const segments=path.split('/');segments.pop();
    for(const segment of name.split('/')){
     if(segment==='..')segments.pop();
     else if(segment!=='.')segments.push(segment);
    }
    return load(segments.join('/'));
   }
   throw Error(`Unexpected dependency: ${name}`);
  },exports);
  return exports;
 };
}
const load=moduleLoader();
const {applyQuotationDiscount,discountedSystemRate,openingSellingBand,priceQuotation,repriceQuotation,quotationPriceKey,quotationSellingSuggestion,QUOTATION_DISCOUNTS_ENABLED}=load('src/lib/workflow/pricing');
const {quotationClientPricing}=load('src/lib/quotations/clientPricing');
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('system','Alumex System','aluminum_system','sqm',240000),
 product('glass','Low-E Glass','glass_option','sqm',20000),
 product('shutter','Roller Shutter - Foam','addon','sqm',30000),
 product('handle','Handle','addon','item',5000),
 product('facade','Curtain Wall','facade_service','sqm',100000),
 product('pushout','Curtain Wall Pushout','addon','item',7000),
 product('door','A Swing Door','standalone_product','item',100000),
];
const opening={id:'opening',floor:'GF',room:'Office',width:50,height:100,quantity:2,opening_type:'Window',opening_direction:'Sliding'};
const choice={openingId:'opening',systemId:'system',glassId:'glass',extras:[{id:'shutter',quantity:1,motorPrice:100000},{id:'handle',quantity:2}]};
const additional=[{id:'facade',quantity:1,measurements:[{label:'North facade',width:2,height:3,quantity:1}]},{id:'door',quantity:2},{id:'pushout',quantity:2}];
const quotation=discountPercent=>priceQuotation([opening],[choice],catalog,'original-author',additional,discountPercent);
const projectId='11111111-1111-4111-8111-111111111111';
const actorId='33333333-3333-4333-8333-333333333333';

test('the optional five-percent discount applies once after every system, glass, accessory and additional charge',()=>{
 const gross=quotation();
 const before=structuredClone({gross,catalog,opening,choice,additional});
 const discounted=applyQuotationDiscount(gross,5);
 assert.equal(gross.total,1614000);
 assert.deepEqual(discounted.discount,{percent:5,subtotal:1614000,amount:80700});
 assert.equal(discounted.total,1533300);
 assert.deepEqual(discounted.lines,gross.lines);
 assert.deepEqual(discounted.additionalItems,gross.additionalItems);
 assert.deepEqual(applyQuotationDiscount(discounted,5),discounted,'Selecting five percent again must not compound the discount');
 assert.deepEqual(applyQuotationDiscount(discounted,0),gross,'Removing the discount restores all gross charges');
 assert.equal(Object.hasOwn(gross,'discount'),false);
 assert.deepEqual({gross,catalog,opening,choice,additional},before);
});

test('the default and zero-percent paths preserve legacy quotation shape and remove discount metadata',()=>{
 const gross=quotation();
 assert.deepEqual(applyQuotationDiscount(gross),gross);
 const explicitZero=quotation(0);
 assert.equal(explicitZero.total,gross.total);
 assert.deepEqual(explicitZero.lines,gross.lines);
 assert.equal(Object.hasOwn(explicitZero,'discount'),false);
 const removed=applyQuotationDiscount(applyQuotationDiscount(gross,5),0);
 assert.equal(Object.hasOwn(removed,'discount'),false);
 assert.equal(removed.total,1614000);
});

test('gross subtotal is reconstructed from saved charges rather than stale quotation and opening totals',()=>{
 const saved=quotation();
 saved.total=1;saved.lines[0].total=2;
 saved.discount={percent:5,subtotal:3,amount:1};
 const before=structuredClone(saved);
 const corrected=applyQuotationDiscount(saved,5);
 assert.deepEqual(corrected.discount,{percent:5,subtotal:1614000,amount:80700});
 assert.equal(corrected.total,1533300);
 assert.deepEqual(saved,before);
});

test('discount rounding uses whole-IQD discount amounts before subtracting from the gross subtotal',()=>{
 for(const [subtotal,amount,total] of [[9,0,9],[10,1,9],[109,5,104],[110,6,104],[111,6,105],[129,6,123],[130,7,123]]){
  const saved=quotation();
  saved.lines[0].system.total=subtotal;saved.lines[0].glass=null;saved.lines[0].extras=[];
  saved.lines[0].total=subtotal;saved.additionalItems=[];saved.total=subtotal;
  const discounted=applyQuotationDiscount(saved,5);
  assert.deepEqual(discounted.discount,{percent:5,subtotal,amount},`${subtotal} IQD gross`);
  assert.equal(discounted.total,total);
 }
});

test('discount validation accepts only the numeric values zero and five',()=>{
 const saved=quotation();
 const before=structuredClone(saved);
 for(const percent of [-5,1,2,2.5,4.9999,5.0001,10,100,NaN,Infinity,-Infinity,'0','5',null,true,false,{},[],[5]])assert.throws(()=>applyQuotationDiscount(saved,percent),`${JSON.stringify(percent)} is invalid`);
 assert.deepEqual(saved,before);
});

test('priceQuotation can generate the discounted snapshot directly while keeping per-opening charges gross',()=>{
 const gross=quotation();
 const discounted=quotation(5);
 assert.deepEqual(discounted.lines,gross.lines);
 assert.deepEqual(discounted.additionalItems,gross.additionalItems);
 assert.deepEqual(discounted.discount,{percent:5,subtotal:1614000,amount:80700});
 assert.equal(discounted.total,1533300);
});

test('catalog refresh preserves five percent, recalculates the gross subtotal and never compounds discounts',()=>{
 const saved=quotation(5);
 const before=structuredClone(saved);
 const doubled=catalog.map(item=>({...item,unit_price:item.unit_price*2}));
 const refreshed=repriceQuotation(saved,doubled,'refresher');
 assert.deepEqual(refreshed.discount,{percent:5,subtotal:3028000,amount:151400});
 assert.equal(refreshed.total,2876600);
 assert.deepEqual(refreshed.lines[0].extras.find(extra=>extra.motorFor==='shutter'),saved.lines[0].extras.find(extra=>extra.motorFor==='shutter'),'Catalog refresh keeps the manual price per motor and repeated motor quantity');
 assert.deepEqual(repriceQuotation(refreshed,doubled,'again').discount,refreshed.discount);
 assert.equal(repriceQuotation(refreshed,doubled,'again').total,refreshed.total);
 assert.deepEqual(saved,before);
 const explicit=priceQuotation([opening],[{...choice,systemRate:275000}],catalog,'author',additional,5);
 const explicitRefresh=repriceQuotation(explicit,doubled,'refresher');
 assert.equal(explicitRefresh.lines[0].system.rate,275000);
 assert.equal(explicitRefresh.lines[0].system.rateSource,'quotation');
 assert.equal(explicitRefresh.discount.percent,5);
 assert.equal(explicitRefresh.discount.subtotal,2618000);
 assert.equal(explicitRefresh.total,2487100);
});

test('price keys distinguish discount preferences while existing gross-only quotations retain matching keys',()=>{
 const gross=quotation();
 const discounted=applyQuotationDiscount(gross,5);
 assert.notEqual(quotationPriceKey(gross),quotationPriceKey(discounted));
 assert.equal(quotationPriceKey(gross),quotationPriceKey(applyQuotationDiscount(discounted,0)));
 assert.equal(quotationPriceKey(discounted),quotationPriceKey({...discounted,createdAt:'later',preparedBy:'someone-else'}));
});

test('discounts keep gross client prices intact while selling guidance responds to the discounted rate',()=>{
 const second={...opening,id:'second',width:200,height:100,quantity:1};
 const gross=priceQuotation([opening,second],[{...choice,systemRate:278000},{openingId:'second',systemId:'system',systemRate:265000,extras:[]}],catalog,'author',additional);
 const discounted=applyQuotationDiscount(gross,5);
 assert.deepEqual(quotationClientPricing(discounted),quotationClientPricing(gross));
 const grossSuggestion=quotationSellingSuggestion(gross,catalog);
 const discountedSuggestion=quotationSellingSuggestion(discounted,catalog);
 assert.deepEqual(grossSuggestion.openingRates,[{openingId:'opening',rate:278000},{openingId:'second',rate:278000}]);
 assert.deepEqual(discountedSuggestion.openingRates,[{openingId:'opening',rate:292632},{openingId:'second',rate:292632}]);
 assert.equal(discountedSuggestion.canApply,true);
 assert.deepEqual(discounted.lines,gross.lines);
 assert.equal(discounted.total,discounted.discount.subtotal-discounted.discount.amount);
});

test('effective system rates apply five percent mathematically without changing gross stored rates',()=>{
 for(const [rate,net] of [[240000,228000],[260000,247000],[265000,251750],[278000,264100],[305000,289750]]){
  assert.equal(discountedSystemRate(rate),rate);
  assert.equal(discountedSystemRate(rate,0),rate);
  assert.equal(discountedSystemRate(rate,5),net);
 }
});

test('discounted green boundaries require enough whole-IQD gross rate to meet each size or hinged type target',()=>{
 for(const [area,opening_type,opening_direction,minimum,grossRequired] of [
  [3,'Window','Sliding',278000,292632],
  [3.5,'Window','Sliding',265000,278948],
  [4,'Window','Sliding',265000,278948],
  [6,'Window','Sliding',265000,278948],
  [6,'Window','Hinged',265000,278948],
  [2,'Door','Hinged',305000,321053],
 ]){
  const measured={opening_type,opening_direction};
  assert.equal(openingSellingBand(area,discountedSystemRate(minimum,0),measured),'green');
  assert.notEqual(openingSellingBand(area,discountedSystemRate(minimum,5),measured),'green');
  assert.notEqual(openingSellingBand(area,discountedSystemRate(grossRequired-1,5),measured),'green',`${opening_direction} ${opening_type} ${area} sqm below boundary`);
  assert.equal(openingSellingBand(area,discountedSystemRate(grossRequired,5),measured),'green',`${opening_direction} ${opening_type} ${area} sqm at boundary`);
 }
});

test('rounding an effective rate to whole IQD cannot make a below-target opening falsely green',()=>{
 for(const [area,gross,minimum,opening_direction] of [[3.5,278947,265000,'Sliding'],[6,278947,265000,'Hinged']]){
  const net=discountedSystemRate(gross,5);
  assert.ok(net<minimum&&net>minimum-1);
  assert.equal(Math.round(net),minimum,'Whole-IQD display rounding reaches the threshold');
  assert.notEqual(openingSellingBand(area,net,{opening_type:'Window',opening_direction}),'green','The color must use the unrounded effective rate');
 }
});

test('discount-aware suggestions round each required gross rate upward and become green after applying them',()=>{
 const definitions=[['small',3,'Sliding',278000],['medium',3.5,'Sliding',265000],['larger',4,'Sliding',265000],['large',6,'Sliding',265000],['hinged',2,'Hinged',265000]];
 const openings=definitions.map(([id,area,opening_direction])=>({...opening,id,width:area*100,height:100,quantity:1,opening_direction}));
 const choices=definitions.map(([openingId,,,systemRate])=>({openingId,systemId:'system',systemRate,extras:[]}));
 const gross=priceQuotation(openings,choices,catalog,'author');
 const discounted=applyQuotationDiscount(gross,5);
 const before=structuredClone(discounted);
 assert.equal(quotationSellingSuggestion(gross,catalog).allGreen,true);
 const suggestion=quotationSellingSuggestion(discounted,catalog);
 assert.deepEqual(suggestion,{
  rate:5201590/18.5,openingCount:5,allGreen:false,canApply:true,billableArea:18.5,systemTotal:5201590,
  openingRates:[{openingId:'small',rate:292632},{openingId:'medium',rate:278948},{openingId:'larger',rate:278948},{openingId:'large',rate:278948},{openingId:'hinged',rate:278948}],
 });
 const adjusted=priceQuotation(openings,suggestion.openingRates.map(({openingId,rate})=>({openingId,systemId:'system',systemRate:rate,extras:[]})),catalog,'author',[],5);
 assert.equal(quotationSellingSuggestion(adjusted,catalog).allGreen,true);
 assert.equal(quotationSellingSuggestion(adjusted,catalog).canApply,true);
 assert.deepEqual(discounted,before);
});

test('a discounted hinged door can apply its required gross rate above the former price cap',()=>{
 const measured={...opening,id:'hinged-door',width:200,height:100,quantity:1,opening_type:'Door',opening_direction:'Hinged'};
 const selected={openingId:measured.id,systemId:'system',systemRate:305000,extras:[]};
 const saved=priceQuotation([measured],[selected],catalog,'author',[],5);
 const before=structuredClone(saved);
 assert.deepEqual(quotationSellingSuggestion(saved,catalog),{
  rate:321053,openingCount:1,allGreen:false,canApply:true,billableArea:2,systemTotal:642106,
  openingRates:[{openingId:'hinged-door',rate:321053}],
 });
 const adjusted=priceQuotation([measured],[{...selected,systemRate:321053}],catalog,'author',[],5);
 assert.equal(adjusted.lines[0].system.rate,321053);
 assert.equal(quotationSellingSuggestion(adjusted,catalog).allGreen,true);
 assert.deepEqual(saved,before);
});

test('discount-aware colors and guidance keep repeated window sizes and minimum billable quantities unchanged',()=>{
 const measured={...opening,id:'small-hinged',width:68,height:77,quantity:3,opening_direction:'Hinged'};
 const selected={openingId:measured.id,systemId:'system',systemRate:265000,extras:[]};
 const gross=priceQuotation([measured],[selected],catalog,'author');
 const saved=applyQuotationDiscount(gross,5);
 assert.equal(saved.lines[0].area,0.5236*3);
 assert.equal(saved.lines[0].system.quantity,3);
 assert.equal(saved.lines[0].system.rate,265000);
 assert.equal(saved.lines[0].system.total,795000);
 assert.deepEqual(quotationSellingSuggestion(saved,catalog),{
  rate:278948,openingCount:3,allGreen:false,canApply:true,billableArea:3,systemTotal:836844,
  openingRates:[{openingId:'small-hinged',rate:278948}],
 });
 assert.equal(quotationSellingSuggestion(applyQuotationDiscount(saved,0),catalog).allGreen,true);
 assert.deepEqual(saved.lines,gross.lines);
});

function fixture({role='Indoor Sales',branch='Karkh',projectBranch='Karkh',stage='quotation',signedAt=null,status='quotation_in_progress',additionalState=null,missingFlow=false,discountPercent=0}={}) {
 const calls=[],reads=[];
 const project={id:projectId,client_id:'client',project_number:'PRJ-TEST',project_name:'Office',address:'Baghdad',branch:projectBranch,created_by:'creator',sales_status:status,additional_openings_state:additionalState};
 const saved=quotation(discountPercent);
 const stored={project_id:projectId,revision:4,stage,quotation:saved,contract:stage==='contract'?{quotation:structuredClone(saved)}:null,evidence:null,signed_at:signedAt};
 const unrelated={project_id:'other-project',revision:6,stage:'approved',quotation:quotation(),contract:null,signed_at:null};
 const tables={projects:[project],sales_workflows:missingFlow?[unrelated]:[stored,unrelated],product_price_settings:structuredClone(catalog),openings:[{...structuredClone(opening),project_id:projectId}],profiles:[{id:actorId,branch}],clients:[{id:'client',name:'Client',mobile:'07700000000'}],quotation_revisions:[{project_id:projectId,version:3,quotation:quotation(5),contract:null,previous_stage:'approved',superseded_at:'2026-11-11T08:00:00Z'}]};
 const admin={from(table){
  const predicates=[];
  const result=single=>{const rows=tables[table].filter(row=>predicates.every(predicate=>predicate(row)));reads.push({table,rows});return {data:single?rows[0]??null:rows,error:null};};
  return {select(){return this;},eq(key,value){predicates.push(row=>row[key]===value);return this;},order(){return this;},maybeSingle:async()=>result(true),single:async()=>result(true),then(resolve){return Promise.resolve(result(false)).then(resolve);}};
 },rpc:async(name,args)=>{calls.push({name,args});return {data:{...stored,revision:5,stage:'quotation',quotation:args.p_payload},error:null};}};
 const route=moduleLoader({
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/auth/adminServer':{requireRole:async roles=>roles.includes(role)?{ok:true,user:{id:actorId},role,profile:{branch}}:{ok:false,error:'Forbidden',status:403}},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/contracts/uploadedTerms':{uploadedContractTerms:()=>[]},
 })('src/app/api/sales-flow/[projectId]/route');
 const post=body=>route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({projectId})});
 const get=()=>route.GET(new Request(`http://localhost:3003/api/sales-flow/${projectId}`),{params:Promise.resolve({projectId})});
 return {calls,reads,tables,stored,unrelated,post,get};
}
const saveBody={action:'save',revision:4,choices:[choice],additionalItems:additional};
const setDiscountBody={action:'set-discount',revision:4,discountPercent:5};

test('active quotation discounts are temporarily disabled while historical discount calculations remain available',()=>{
 assert.equal(QUOTATION_DISCOUNTS_ENABLED,false);
 assert.equal(quotation(5).discount.percent,5);
});

test('the save API uses gross prices and ignores forged monetary and discount metadata',async()=>{
 const x=fixture();
 const before=structuredClone({tables:x.tables,stored:x.stored,unrelated:x.unrelated});
 const response=await x.post({...saveBody,discountPercent:0,total:1,subtotal:1,discount:{percent:5,subtotal:1,amount:1},preparedBy:'forged'});
 assert.equal(response.status,200);
 assert.equal(x.calls.length,1);
 const {name,args}=x.calls[0];
 assert.equal(name,'advance_sales_flow');
 assert.equal(args.p_action,'save');
 assert.equal(args.p_revision,4);
 assert.equal(args.p_actor,actorId);
 assert.equal(Object.hasOwn(args.p_payload,'discount'),false);
 assert.equal(args.p_payload.total,1614000);
 assert.equal(args.p_payload.preparedBy,actorId);
 assert.deepEqual({tables:x.tables,stored:x.stored,unrelated:x.unrelated},before);
});

test('the save API creates one fixed-price shutter and motor per opening and ignores forged quantities and charges',async()=>{
 const x=fixture();
 const selection={...choice,extras:choice.extras.map(extra=>extra.id==='shutter'?{...extra,quantity:99,motorPrice:125000,total:1,rate:1}:extra)};
 const response=await x.post({...saveBody,choices:[selection],discountPercent:0,total:1,lines:[{extras:[{id:'forged-motor',motorFor:'shutter',rate:1,quantity:99,total:1}]}],motorPrice:1});
 assert.equal(response.status,200);
 assert.equal(x.calls.length,1);
 const quotation=x.calls[0].args.p_payload;
 assert.deepEqual(quotation.lines[0].extras.find(extra=>extra.id==='shutter'),{id:'shutter',name:'Roller Shutter - Foam',unit:'item',rate:30000,quantity:2,total:60000});
 const motor=quotation.lines[0].extras.find(extra=>extra.motorFor==='shutter');
 assert.deepEqual(motor,{id:'roller-shutter-motor:shutter',name:'Roller shutter motor',unit:'item',rate:125000,quantity:2,total:250000,motorFor:'shutter'});
 assert.equal(quotation.lines[0].extras.filter(extra=>extra.motorFor).length,1);
 assert.equal(quotation.lines[0].total,850000);
 assert.equal(Object.hasOwn(quotation,'discount'),false);
 assert.equal(quotation.total,1664000);
 assert.equal(quotation.preparedBy,actorId);
});

test('the save API keeps shutter and motor prices fixed across different opening areas',async()=>{
 const shutters=[],motors=[];
 for(const [width,height,lineTotal,total] of [[50,100,850000,1664000],[200,300,3450000,4264000]]){
  const x=fixture();
  Object.assign(x.tables.openings[0],{width,height});
  const selection={...choice,extras:choice.extras.map(extra=>extra.id==='shutter'?{...extra,quantity:99,motorPrice:125000}:extra)};
  const response=await x.post({...saveBody,choices:[selection],discountPercent:0});
  assert.equal(response.status,200);
  const quotation=x.calls[0].args.p_payload;
  shutters.push(quotation.lines[0].extras.find(extra=>extra.id==='shutter'));
  motors.push(quotation.lines[0].extras.find(extra=>extra.motorFor==='shutter'));
  assert.equal(quotation.lines[0].total,lineTotal);
  assert.equal(Object.hasOwn(quotation,'discount'),false);
  assert.equal(quotation.total,total);
 }
 assert.deepEqual(shutters[0],shutters[1],'Shutter price and count depend on physical openings, never their area');
 assert.deepEqual(motors[0],motors[1],'Motor price and count depend on physical openings, never their area');
 assert.equal(shutters[0].quantity,2);
 assert.equal(shutters[0].total,60000);
 assert.equal(motors[0].quantity,2);
 assert.equal(motors[0].total,250000);
});

test('legacy sqm shutter quotations require editing before API price refresh',async()=>{
 const x=fixture();
 x.stored.quotation.lines[0].extras.find(extra=>extra.id==='shutter').unit='sqm';
 const before=structuredClone(x.stored.quotation);
 const response=await x.post({action:'preview-prices',revision:4});
 assert.equal(response.status,400);
 assert.match(response.body.error,/catalog unit changed.*Edit quotation/);
 assert.equal(x.calls.length,0,'A refresh must not silently reinterpret a saved sqm charge as a per-opening charge');
 assert.deepEqual(x.stored.quotation,before);
});

test('the save API requires a positive whole-IQD motor price on every selected shutter',async()=>{
 for(const motorPrice of [undefined,null,0,-1,0.5,'100000',true,{},[],Number.MAX_SAFE_INTEGER]){
  const x=fixture();
  const selection={...choice,extras:choice.extras.map(extra=>extra.id==='shutter'?{...extra,motorPrice}:extra)};
  const before=structuredClone(x.stored);
  const response=await x.post({...saveBody,choices:[selection]});
  assert.equal(response.status,400,`Invalid motor price: ${JSON.stringify(motorPrice)}`);
  assert.equal(x.calls.length,0,'Invalid motor prices must not reach the workflow save transaction');
  assert.deepEqual(x.stored,before);
 }
});

test('the save API rejects manual motor prices on other add-ons and forged standalone motor choices',async()=>{
 for(const extras of [[{id:'handle',quantity:1,motorPrice:100000}],[{id:'roller-shutter-motor:shutter',quantity:1,motorPrice:100000}]]){
  const x=fixture();
  const response=await x.post({...saveBody,choices:[{...choice,extras}]});
  assert.equal(response.status,400);
  assert.equal(x.calls.length,0);
 }
});

test('omitting the save discount or setting zero creates a gross revision of a legacy discounted quotation',async()=>{
 const x=fixture({discountPercent:5});
 const before=structuredClone(x.tables);
 assert.equal((await x.post(saveBody)).status,200);
 assert.equal(Object.hasOwn(x.calls[0].args.p_payload,'discount'),false);
 assert.equal(x.calls[0].args.p_payload.total,1614000);
 x.calls.length=0;
 assert.equal((await x.post({...saveBody,discountPercent:0})).status,200);
 assert.equal(Object.hasOwn(x.calls[0].args.p_payload,'discount'),false);
 assert.equal(x.calls[0].args.p_payload.total,1614000);
 assert.deepEqual(x.tables,before,'Saved historical quotation and revision snapshots remain unchanged');
});

test('stale clients cannot create discounted saves or price refreshes through any active API action',async()=>{
 for(const action of ['save','preview-prices','update-prices']){
  const x=fixture({discountPercent:5});
  const before=structuredClone(x.tables);
  const response=await x.post({...saveBody,action,discountPercent:5,confirmed:true,priceKey:'stale-client-key'});
  assert.equal(response.status,403,action);
  assert.equal(response.body.error,'Quotation discounts are temporarily unavailable.');
  assert.equal(x.calls.length,0);
  assert.ok(!x.reads.some(read=>read.table==='product_price_settings'||read.table==='openings'),'The disabled policy is checked before repricing');
  assert.deepEqual(x.tables,before);
 }
});

test('set-discount rejects forged revisions without reading pricing or modifying saved charges',async()=>{
 const x=fixture();
 x.tables.product_price_settings.forEach(item=>{item.unit_price=0;item.is_active=false;});
 const before=structuredClone({tables:x.tables,stored:x.stored,unrelated:x.unrelated});
 const response=await x.post({...setDiscountBody,choices:[],additionalItems:[],newOpenings:[{id:'forged'}],total:1,discount:{percent:100}});
 assert.equal(response.status,403);
 assert.equal(response.body.error,'Quotation discounts are temporarily unavailable.');
 assert.equal(x.calls.length,0);
 assert.ok(!x.reads.some(read=>read.table==='product_price_settings'||read.table==='openings'));
 assert.deepEqual({tables:x.tables,stored:x.stored,unrelated:x.unrelated},before);
});

test('set-discount is disabled even when a legacy quotation requests zero percent',async()=>{
 const x=fixture({discountPercent:5});
 const before=structuredClone(x.tables);
 assert.equal((await x.post({...setDiscountBody,discountPercent:0})).status,403);
 assert.equal(x.calls.length,0);
 assert.deepEqual(x.tables,before);
});

for(const role of ['Indoor Sales','Sales Manager','Admin','Sales Director','CEO','Company Owner'])test(`${role} cannot create a five-percent discount while discounts are disabled`,async()=>{
 const x=fixture({role});
 for(const body of [setDiscountBody,{...saveBody,discountPercent:5}])assert.equal((await x.post(body)).status,403);
 assert.equal(x.calls.length,0);
});

for(const role of ['Outdoor Sales','HR','Operations Manager'])test(`${role} cannot change quotation discounts`,async()=>{
 const x=fixture({role});
 for(const body of [setDiscountBody,{...saveBody,discountPercent:5}])assert.equal((await x.post(body)).status,403);
 assert.equal(x.calls.length,0);
 assert.equal(x.reads.length,0);
});

for(const branch of ['Rasafa',null])test(`Indoor Sales branch ${branch} cannot discount another branch quotation`,async()=>{
 const x=fixture({branch});
 assert.equal((await x.post(setDiscountBody)).status,404);
 assert.equal(x.calls.length,0);
 assert.ok(!x.reads.some(read=>read.table==='sales_workflows'));
});

test('set-discount rejects every preference while saves still validate malformed percentages',async()=>{
 for(const discountPercent of [undefined,null,'5',true,-5,2,5.5,10,100,{},[]]){
  const x=fixture();
  const response=await x.post({...setDiscountBody,discountPercent});
  assert.equal(response.status,403,`${JSON.stringify(discountPercent)} set-discount`);
  assert.equal(x.calls.length,0);
 }
 for(const discountPercent of [null,'5',true,-5,2,5.5,10,100,{},[]]){
  const x=fixture();
  assert.equal((await x.post({...saveBody,discountPercent})).status,400,`${JSON.stringify(discountPercent)} save`);
  assert.equal(x.calls.length,0);
 }
});

test('discount-only revisions require the current workflow version and an existing saved quotation',async()=>{
 const stale=fixture();
 assert.equal((await stale.post({...setDiscountBody,revision:3})).status,409);
 assert.equal(stale.calls.length,0);
 const unsaved=fixture({missingFlow:true});
 assert.ok((await unsaved.post({...setDiscountBody,revision:0})).status>=400);
 assert.equal(unsaved.calls.length,0);
});

for(const patch of [{stage:'signed',signedAt:'2026-10-23T08:00:00Z'},{stage:'quotation',signedAt:'2026-10-23T08:00:00Z'},{stage:'operations'},{status:'contract_signed'},{status:'transferred_to_operations'},{status:'cancelled'},{status:'lost'},{status:'closed'},{additionalState:'requested'},{additionalState:'submitted'}])test(`discount revisions respect locked workflow ${JSON.stringify(patch)}`,async()=>{
 const x=fixture(patch);
 assert.ok((await x.post(setDiscountBody)).status>=400);
 assert.equal(x.calls.length,0);
});

test('approved quotations and unsigned contracts cannot add a discount even with replacement confirmation',async()=>{
 const approved=fixture({stage:'approved',status:'quotation_approved'});
 assert.equal((await approved.post(setDiscountBody)).status,403);
 assert.equal(approved.calls.length,0);
 const contract=fixture({stage:'contract',status:'contract_generated'});
 const before=structuredClone(contract.stored);
 assert.equal((await contract.post(setDiscountBody)).status,403);
 assert.equal(contract.calls.length,0);
 assert.equal((await contract.post({...setDiscountBody,replaceUnsignedContract:true})).status,403);
 assert.equal(contract.calls.length,0);
 assert.deepEqual(contract.stored,before);
});

test('price-preview and confirmed refresh create gross revisions while preserving legacy discounted history',async()=>{
 const x=fixture({discountPercent:5});
 x.tables.product_price_settings.forEach(item=>{item.unit_price*=2;});
 const before=structuredClone(x.tables);
 const preview=await x.post({action:'preview-prices',revision:4,discountPercent:0});
 assert.equal(preview.status,200);
 assert.equal(x.calls.length,0);
 assert.equal(Object.hasOwn(preview.body.quotation,'discount'),false);
 assert.equal(preview.body.quotation.total,3028000);
 assert.deepEqual(preview.body.quotation.lines[0].extras.find(extra=>extra.id==='shutter'),{id:'shutter',name:'Roller Shutter - Foam',unit:'item',rate:60000,quantity:2,total:120000});
 assert.deepEqual(preview.body.quotation.lines[0].extras.find(extra=>extra.motorFor==='shutter'),x.stored.quotation.lines[0].extras.find(extra=>extra.motorFor==='shutter'));
 assert.equal((await x.post({action:'update-prices',revision:4,priceKey:preview.body.priceKey})).status,400,'Updating prices still requires confirmation');
 const legacyKey=quotationPriceKey(repriceQuotation(x.stored.quotation,x.tables.product_price_settings,actorId));
 assert.equal((await x.post({action:'update-prices',revision:4,priceKey:legacyKey,confirmed:true})).status,409,'A discounted preview key cannot approve a new gross revision');
 assert.equal(x.calls.length,0);
 assert.equal((await x.post({action:'update-prices',revision:4,priceKey:preview.body.priceKey,confirmed:true,choices:[{...choice,extras:[{id:'shutter',quantity:1,motorPrice:1}]}],motorPrice:1,total:1})).status,200);
 assert.equal(Object.hasOwn(x.calls[0].args.p_payload,'discount'),false);
 assert.equal(x.calls[0].args.p_payload.total,3028000);
 assert.deepEqual(x.calls[0].args.p_payload.lines[0].extras.find(extra=>extra.motorFor==='shutter'),x.stored.quotation.lines[0].extras.find(extra=>extra.motorFor==='shutter'));
 assert.deepEqual(x.tables,before);
});

test('gross saves accept the 240000-IQD manual minimum and rates below the previous minimum',async()=>{
 for(const rate of [240000,240001,249999,250000]){
  const accepted=fixture({discountPercent:5});
  assert.equal((await accepted.post({...saveBody,choices:[{...choice,systemRate:rate}]})).status,200);
  const saved=accepted.calls[0].args.p_payload;
  assert.equal(saved.lines[0].system.rate,rate);
  assert.equal(saved.total,1134000+rate*2);
  assert.equal(Object.hasOwn(saved,'discount'),false);
 }
 const rejected=fixture();
 const response=await rejected.post({...saveBody,choices:[{...choice,systemRate:239999}]});
 assert.equal(response.status,400);
 assert.match(response.body.error,/at least 240,000 IQD/);
 assert.equal(rejected.calls.length,0);
});

test('historical discounted quotations remain readable, approvable, contractable and signable',async()=>{
 const read=fixture({discountPercent:5});
 const before=structuredClone(read.tables);
 const response=await read.get();
 assert.equal(response.status,200);
 assert.equal(response.body.flow.quotation.discount.percent,5);
 assert.equal(response.body.flow.quotation.total,1533300);
 assert.equal(response.body.history[0].quotation.discount.percent,5);
 assert.equal(read.calls.length,0);
 assert.deepEqual(read.tables,before);
 for(const [options,body] of [
  [{},{action:'approve',revision:4,confirmed:true}],
  [{stage:'approved',status:'quotation_approved'},{action:'contract',revision:4,template:'residential'}],
  [{stage:'contract',status:'contract_generated'},{action:'sign',revision:4,method:'hard_copy',signer:'Client signer',consent:true}],
 ]){
  const x=fixture({...options,discountPercent:5});
  const savedBefore=structuredClone(x.tables);
  const result=await x.post(body);
  assert.equal(result.status,200,body.action);
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].args.p_action,body.action);
  assert.deepEqual(x.tables,savedBefore,'Existing quotation discounts and archived revisions remain intact');
 }
});
