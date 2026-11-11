import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile=path=>ts.transpileModule(readFileSync(path,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const rules={};
new Function('exports',transpile('src/lib/workflow/catalogRules.ts'))(rules);
const source=transpile('src/app/api/catalog/route.ts');
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId='11111111-1111-4111-8111-111111111111';

function fixture({authorized=true,authStatus=403,items=[],readError=null,insertError=null,missingInsert=false}={}){
 const writes=[],reads=[],events=[],exports={};
 const dependencies={
  '@/lib/workflow/catalogRules':rules,
  '@/lib/auth/permissions':{leadershipRoles:[]},
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/auth/adminServer':{requireRole:async roles=>{
   events.push('authorize');assert.deepEqual(roles,['Admin']);
   return authorized?{ok:true,user:{id:actor}}:{ok:false,error:'Forbidden',status:authStatus};
  }},
  '@/lib/supabase/admin':{createAdminClient:()=>{
   events.push('database');
   return {from(table){
    assert.equal(table,'product_price_settings');
    return {
     select(columns){
      assert.equal(columns,'product_name');
      return {order(column){
       assert.equal(column,'id');
       return {async range(start,end){reads.push({start,end});return {data:items.slice(start,end+1),error:readError};}};
      }};
     },
     insert(row){
      writes.push(row);
      return {select(columns){
       assert.equal(columns,'id,name:product_name,category,unit,unit_price,is_active');
       return {async single(){return {
        data:missingInsert?null:{id:itemId,name:row.product_name,category:row.category,unit:row.unit,unit_price:row.unit_price,is_active:row.is_active},error:insertError,
       };}};
      }};
     },
    };
   }};
  }},
 };
 new Function('require','exports',source)(name=>{
  assert.ok(name in dependencies,`Unexpected dependency: ${name}`);return dependencies[name];
 },exports);
 return {reads,writes,events,post:body=>exports.POST({json:async()=>body}),postInvalidJson:()=>exports.POST({json:async()=>{throw new SyntaxError('Invalid JSON');}})};
}

test('Admin can create an active sqm aluminum section at the supplied price',async()=>{
 const {post,writes,events}=fixture();
 const result=await post({name:'  New   Aluminum Section  ',price:500000,category:'addon',unit:'project',is_active:false,created_by:'forged',id:'forged'});
 assert.equal(result.status,201);
 assert.deepEqual(result.headers,{'Cache-Control':'no-store'});
 assert.deepEqual(writes,[{product_name:'New Aluminum Section',category:'aluminum_section',unit:'sqm',unit_price:500000,is_active:true,created_by:actor}]);
 assert.deepEqual(result.body,{item:{id:itemId,name:'New Aluminum Section',category:'aluminum_section',unit:'sqm',unit_price:500000,is_active:true}});
 assert.deepEqual(events,['authorize','database']);
 assert.equal(rules.catalogKind(result.body.item),'system');
});

test('unauthenticated or unauthorized callers cannot parse input or access storage',async()=>{
 for(const authStatus of [401,403]){
  const f=fixture({authorized:false,authStatus});
  const result=await f.postInvalidJson();
  assert.equal(result.status,authStatus);
  assert.deepEqual(f.events,['authorize']);
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.reads,[]);
 }
});

test('invalid input cannot create or query a catalog section',async()=>{
 const invalid=[null,[],{},'name',true,
  {name:'',price:100},{name:' \n\t ',price:100},{name:'x'.repeat(101),price:100},{name:99,price:100},
  ...[undefined,null,'100',0,0.001,-1,NaN,Infinity,1e10+1,{},[]].map(price=>({name:'New Section',price})),
 ];
 for(const body of invalid){
  const f=fixture(),result=await f.post(body);
  assert.equal(result.status,400,JSON.stringify(body));
  assert.deepEqual(f.events,['authorize']);assert.deepEqual(f.writes,[]);
 }
 const f=fixture();assert.equal((await f.postInvalidJson()).status,400);assert.deepEqual(f.reads,[]);
});

test('reserved product names cannot create sections with incompatible quotation behavior',async()=>{
 for(const name of ['Curtain Wall','  curtain   wall  arch  ','Cladding','Skylight','Fiber Cement','Reynaers System','Photocell Door Premium','Louver','Low-E Glass','Tilt & Turn','Roller Shutter - Foam','Georgian Bars','Hydraulic Door Closer - Heavy']){
  const f=fixture(),result=await f.post({name,price:500000});
  assert.equal(result.status,400,name);assert.equal(result.body.field,'name');
  assert.deepEqual(f.events,['authorize']);assert.deepEqual(f.writes,[]);
 }
});

test('existing names are rejected case-insensitively including inactive and whitespace variants',async()=>{
 for(const product_name of ['New Section',' new SECTION ','NEW   SECTION','New\tSection']){
  const f=fixture({items:[{product_name,is_active:false}]});
  const result=await f.post({name:'new section',price:500000});
  assert.equal(result.status,409);assert.equal(result.body.field,'name');assert.deepEqual(f.writes,[]);
 }
});

test('duplicate checks include rows beyond the first Supabase page',async()=>{
 const items=Array.from({length:1000},(_,i)=>({product_name:`Other ${i}`})).concat({product_name:'New Section'});
 const f=fixture({items}),result=await f.post({name:'New Section',price:500000});
 assert.equal(result.status,409);assert.deepEqual(f.writes,[]);
 assert.deepEqual(f.reads,[{start:0,end:999},{start:1000,end:1999}]);
});

test('price bounds and Arabic section names are supported',async()=>{
 for(const price of [0.01,500000.25,1e10]){
  const f=fixture(),result=await f.post({name:'مقطع ألمنيوم جديد',price});
  assert.equal(result.status,201);assert.equal(f.writes[0].unit_price,price);
 }
});

test('duplicate races and database failures are never reported as successful additions',async()=>{
 const duplicate=fixture({insertError:{code:'23505'}});
 assert.equal((await duplicate.post({name:'New Section',price:500000})).status,409);
 const failedRead=fixture({readError:{code:'XX000'}});
 assert.equal((await failedRead.post({name:'New Section',price:500000})).status,500);
 assert.deepEqual(failedRead.writes,[]);
 for(const options of [{insertError:{code:'XX000'}},{missingInsert:true}]){
  const f=fixture(options),result=await f.post({name:'New Section',price:500000});
  assert.equal(result.status,500);assert.equal(result.body.item,undefined);
 }
});
