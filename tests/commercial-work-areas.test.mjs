import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path){const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('exports',source)(exports);return exports;}
const rules=load('src/lib/measurements/registrationOpening.ts');
const opening={id:'11111111-1111-4111-8111-111111111111',floor:'GF',width:500,height:600,structuralType:'Curtain Wall',openingType:null};
test('commercial facade needs a valid number, without any room selection',()=>{
 const facade=rules.normalizeRegistrationOpening({...opening,workArea:'facade',facadeNumber:2});
 assert.equal(facade.room,'Other');assert.equal(facade.otherRoom,'Facade 2');assert.equal(facade.facadeNumber,2);
 for(const facadeNumber of [undefined,0,-1,1.5,1001,'1',true,Infinity])assert.equal(rules.normalizeRegistrationOpening({...opening,workArea:'facade',facadeNumber}),null);
 assert.equal(rules.normalizeRegistrationOpening({...opening,workArea:'unknown',room:'Office'}),null);
});
test('internal works use the existing room options and residential openings remain unchanged',()=>{
 for(const room of rules.registrationRoomTypes){
  const original={...opening,room,otherRoom:room==='Other'?'Reception':''};
  const normalized=rules.normalizeRegistrationOpening(original);
  assert.ok(normalized);assert.equal(normalized.workArea,undefined);assert.equal(normalized.facadeNumber,undefined);
  const internal=rules.normalizeRegistrationOpening({...original,workArea:'internal'});
  assert.equal(internal.room,room);assert.equal(internal.workArea,'internal');
  assert.equal(rules.normalizeRegistrationOpening({...original,workArea:'internal',facadeNumber:1}),null);
 }
 assert.equal(rules.normalizeRegistrationOpening({...opening,workArea:'internal'}),null);
});
test('area and facade changes participate in stale measurement comparisons',()=>{
 const facade=rules.normalizeRegistrationOpening({...opening,workArea:'facade',facadeNumber:1});
 assert.equal(rules.sameOpeningMeasurements(facade,{...facade,facadeNumber:2}),false);
 assert.equal(rules.sameOpeningMeasurements(facade,{...facade,workArea:undefined,facadeNumber:undefined}),false);
 assert.equal(rules.sameOpeningMeasurements(facade,{...facade}),true);
});
