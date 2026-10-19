import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { canReactivateProject, normalizeReactivation } from '../src/lib/workflow/reactivation.ts';
import { supportsOfflineWorkspace } from '../src/lib/offline/device.ts';

const cancelled = { sales_status: 'cancelled', client_cancelled_at: '2026-10-19T09:00:00Z' };
test('only Indoor Sales and Admin can reactivate client cancellations', () => {
  for (const role of ['Indoor Sales','Sales Manager','Admin','Outdoor Sales','HR','CEO','Sales Director','Company Owner',null]) {
    assert.equal(canReactivateProject(cancelled,role), role === 'Indoor Sales' || role === 'Sales Manager' || role === 'Admin');
    assert.equal(canReactivateProject({...cancelled,sales_status:'new_lead'},role),false);
    assert.equal(canReactivateProject({...cancelled,client_cancelled_at:null},role),false);
  }
});
const input = { note:' Client changed their mind ', confirmed:true, expectedUpdatedAt:'2026-10-19T09:00:00Z' };
test('reactivation requires confirmation, a note, and the displayed project version', () => {
  assert.equal(normalizeReactivation(input).note,'Client changed their mind');
  for (const patch of [{confirmed:false},{note:''},{note:3},{note:'x'.repeat(2001)},{expectedUpdatedAt:''}]) assert.throws(()=>normalizeReactivation({...input,...patch}));
});
test('desktop cannot use the device workspace while phones and tablets retain access', () => {
  for (const agent of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Mozilla/5.0 (Macintosh; Intel Mac OS X)','Mozilla/5.0 (X11; Linux x86_64)','']) assert.equal(supportsOfflineWorkspace(new Headers({'user-agent':agent})),false);
  for (const agent of ['iPhone','Android Mobile','Android Tablet','iPad']) assert.equal(supportsOfflineWorkspace(new Headers({'user-agent':agent})),true);
});

function route(role) {
  const calls=[];
  const deps={
    '@/lib/measurements/measurementDelay':{},
    '@/lib/workflow/reactivation':{normalizeReactivation},
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
    '@/lib/auth/adminServer':{},'@/lib/supabase/admin':{},'@/lib/workflow/followUps':{},
    '@/lib/workflow/access':{salesProject:async()=>({auth:{role,user:{id:'verified-user'}},admin:{rpc:async(name,args)=>{calls.push({name,args});return {data:{}};}},project:{updated_at:'server-version'}})},
  };
  const js=ts.transpileModule(readFileSync(new URL('../src/app/api/workspace/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const api={};new Function('require','exports',js)(name=>{assert.ok(name in deps,name);return deps[name];},api);
  return {api,calls};
}
for (const role of ['Indoor Sales','Sales Manager','Admin','Outdoor Sales','CEO','HR']) test(`reactivation endpoint checks ${role} and ignores a forged actor`,async()=>{
  const {api,calls}=route(role);
  const result=await api.PATCH({json:async()=>({...input,projectId:'project',action:'reactivate-project',actor:'forged'})});
  const allowed=['Indoor Sales','Sales Manager','Admin'].includes(role);
  assert.equal(result.status,allowed?200:403);
  assert.equal(calls.length,allowed?1:0);
  if(allowed){assert.equal(calls[0].args.p_actor,'verified-user');assert.equal(calls[0].args.p_expected_updated_at,input.expectedUpdatedAt);}
});
