import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path,dependencies={}){
 const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',source)(name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];},exports);return exports;
}
const rules=load('src/lib/measurements/registrationOpening.ts');
const opening={id:'11111111-1111-4111-8111-111111111111',floor:'Roof',room:'Other',otherRoom:'Roof',width:500,height:600,structuralType:'Skylight'};
const capture={photo:'data:image/jpeg;base64,/9j/AAAA',drawing:'data:image/png;base64,iVBORw0KGgoAAAA=',sections:[{label:'A',width:200,length:600},{label:'B',width:300,length:250}]};
test('skylight photo, finger drawing and multiple sections normalize together or individually',()=>{
 for(const skylight of [capture,{sections:[],photo:capture.photo},{sections:[],drawing:capture.drawing},{sections:capture.sections}])assert.deepEqual(rules.normalizeRegistrationOpening({...opening,skylight}).skylight,skylight);
 assert.ok(rules.normalizeRegistrationOpening(opening));
});
test('invalid media and section dimensions cannot enter offline queue or API',()=>{
 for(const skylight of [false,[],{sections:null},{sections:Array(31).fill(capture.sections[0])},...[-1,0,Infinity,'10'].map(width=>({sections:[{label:'A',width,length:10}]})),{...capture,photo:'https://external.example/image.png'},{...capture,photo:'data:image/svg+xml;base64,AA=='},{...capture,drawing:capture.photo},{...capture,photo:'data:image/jpeg;base64,iVBORw0KGgoAAAA='},{...capture,photo:capture.photo+'A'.repeat(700000)},{...capture,drawing:capture.drawing+'A'.repeat(350000)}])assert.equal(rules.normalizeRegistrationOpening({...opening,skylight}),null);
 assert.equal(rules.normalizeRegistrationOpening({...opening,structuralType:'Window',openingType:'Sliding',skylight:capture}),null);
});
for(const mode of ['authorized','forbidden','missing','error'])test(`skylight media API: ${mode}`,async()=>{
 const filters=[];let queries=0;
 const api=load('src/app/api/skylight-capture/[projectId]/[openingId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/workflow/access':{salesProject:async id=>{assert.equal(id,opening.id);return mode==='forbidden'?{response:{status:404}}:{admin:{from(table){queries++;assert.equal(table,'openings');return{select(columns){assert.equal(columns,'skylight_capture');return this;},eq(...args){filters.push(args);return this;},async maybeSingle(){return{data:mode==='missing'?null:{skylight_capture:capture},error:mode==='error'?{}:null};}};}}};}},
 });
 const result=await api.GET({}, {params:Promise.resolve({projectId:opening.id,openingId:opening.id})});
 assert.equal(result.status??200,mode==='authorized'?200:mode==='error'?500:404);
 if(mode==='forbidden')assert.equal(queries,0);
 else assert.deepEqual(filters,[['id',opening.id],['project_id',opening.id],['opening_type','Skylight']]);
 if(mode==='authorized'){assert.deepEqual(result.body.skylight,capture);assert.equal(result.headers['Cache-Control'],'private, no-store');}
});
