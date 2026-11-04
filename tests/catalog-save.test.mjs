import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('src/app/api/catalog/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
function route({authorized=true,rpcError=null}={}){
 const calls=[];const exports={};
 const dependencies={
  '@/lib/workflow/catalogRules':{},'@/lib/auth/permissions':{leadershipRoles:[]},
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{requireRole:async roles=>{assert.deepEqual(roles,['Admin']);return authorized?{ok:true}:{ok:false,error:'Forbidden',status:403};}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:args.p_changes,error:rpcError};}})},
 };
 new Function('require','exports',source)(name=>dependencies[name],exports);
 return {calls,patch:body=>exports.PATCH({json:async()=>body})};
}
test('all changed prices are sent in one RPC with no unrelated fields',async()=>{
 const {patch,calls}=route();const changes=[{id:a,price:10000,category:'forged'},{id:b,price:25000}];
 const result=await patch({changes});assert.equal(result.status,200);
 assert.deepEqual(calls,[{name:'save_catalog_prices',args:{p_changes:[{id:a,price:10000},{id:b,price:25000}]}}]);
 assert.deepEqual(result.body.prices,[{id:a,price:10000},{id:b,price:25000}]);
});
test('unchanged legacy tabs can still save a single price through the atomic RPC',async()=>{
 const {patch,calls}=route();assert.equal((await patch({id:a,price:100})).status,200);assert.equal(calls.length,1);
});
test('only Admin can change catalog prices',async()=>{
 const {patch,calls}=route({authorized:false});assert.equal((await patch({changes:[{id:a,price:100}]})).status,403);assert.equal(calls.length,0);
});
test('invalid batch members prevent all writes',async()=>{
 const invalid=[null,{},[],[{id:a,price:0}],[{id:a,price:0.001}],[{id:a,price:-1}],[{id:a,price:NaN}],[{id:a,price:Infinity}],[{id:a,price:1e10+1}],[{id:a,price:'100'}],[{id:'not-a-uuid',price:100}],[{id:a,price:100},null],[{id:a,price:100},{id:a.toUpperCase(),price:200}],Array.from({length:1001},()=>({id:a,price:1}))];
 for(const changes of invalid){const {patch,calls}=route();assert.equal((await patch({changes})).status,400);assert.equal(calls.length,0);}
});
test('batch failures never report success and identify unavailable items',async()=>{
 for(const [code,status] of [['22023',400],['XX000',500]]){
  const {patch,calls}=route({rpcError:{code}});const result=await patch({changes:[{id:a,price:100},{id:b,price:200}]});
  assert.equal(result.status,status);assert.equal(result.body.ok,undefined);assert.equal(calls.length,1);
 }
});

function getRoute({authorized=true,items=[],readError=null}={}){
 const rules={};
 const rulesSource=ts.transpileModule(readFileSync('src/lib/workflow/catalogRules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports',rulesSource)(rules);
 const exports={},reads=[];
 const leadershipRoles=['Admin','CEO'];
 const dependencies={
  '@/lib/workflow/catalogRules':rules,
  '@/lib/auth/permissions':{leadershipRoles},
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/auth/adminServer':{requireRole:async roles=>{assert.deepEqual(roles,leadershipRoles);return authorized?{ok:true}:{ok:false,error:'Forbidden',status:403};}},
  '@/lib/supabase/admin':{createAdminClient:()=>({from(table){
   reads.push(table);assert.equal(table,'product_price_settings');
   return {select(columns){assert.equal(columns,'id,name:product_name,category,unit,unit_price,is_active');return this;},async order(column){assert.equal(column,'product_name');return {data:items,error:readError};}};
  }})},
 };
 new Function('require','exports',source)(name=>dependencies[name],exports);
 return {get:()=>exports.GET(),reads};
}

test('catalog reads hide fixed-price Arch rows and retain normalized Pushout project products',async()=>{
 const product=(id,name,category,unit,unit_price=10000)=>({id,name,category,unit,unit_price,is_active:true});
 const items=[
  product('arch','Curtain Wall Arch','addon','sqm',1),
  product('another-arch',' CURTAIN   WALL ARCH ','service','project',999999),
  product('pushout','Curtain Wall Pushout','addon','sqm',25000),
  product('wall','Curtain Wall','service','item',100000),
  product('door','A Swing Door','standalone_product','item',200000),
  product('retired','Fiber Cement','facade_service','sqm'),
  product('calculator','Skylight','service','sqm'),
 ];
 const before=structuredClone(items),fixture=getRoute({items});
 const result=await fixture.get();
 assert.equal(result.status,200);
 assert.equal(result.headers['Cache-Control'],'no-store');
 assert.deepEqual(result.body.items.map(item=>item.id),['pushout','wall','door']);
 assert.deepEqual(result.body.items[0],{...items[2],category:'standalone_product',unit:'item'});
 assert.equal(result.body.items[1].unit,'sqm');
 assert.equal(result.body.items[2].unit_price,200000);
 assert.deepEqual(items,before,'Catalog reads cannot rewrite stored catalog records');
 assert.deepEqual(fixture.reads,['product_price_settings']);
});

test('catalog reads require leadership access before querying products',async()=>{
 const fixture=getRoute({authorized:false});
 const result=await fixture.get();
 assert.equal(result.status,403);
 assert.deepEqual(fixture.reads,[]);
});

test('catalog read failures do not return a successful empty price list',async()=>{
 const fixture=getRoute({readError:{code:'XX000'}});
 const result=await fixture.get();
 assert.equal(result.status,500);
 assert.equal(result.body.items,undefined);
});
