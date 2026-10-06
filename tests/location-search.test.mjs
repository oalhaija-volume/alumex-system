import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/app/api/location-search/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const route={};new Function('require','exports',source)(name=>name==='next/server'?{NextResponse:{json:(body,options)=>({body,...options})}}:{requireRole:async()=>({ok:true})},route);
test('address search uses search endpoint; selected coordinates use reverse endpoint',async()=>{
 const original=globalThis.fetch;const urls=[];
 globalThis.fetch=async url=>{urls.push(new URL(url));return {ok:true,json:async()=>({display_name:'Baghdad, Iraq',lat:'33.3',lon:'44.4'})};};
 try {
  const search=await route.GET(new Request('http://localhost/api/location-search?q=Baghdad'));
  assert.equal(urls[0].pathname,'/search');assert.equal(urls[0].searchParams.get('q'),'Baghdad');assert.equal(search.body.results[0].label,'Baghdad, Iraq');
  const reverse=await route.GET(new Request('http://localhost/api/location-search?lat=33.3&lng=44.4'));
  assert.equal(urls[1].pathname,'/reverse');assert.equal(reverse.body.result.label,'Baghdad, Iraq');
 } finally {globalThis.fetch=original;}
});
