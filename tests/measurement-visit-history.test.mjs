import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path) {
 const code=ts.transpileModule(readFileSync(new URL(`../src/${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',code)(name=>load(name.slice(2)),exports);
 return exports;
}
const history=load('lib/measurements/visitHistory');
const actor={id:'visitor',role:'Outdoor Sales'};
const receipt={operation_id:'attempt-one',project_id:'site',actor_id:actor.id,action:'delay-measurements',recorded_at:'2026-10-21T08:00:00Z',result:{measurement_delay_reason:'client_no_answer',measurement_delay_note:'Site was closed',assignedOutdoorSales:'Visitor',photo:'private photo',project_notes:'private unrelated note'}};

function fixture(tables) {
 const reads=[];
 return {reads,from(table){
  const filters=[];let offset=0,end=Infinity;
  const query={
   select(){return this;},order(){return this;},
   eq(key,value){filters.push(row=>row[key]===value);return this;},
   in(key,values){filters.push(row=>values.includes(row[key]));return this;},
   range(first,last){offset=first;end=last+1;return this;},
   or(value){const clauses=value.split(',').map(clause=>clause.split('.eq.'));filters.push(row=>clauses.some(([key,value])=>row[key]===value));return this;},
   then(resolve){const data=tables[table].filter(row=>filters.every(filter=>filter(row))).slice(offset,end);reads.push({table,data});return Promise.resolve({data:[...data],error:null}).then(resolve);},
  };
  return query;
 }};
}

test('visit history projects only the outcome, note, actor and assignment without raw receipts',()=>{
 const attempt=history.measurementAttemptFromReceipt(receipt,'Visitor');
 assert.deepEqual(attempt,{id:'attempt-one',projectId:'site',action:'delay-measurements',reason:'client_no_answer',note:'Site was closed',recordedAt:receipt.recorded_at,recordedBy:'Visitor',recordedById:actor.id,assignedOutdoorSales:'Visitor'});
 assert.equal('photo' in attempt,false);
 assert.equal('project_notes' in attempt,false);
});

test('legacy attempts have a truthful generic reason and subsequent assignments do not repeat stale notes',()=>{
 assert.equal(history.measurementAttemptFromReceipt({...receipt,result:{measurement_delay_note:'Call next week'}},'Visitor').reason,'client_delay');
 const assignment=history.measurementAttemptFromReceipt({...receipt,action:'assign-measurements'},'Indoor');
 assert.equal(assignment.reason,null);
 assert.equal(assignment.note,'');
});

test('history includes every page and only the requested project/action scope',async()=>{
 const receipts=Array.from({length:1002},(_,index)=>({...receipt,operation_id:`attempt-${index}`}));
 const admin=fixture({field_sync_receipts:[...receipts,{...receipt,project_id:'unrelated'},{...receipt,action:'follow-up'}],profiles:[{id:actor.id,full_name:'Visitor'}]});
 const result=await history.loadMeasurementAttempts(admin,['site']);
 assert.equal(result.error,null);
 assert.equal(result.data.get('site').length,1002);
 assert.equal(result.data.size,1);
 assert.equal(result.data.get('site')[0].recordedBy,'Visitor');
 assert.equal(admin.reads.filter(read=>read.table==='field_sync_receipts').length,2);
});

test('a previous visitor keeps a read-only site log after reassignment without unrelated project access',async()=>{
 const base={created_at:'2026-10-21T07:00:00Z',created_by:'creator',assigned_outdoor_sales_id:'next-visitor'};
 const admin=fixture({projects:[{...base,id:'site'},{...base,id:'finished-site'},{...base,id:'mine',created_by:actor.id},{...base,id:'unrelated'}],field_sync_receipts:[receipt,{...receipt,project_id:'finished-site',action:'finish'},{...receipt,project_id:'unrelated',actor_id:'someone-else'}]});
 const result=await history.loadWorkspaceProjects(admin,actor);
 assert.deepEqual(result.data.map(project=>project.id).sort(),['finished-site','mine','site']);
 assert.equal(history.isHistoricalProject(result.data.find(project=>project.id==='finished-site'),actor),true);
 assert.equal(history.isHistoricalProject(result.data.find(project=>project.id==='site'),actor),true);
 assert.equal(history.isHistoricalProject(result.data.find(project=>project.id==='mine'),actor),false);
});

test('Indoor history discovery preserves branch scope and never uses another employee visit to widen it',async()=>{
 const admin=fixture({projects:[{id:'karkh',branch:'Karkh'},{id:'rasafa',branch:'Rasafa'}],field_sync_receipts:[receipt]});
 const result=await history.loadWorkspaceProjects(admin,{id:'indoor',role:'Indoor Sales',branch:'Karkh'});
 assert.deepEqual(result.data.map(project=>project.id),['karkh']);
 assert.equal(admin.reads.some(read=>read.table==='field_sync_receipts'),false);
});
