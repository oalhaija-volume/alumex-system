import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path,dependencies={}){
 const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',source)(name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];},exports);return exports;
}
const rules=load('src/lib/measurements/registrationOpening.ts');
const opening={id:'11111111-1111-4111-8111-111111111111',floor:'Roof',room:'Other',otherRoom:'Roof',width:500,height:600,structuralType:'Curtain Wall'};
const capture={photo:'data:image/jpeg;base64,/9j/AAAA',note:'Check fixing points'};
for(const mode of ['authorized','forbidden','missing','error'])test(`Curtain Wall media API: ${mode}`,async()=>{
 const filters=[];let queries=0;
 const api=load('src/app/api/curtain-wall-capture/[projectId]/[openingId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/workflow/access':{salesProject:async id=>{assert.equal(id,opening.id);return mode==='forbidden'?{response:{status:404}}:{admin:{from(table){queries++;assert.equal(table,'openings');return{select(columns){assert.equal(columns,'curtain_wall_capture');return this;},eq(...args){filters.push(args);return this;},async maybeSingle(){return{data:mode==='missing'?null:{curtain_wall_capture:capture},error:mode==='error'?{}:null};}};}}};}},
 });
 const result=await api.GET({}, {params:Promise.resolve({projectId:opening.id,openingId:opening.id})});
 assert.equal(result.status??200,mode==='authorized'?200:mode==='error'?500:404);
 if(mode==='forbidden')assert.equal(queries,0);
 else assert.deepEqual(filters,[['id',opening.id],['project_id',opening.id],['opening_type','Curtain Wall']]);
 if(mode==='authorized'){assert.deepEqual(result.body.curtainWall,capture);assert.equal(result.headers['Cache-Control'],'private, no-store');}
});

test('Curtain Wall supports optional photo and note with bounded local media',()=>{
 for(const curtainWall of [capture,{note:'Note only'},{note:'',photo:capture.photo},{note:''}])assert.deepEqual(rules.normalizeRegistrationOpening({...opening,curtainWall}).curtainWall,curtainWall);
 assert.ok(rules.normalizeRegistrationOpening(opening));
 assert.deepEqual(rules.normalizeCurtainWallCapture({note:'  Check fixing points  '}),{note:'Check fixing points'});
 for(const curtainWall of [false,[],{note:42},{note:'A'.repeat(2001)},{...capture,photo:'https://external.example/image.png'},{...capture,photo:'data:image/svg+xml;base64,AA=='},{...capture,photo:capture.photo+'A'.repeat(700000)}])assert.equal(rules.normalizeRegistrationOpening({...opening,curtainWall}),null);
 assert.equal(rules.normalizeRegistrationOpening({...opening,structuralType:'Window',openingType:'Sliding',curtainWall:capture}),null);
});
test('measurement edit comparison ignores immutable Curtain Wall capture',()=>{
 const saved={...opening,curtainWall:capture};
 const edit=rules.normalizeOpeningEdit({previous:saved,opening:{...saved,width:600}});
 assert.equal(edit.opening.curtainWall,undefined);assert.equal(edit.previous.curtainWall,undefined);
 assert.equal(rules.sameOpeningMeasurements(saved,opening),true);
 assert.equal(rules.sameOpeningMeasurements(saved,edit.opening),false);
});
