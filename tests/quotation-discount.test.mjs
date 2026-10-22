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
const {applyQuotationDiscount,priceQuotation,repriceQuotation,quotationPriceKey,quotationSellingSuggestion}=load('src/lib/workflow/pricing');
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
const choice={openingId:'opening',systemId:'system',glassId:'glass',extras:[{id:'shutter',quantity:1},{id:'handle',quantity:2}]};
const additional=[{id:'facade',quantity:1,measurements:[{label:'North facade',width:2,height:3,quantity:1}],extras:[{id:'pushout',quantity:2}]},{id:'door',quantity:2}];
const quotation=discountPercent=>priceQuotation([opening],[choice],catalog,'original-author',additional,discountPercent);
const projectId='11111111-1111-4111-8111-111111111111';
const actorId='33333333-3333-4333-8333-333333333333';

test('the optional five-percent discount applies once after every system, glass, accessory and additional charge',()=>{
 const gross=quotation();
 const before=structuredClone({gross,catalog,opening,choice,additional});
 const discounted=applyQuotationDiscount(gross,5);
 assert.equal(gross.total,1414000);
 assert.deepEqual(discounted.discount,{percent:5,subtotal:1414000,amount:70700});
 assert.equal(discounted.total,1343300);
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
 assert.equal(removed.total,1414000);
});

test('gross subtotal is reconstructed from saved charges rather than stale quotation and opening totals',()=>{
 const saved=quotation();
 saved.total=1;saved.lines[0].total=2;
 saved.discount={percent:5,subtotal:3,amount:1};
 const before=structuredClone(saved);
 const corrected=applyQuotationDiscount(saved,5);
 assert.deepEqual(corrected.discount,{percent:5,subtotal:1414000,amount:70700});
 assert.equal(corrected.total,1343300);
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
 assert.deepEqual(discounted.discount,{percent:5,subtotal:1414000,amount:70700});
 assert.equal(discounted.total,1343300);
});

test('catalog refresh preserves five percent, recalculates the gross subtotal and never compounds discounts',()=>{
 const saved=quotation(5);
 const before=structuredClone(saved);
 const doubled=catalog.map(item=>({...item,unit_price:item.unit_price*2}));
 const refreshed=repriceQuotation(saved,doubled,'refresher');
 assert.deepEqual(refreshed.discount,{percent:5,subtotal:2828000,amount:141400});
 assert.equal(refreshed.total,2686600);
 assert.deepEqual(repriceQuotation(refreshed,doubled,'again').discount,refreshed.discount);
 assert.equal(repriceQuotation(refreshed,doubled,'again').total,refreshed.total);
 assert.deepEqual(saved,before);
 const explicit=priceQuotation([opening],[{...choice,systemRate:275000}],catalog,'author',additional,5);
 const explicitRefresh=repriceQuotation(explicit,doubled,'refresher');
 assert.equal(explicitRefresh.lines[0].system.rate,275000);
 assert.equal(explicitRefresh.lines[0].system.rateSource,'quotation');
 assert.equal(explicitRefresh.discount.percent,5);
 assert.equal(explicitRefresh.discount.subtotal,2418000);
 assert.equal(explicitRefresh.total,2297100);
});

test('price keys distinguish discount preferences while existing gross-only quotations retain matching keys',()=>{
 const gross=quotation();
 const discounted=applyQuotationDiscount(gross,5);
 assert.notEqual(quotationPriceKey(gross),quotationPriceKey(discounted));
 assert.equal(quotationPriceKey(gross),quotationPriceKey(applyQuotationDiscount(discounted,0)));
 assert.equal(quotationPriceKey(discounted),quotationPriceKey({...discounted,createdAt:'later',preparedBy:'someone-else'}));
});

test('discounts leave client weighted rates, opening allocations and internal green targets based on gross charges',()=>{
 const second={...opening,id:'second',width:200,height:100,quantity:1};
 const gross=priceQuotation([opening,second],[{...choice,systemRate:278000},{openingId:'second',systemId:'system',systemRate:260000,extras:[]}],catalog,'author',additional);
 const discounted=applyQuotationDiscount(gross,5);
 assert.deepEqual(quotationClientPricing(discounted),quotationClientPricing(gross));
 assert.deepEqual(quotationSellingSuggestion(discounted,catalog),quotationSellingSuggestion(gross,catalog));
 assert.deepEqual(discounted.lines,gross.lines);
 assert.equal(discounted.total,discounted.discount.subtotal-discounted.discount.amount);
});

function fixture({role='Indoor Sales',branch='Karkh',projectBranch='Karkh',stage='quotation',signedAt=null,status='quotation_in_progress',additionalState=null,missingFlow=false,discountPercent=0}={}) {
 const calls=[],reads=[];
 const project={id:projectId,client_id:'client',project_number:'PRJ-TEST',project_name:'Office',address:'Baghdad',branch:projectBranch,created_by:'creator',sales_status:status,additional_openings_state:additionalState};
 const saved=quotation(discountPercent);
 const stored={project_id:projectId,revision:4,stage,quotation:saved,contract:stage==='contract'?{quotation:structuredClone(saved)}:null,evidence:null,signed_at:signedAt};
 const unrelated={project_id:'other-project',revision:6,stage:'approved',quotation:quotation(),contract:null,signed_at:null};
 const tables={projects:[project],sales_workflows:missingFlow?[unrelated]:[stored,unrelated],product_price_settings:structuredClone(catalog),openings:[{...structuredClone(opening),project_id:projectId}],profiles:[{id:actorId,branch}],clients:[{id:'client',name:'Client',mobile:'07700000000'}]};
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
 return {calls,reads,tables,stored,unrelated,post};
}
const saveBody={action:'save',revision:4,choices:[choice],additionalItems:additional};
const setDiscountBody={action:'set-discount',revision:4,discountPercent:5};

test('the save API calculates the five-percent discount and ignores forged monetary metadata',async()=>{
 const x=fixture();
 const before=structuredClone({tables:x.tables,stored:x.stored,unrelated:x.unrelated});
 const response=await x.post({...saveBody,discountPercent:5,total:1,subtotal:1,discount:{percent:100,subtotal:1,amount:1},preparedBy:'forged'});
 assert.equal(response.status,200);
 assert.equal(x.calls.length,1);
 const {name,args}=x.calls[0];
 assert.equal(name,'advance_sales_flow');
 assert.equal(args.p_action,'save');
 assert.equal(args.p_revision,4);
 assert.equal(args.p_actor,actorId);
 assert.deepEqual(args.p_payload.discount,{percent:5,subtotal:1414000,amount:70700});
 assert.equal(args.p_payload.total,1343300);
 assert.equal(args.p_payload.preparedBy,actorId);
 assert.deepEqual({tables:x.tables,stored:x.stored,unrelated:x.unrelated},before);
});

test('omitting the save discount preserves the saved preference and explicit zero removes it',async()=>{
 const x=fixture({discountPercent:5});
 assert.equal((await x.post(saveBody)).status,200);
 assert.equal(x.calls[0].args.p_payload.discount.percent,5);
 assert.equal(x.calls[0].args.p_payload.total,1343300);
 x.calls.length=0;
 assert.equal((await x.post({...saveBody,discountPercent:0})).status,200);
 assert.equal(Object.hasOwn(x.calls[0].args.p_payload,'discount'),false);
 assert.equal(x.calls[0].args.p_payload.total,1414000);
});

test('set-discount changes only the discount on saved charges and invokes the existing revision save transaction',async()=>{
 const x=fixture();
 x.tables.product_price_settings.forEach(item=>{item.unit_price=0;item.is_active=false;});
 const before=structuredClone({tables:x.tables,stored:x.stored,unrelated:x.unrelated});
 const response=await x.post({...setDiscountBody,choices:[],additionalItems:[],newOpenings:[{id:'forged'}],total:1,discount:{percent:100}});
 assert.equal(response.status,200);
 assert.equal(x.calls.length,1);
 const {args}=x.calls[0];
 assert.equal(args.p_action,'save');
 assert.equal(args.p_revision,4);
 assert.equal(args.p_actor,actorId);
 assert.deepEqual(args.p_payload.lines,x.stored.quotation.lines);
 assert.deepEqual(args.p_payload.additionalItems,x.stored.quotation.additionalItems);
 assert.deepEqual(args.p_payload.discount,{percent:5,subtotal:1414000,amount:70700});
 assert.equal(args.p_payload.total,1343300);
 assert.ok(!x.reads.some(read=>read.table==='product_price_settings'||read.table==='openings'),'Discount-only revisions must not change rates or quantities through repricing');
 assert.deepEqual({tables:x.tables,stored:x.stored,unrelated:x.unrelated},before);
});

test('set-discount can remove five percent without changing saved specifications',async()=>{
 const x=fixture({discountPercent:5});
 assert.equal((await x.post({...setDiscountBody,discountPercent:0})).status,200);
 assert.equal(Object.hasOwn(x.calls[0].args.p_payload,'discount'),false);
 assert.equal(x.calls[0].args.p_payload.total,1414000);
 assert.deepEqual(x.calls[0].args.p_payload.lines,x.stored.quotation.lines);
});

for(const role of ['Indoor Sales','Sales Manager','Admin','Sales Director','CEO','Company Owner'])test(`${role} may save a fixed five-percent quotation discount`,async()=>{
 const x=fixture({role});
 assert.equal((await x.post(setDiscountBody)).status,200);
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].args.p_payload.discount.percent,5);
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

test('discount API validation rejects unsupported values and requires an explicit preference for set-discount',async()=>{
 for(const discountPercent of [undefined,null,'5',true,-5,2,5.5,10,100,{},[]]){
  const x=fixture();
  const response=await x.post({...setDiscountBody,discountPercent});
  assert.equal(response.status,400,`${JSON.stringify(discountPercent)} set-discount`);
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

test('an approved quotation discount creates a new save and an unsigned contract requires replacement confirmation',async()=>{
 const approved=fixture({stage:'approved',status:'quotation_approved'});
 assert.equal((await approved.post(setDiscountBody)).status,200);
 assert.equal(approved.calls[0].args.p_action,'save','The existing transaction archives the old approval and resets the revised quotation');
 const contract=fixture({stage:'contract',status:'contract_generated'});
 const before=structuredClone(contract.stored);
 assert.equal((await contract.post(setDiscountBody)).status,400);
 assert.equal(contract.calls.length,0);
 assert.equal((await contract.post({...setDiscountBody,replaceUnsignedContract:true})).status,200);
 assert.equal(contract.calls[0].args.p_action,'save');
 assert.deepEqual(contract.stored,before);
});

test('price-preview and refresh preserve the saved five-percent discount and server-generated preview key',async()=>{
 const x=fixture({discountPercent:5});
 x.tables.product_price_settings.forEach(item=>{item.unit_price*=2;});
 const preview=await x.post({action:'preview-prices',revision:4,discountPercent:0});
 assert.equal(preview.status,200);
 assert.equal(x.calls.length,0);
 assert.deepEqual(preview.body.quotation.discount,{percent:5,subtotal:2828000,amount:141400});
 assert.equal(preview.body.quotation.total,2686600);
 assert.equal((await x.post({action:'update-prices',revision:4,priceKey:preview.body.priceKey,confirmed:true,discountPercent:0})).status,200);
 assert.deepEqual(x.calls[0].args.p_payload.discount,preview.body.quotation.discount);
 assert.equal(x.calls[0].args.p_payload.total,2686600);
});
