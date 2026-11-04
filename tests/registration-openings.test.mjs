import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path,dependencies={}) {
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',source)(name=>{if(name==='@/lib/measurements/openingOwnership')return load('../src/lib/measurements/openingOwnership.ts',{});if(name==='@/lib/auth/outdoorTeams')return load('../src/lib/auth/outdoorTeams.ts',{});if(name==='@/lib/auth/projectBranchAccess')return load('../src/lib/auth/projectBranchAccess.ts',{});if(name==='@/lib/measurements/completion')return load('../src/lib/measurements/completion.ts');if(name==='@/lib/measurements/measurementDelay')return load('../src/lib/measurements/measurementDelay.ts',{'@/lib/auth/permissions':load('../src/lib/auth/permissions.ts')});if(!(name in dependencies))throw Error(name);return dependencies[name];},exports);return exports;
}
const rules=load('../src/lib/measurements/registrationOpening.ts');
const {quotationOpenings}=load('../src/lib/workflow/quotationOpenings.ts',{'@/lib/measurements/registrationOpening':rules});
const base={id:'11111111-1111-4111-8111-111111111111',width:120,height:150,floor:"Ground floor",room:"Bedroom"};
for(const structuralType of ['Window','Door']) test(`${structuralType} requires Sliding or Hinged`,()=>{
 for(const openingType of ['Sliding','Hinged']) assert.ok(rules.normalizeRegistrationOpening({...base,structuralType,openingType}));
 for(const openingType of ['',null,'Fixed',undefined]) assert.equal(rules.normalizeRegistrationOpening({...base,structuralType,openingType}),null);
});
test('Louver forces Hinged, while curtain walls and skylights clear movement',()=>{
 assert.equal(rules.normalizeRegistrationOpening({...base,structuralType:'Louver',openingType:'Sliding'}).openingType,'Hinged');
 for(const structuralType of ['Curtain Wall','Skylight']) assert.equal(rules.normalizeRegistrationOpening({...base,structuralType,openingType:'Sliding'}).openingType,null);
});
test('dimensions must be positive finite numbers and repeated quantities are retained',()=>{
 for(const width of [0,-1,NaN,Infinity,'120']) assert.equal(rules.normalizeRegistrationOpening({...base,width,structuralType:'Louver'}),null);
 assert.equal(rules.normalizeRegistrationOpening({...base,structuralType:'Louver',quantity:20}).quantity,20);
 assert.equal(rules.normalizeRegistrationOpening({...base,structuralType:'Louver'}).quantity,1);
 for(const quantity of [0,-1,1.5,10001,NaN,Infinity,null,'8'])assert.equal(rules.normalizeRegistrationOpening({...base,structuralType:'Louver',quantity}),null);
});
for(const scenario of ['other-owner','not-ready','valid','valid-other']) test(`measurements API ${scenario}`,async()=>{
 const writes=[];
 const route=load('../src/app/api/initial-measurements/[projectId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id:'actor'}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/measurements/registrationOpening':rules,
  '@/lib/supabase/admin':{createAdminClient:()=>({from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:base.id,created_by:scenario==='other-owner'?'other':'actor',structure_readiness:scenario==='not-ready'?'not_ready':'ready',sales_status:'new_lead'}}),insert:async(value)=>{writes.push({table,value});return {error:null};}};}})},
 });
 const response=await route.POST({json:async()=>({...base,room:scenario==='valid-other'?'Other':base.room,otherRoom:scenario==='valid-other'?'Meeting room':'',structuralType:'Louver',openingType:'Sliding',quantity:8,created_by:'forged'})},{params:Promise.resolve({projectId:base.id})});
 assert.equal(response.status,scenario==='other-owner'?404:scenario==='not-ready'?409:201);
 if(!scenario.startsWith('valid')) assert.equal(writes.length,0);
 else {assert.equal(writes[0].table,'openings');assert.equal(writes[0].value.quantity,8);assert.equal(writes[0].value.created_by,'actor');assert.equal(writes[0].value.opening_direction,'Hinged');assert.equal(writes[0].value.floor,'Ground floor');assert.equal(writes[0].value.room,scenario==='valid-other'?'Meeting room':'Bedroom');}
});

test('floor and preset room are required, Other requires a typed room name',()=>{
 const input={...base,structuralType:'Window',openingType:'Sliding'};
 for(const change of [{floor:''},{floor:'  '},{room:''},{room:'invented'},{room:'Other'},{room:'Other',otherRoom:'  '}]) assert.equal(rules.normalizeRegistrationOpening({...input,...change}),null);
 const custom=rules.normalizeRegistrationOpening({...input,floor:'  Second floor  ',room:'Other',otherRoom:'  Meeting room  '});
 assert.equal(custom.floor,'Second floor');assert.equal(custom.otherRoom,'Meeting room');
 const preset=rules.normalizeRegistrationOpening({...input,room:'Kitchen',otherRoom:'stale name'});
 assert.equal(preset.otherRoom,'');assert.equal(preset.room,'Kitchen');
});

for(const scenario of ['complete','repeated','invalid-quantity','empty','incomplete','reopen','save-error']) test(`measurement completion: ${scenario}`,async()=>{
 const updates=[];
 const route=load('../src/app/api/initial-measurements/[projectId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id:'actor'}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/measurements/registrationOpening':rules,
  '@/lib/supabase/admin':{createAdminClient:()=>({from(table){return {
   select(){return this;},update(value){updates.push(value);return this;},
   eq(){return this;},
   maybeSingle:async()=>({data:{id:base.id,created_by:'actor',structure_readiness:'ready',sales_status:'new_lead'}}),
   then(resolve){return Promise.resolve(table==='openings'?{data:scenario==='empty'?[]:[{...base,room:scenario==='incomplete'?'':base.room,quantity:scenario==='repeated'?8:scenario==='invalid-quantity'?0:1,opening_type:'Window',opening_direction:'Sliding'}]}:{error:scenario==='save-error'?{message:'offline'}:null}).then(resolve);},
  };}})},
 });
 const response=await route.PATCH({json:async()=>({action:scenario==='reopen'?'reopen':'finish'})},{params:Promise.resolve({projectId:base.id})});
 assert.equal(response.status??200,['empty','incomplete','invalid-quantity'].includes(scenario)?400:scenario==='save-error'?500:200);
 if(['empty','incomplete','invalid-quantity'].includes(scenario)) assert.equal(updates.length,0);
 else assert.equal(updates[0].sales_status,scenario==='reopen'?'new_lead':'ready_for_quotation');
});

for (const structuralType of ['Window','Door','Curtain Wall']) test(`${structuralType} retains the arch choice and rejects non-boolean values`,()=>{
 const opening={...base,structuralType,openingType:'Sliding'};
 for(const hasArch of [true,false])assert.equal(rules.normalizeRegistrationOpening({...opening,hasArch}).hasArch,hasArch);
 for(const hasArch of [null,'true','false',1,0,'',{},[]])assert.equal(rules.normalizeRegistrationOpening({...opening,hasArch}),null);
 assert.ok(rules.normalizeRegistrationOpening(opening),'Older measurements may omit the optional arch field');
 assert.equal(rules.normalizeRegistrationOpening(opening).hasArch??false,false);
});
test('arches only apply to windows, doors and curtain walls, and legacy false remains compatible with edits',()=>{
 for(const structuralType of ['Skylight','Louver','Facade'])assert.equal(rules.normalizeRegistrationOpening({...base,structuralType,...(structuralType==='Facade'?{workArea:'facade',facadeNumber:1}:{}),hasArch:true}),null);
 const opening={...base,structuralType:'Window',openingType:'Sliding'};
 assert.ok(rules.sameOpeningMeasurements(opening,{...opening,hasArch:false}));
 assert.ok(rules.sameOpeningMeasurements({...opening,hasArch:false},opening));
 assert.equal(rules.sameOpeningMeasurements(opening,{...opening,hasArch:true}),false);
 assert.equal(rules.sameOpeningMeasurements({...opening,hasArch:true},{...opening,hasArch:false}),false);
});

test('curtain wall Arch changes participate in measurement edit conflicts without changing saved capture',()=>{
 const opening={...base,structuralType:'Curtain Wall',openingType:null,quantity:2,curtainWall:{note:'Check curved frame'}};
 assert.ok(rules.sameOpeningMeasurements(opening,{...opening,hasArch:false}));
 assert.ok(rules.sameOpeningMeasurements({...opening,hasArch:false},opening));
 assert.equal(rules.sameOpeningMeasurements(opening,{...opening,hasArch:true}),false);
 assert.equal(rules.sameOpeningMeasurements({...opening,hasArch:true},{...opening,hasArch:false}),false);
 const before=structuredClone(opening);
 const edit=rules.normalizeOpeningEdit({previous:opening,opening:{...opening,hasArch:true}});
 assert.ok(edit);
 assert.equal(edit.opening.hasArch,true);
 assert.equal(edit.previous.hasArch??false,false);
 assert.equal(edit.opening.curtainWall,undefined,'Measurement edits preserve stored media through the existing separate capture path');
 assert.deepEqual(opening,before);
 assert.equal(rules.normalizeOpeningEdit({previous:opening,opening:{...opening,hasArch:'true'}}),null);
});

test('curtain wall Arch survives queued JSON data and maps to the authoritative quotation measurement',()=>{
 for(const hasArch of [true,false,undefined]){
  const draft={...base,structuralType:'Curtain Wall',openingType:null,quantity:3,...(hasArch===undefined?{}:{hasArch})};
  const queued=JSON.parse(JSON.stringify(draft));
  const normalized=rules.normalizeRegistrationOpening(queued);
  assert.ok(normalized);
  const [measured]=quotationOpenings([],[normalized]);
  assert.equal(measured.has_arch,hasArch??false);
  assert.equal(measured.opening_type,'Curtain Wall');
  assert.equal(measured.opening_direction,null);
  assert.equal(measured.quantity,3);
  assert.deepEqual(queued,draft,'Normalizing and quoting must not mutate queued measurements');
 }
});

test('roller shutter requests are optional booleans on windows only and participate in edit conflicts',()=>{
 const opening={...base,structuralType:'Window',openingType:'Sliding'};
 for(const hasRollerShutter of [true,false])assert.equal(rules.normalizeRegistrationOpening({...opening,hasRollerShutter}).hasRollerShutter,hasRollerShutter);
 for(const hasRollerShutter of [null,'true',1,''])assert.equal(rules.normalizeRegistrationOpening({...opening,hasRollerShutter}),null);
 for(const structuralType of ['Door','Skylight','Curtain Wall','Louver'])assert.equal(rules.normalizeRegistrationOpening({...opening,structuralType,hasRollerShutter:true}),null);
 assert.ok(rules.sameOpeningMeasurements(opening,{...opening,hasRollerShutter:false}));
 assert.ok(rules.sameOpeningMeasurements({...opening,hasRollerShutter:false},opening));
 assert.equal(rules.sameOpeningMeasurements(opening,{...opening,hasRollerShutter:true}),false);
});
