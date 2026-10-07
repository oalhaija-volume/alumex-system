import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){const output=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',output)(name=>{assert.ok(name in deps,name);return deps[name];},exports);return exports;}
const followUps=load('../src/lib/workflow/followUps.ts');
const stages=load('../src/lib/workflow/stages.ts');
const tasks=load('../src/lib/workflow/salesTasks.ts',{'./stages':stages});
const indoor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'Indoor Sales',name:'Indoor'};
const outdoor={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',role:'Outdoor Sales',name:'Outdoor'};
const schedule={nextFollowUp:'2026-10-08T10:00:00+03:00',note:'Called the client',followUpType:'call',followUpDetail:'ignored',followUpOwnerId:indoor.id};
const base={id:'one',created_by:outdoor.id,structure_readiness:'ready',sales_status:'new_lead',follow_up_owner_id:indoor.id,next_follow_up_at:'2026-10-08T07:00:00Z',assigned_outdoor_sales_id:outdoor.id};
test('scheduling requires a contact type, valid owner and date, and a description for Other',()=>{
 assert.deepEqual(followUps.normalizeFollowUp(schedule),{...schedule,nextFollowUp:'2026-10-08T07:00:00.000Z',followUpDetail:''});
 for(const patch of [{followUpType:''},{followUpType:'invented'},{followUpOwnerId:''},{followUpOwnerId:'not-a-uuid'},{nextFollowUp:'invalid'},{followUpType:'other',followUpDetail:''},{followUpType:'other',followUpDetail:'x'.repeat(121)},{note:'x'.repeat(2001)}])assert.throws(()=>followUps.normalizeFollowUp({...schedule,...patch}));
 assert.equal(followUps.normalizeFollowUp({...schedule,followUpType:'other',followUpDetail:'  Video call  '}).followUpDetail,'Video call');
});
test('reminders become due exactly at the scheduled instant and stay assigned to Indoor Sales',()=>{
 const time=Date.parse(base.next_follow_up_at);
 assert.equal(tasks.dueFollowUps([base],indoor,time-1).length,0);
 assert.equal(tasks.dueFollowUps([base],indoor,time).length,1);
 assert.equal(tasks.dueFollowUps([base],indoor,time+86400000).length,1);
 assert.equal(tasks.dueFollowUps([base],{...indoor,id:'someone-else'},time).length,0);
 assert.equal(tasks.dueFollowUps([base],outdoor,time).length,0);
 assert.equal(tasks.dueFollowUps([{...base,next_follow_up_at:'2026-10-09T07:00:00Z'}],indoor,time).length,0);
});
test('quotation and unsigned contract reminders remain active; signed and closed projects leave the queue',()=>{
 const now=Date.parse('2026-10-10T00:00:00Z');
 for(const sales_status of ['new_lead','ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated'])assert.equal(tasks.dueFollowUps([{...base,sales_status}],indoor,now).length,1,sales_status);
 for(const sales_status of ['contract_signed','transferred_to_operations','cancelled','lost','closed'])assert.equal(tasks.dueFollowUps([{...base,sales_status}],indoor,now).length,0,sales_status);
});
test('measurement tasks include assigned ready sites and self-created sites, and clear on completion',()=>{
 assert.equal(tasks.measurementTasks([base],outdoor).length,1);
 assert.equal(tasks.measurementTasks([{...base,assigned_outdoor_sales_id:null}],outdoor).length,1);
 assert.equal(tasks.measurementTasks([{...base,assigned_outdoor_sales_id:'another'}],outdoor).length,0);
 assert.equal(tasks.measurementTasks([{...base,structure_readiness:'not_ready'}],outdoor).length,0);
 assert.equal(tasks.measurementTasks([{...base,sales_status:'ready_for_quotation'}],outdoor).length,0);
 assert.equal(tasks.measurementTasks([base],indoor).length,0);
});
test('the follow-up API rejects incomplete scheduling before calling the database',async()=>{
 let calls=0;let payload;
 const route=load('../src/app/api/workspace/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{},'@/lib/supabase/admin':{},'@/lib/workflow/followUps':followUps,
  '@/lib/workflow/access':{salesProject:async()=>({auth:{user:indoor},project:{updated_at:'version'},admin:{rpc:async(name,args)=>{calls++;payload=args.p_payload;return {error:null};}}})},
 });
 const incomplete=await route.PATCH({json:async()=>({projectId:'project',action:'follow-up',nextFollowUp:schedule.nextFollowUp})});assert.equal(incomplete.status,400);assert.equal(calls,0);
 const result=await route.PATCH({json:async()=>({projectId:'project',action:'follow-up',...schedule})});assert.equal(result.status,200);assert.equal(calls,1);assert.equal(payload.followUpOwnerId,indoor.id);assert.equal(payload.followUpType,'call');
});
