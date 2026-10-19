import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
 const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const result = {};
 new Function('require', 'exports', source)(name => {if(name==='@/lib/workflow/reactivation')return load('../src/lib/workflow/reactivation.ts');if(name==='@/lib/offline/device')return load('../src/lib/offline/device.ts');if(name==='@/lib/measurements/completion')return load('../src/lib/measurements/completion.ts');if(name==='@/lib/measurements/measurementDelay')return load('../src/lib/measurements/measurementDelay.ts',{'@/lib/auth/permissions':load('../src/lib/auth/permissions.ts')});
    if(name==='@/lib/intake/buildingType')return load('../src/lib/intake/buildingType.ts',{});
    if(name==='@/lib/intake/readinessNote')return load('../src/lib/intake/readinessNote.ts',{});
  if (name === '@/lib/auth/permissions') return load('../src/lib/auth/permissions.ts');
  assert.ok(name in dependencies, name);
  return dependencies[name];
 }, result);
 return result;
}
const permissions = load('../src/lib/auth/permissions.ts');
const stages = load('../src/lib/workflow/stages.ts');
const json = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
const id = '11111111-1111-4111-8111-111111111111';
const roles = ['Indoor Sales','Sales Manager', 'Sales Director', 'Outdoor Sales', 'Admin', 'CEO', 'Company Owner', 'HR'];

for (const role of roles) test(`${role} has consistent CRM page, history and mutation access`, async () => {
 const allowed = ['Indoor Sales','Sales Manager', 'Sales Director', 'Admin', 'CEO', 'Company Owner'].includes(role);
 for (const path of ['/mini-crm', `/projects/${id}/follow-ups`]) {
  assert.equal(permissions.canAccessRoute(path, role), allowed);
  assert.equal(permissions.canAccessRouteWithOverrides(path, role, [{ route_path: path, can_access: true }]), allowed);
 }
 let reads = 0;
 const access = load('../src/lib/workflow/access.ts', {
  'next/server': json,
  '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role, user: { id: 'actor' } }) },
  '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select() { reads++; return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id, created_by: 'actor', follow_up_owner_id: 'actor' } }) }) }) },
 });
 const result = await access.salesProject(id, true);
 assert.equal(!result.response, allowed);
 if (!allowed) { assert.equal(result.response.status, 403); assert.equal(reads, 0); }
});

for (const role of ['Indoor Sales', 'Sales Manager']) test(`${role} can open and follow up projects across the company`, async () => {
 let project = { id, created_by: 'ehab', follow_up_owner_id: null, sales_status: 'new_lead' };
 const access = load('../src/lib/workflow/access.ts', {
  'next/server': json,
  '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role, user: { id: 'fatma' } }) },
  '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: project }) }) }) },
 });
 assert.equal((await access.salesProject(id, true)).response, undefined);
 assert.equal((await access.salesProject(id)).response, undefined);
 project = { ...project, sales_status: 'contract_signed' };
 assert.equal((await access.salesProject(id, true)).response, undefined);
 project = { ...project, sales_status: 'new_lead', follow_up_owner_id: 'another-indoor-employee' };
 assert.equal((await access.salesProject(id, true)).response, undefined);
});

for (const action of ['follow-up', 'ready', 'assign-measurements', 'request-openings']) test(`Outdoor Sales cannot submit ${action} through offline sync`, async () => {
 const route = load('../src/app/api/offline/route.ts', {
  'next/server': json,
  '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role: 'Outdoor Sales', user: { id } }) },
  '@/lib/supabase/admin': { createAdminClient: () => { throw Error('A forbidden action reached the database'); } },
  '@/lib/workflow/followUps': {}, '@/lib/workflow/access': { salesRoles: roles },
  '@/lib/measurements/registrationOpening': {}, '@/lib/location/coordinates': {},
 });
 const result = await route.POST({ json: async () => ({ userId: id, id, projectId: id, recordedAt: new Date().toISOString(), payload: {}, action }) });
 assert.equal(result.status, 403);
});

test('workspace writes and follow-up history request strict CRM authorization', async () => {
 let checks = 0;
 const access = { salesProject: async (projectId, crmOnly) => { assert.equal(projectId, id); assert.equal(crmOnly, true); checks++; return { response: { status: 403 } }; } };
 const writes = load('../src/app/api/workspace/route.ts', { 'next/server': json, '@/lib/auth/adminServer': {}, '@/lib/supabase/admin': {}, '@/lib/workflow/followUps': {}, '@/lib/workflow/access': access });
 assert.equal((await writes.PATCH({ json: async () => ({ projectId: id, action: 'ready' }) })).status, 403);
 const history = load('../src/app/api/projects/[projectId]/follow-ups/route.ts', { 'next/server': json, '@/lib/workflow/access': access });
 assert.equal((await history.GET({}, { params: Promise.resolve({ projectId: id }) })).status, 403);
 assert.equal(checks, 2);
});

test('not-ready links avoid CRM for restricted employees; unsigned quotations and contracts stay in follow-up', () => {
 const project = { id, structure_readiness: 'not_ready', sales_status: 'new_lead' };
 assert.equal(stages.projectLink(project, false), `/projects#project-${id}`);
 assert.equal(stages.projectLink(project, true), `/mini-crm#project-${id}`);
 for (const sales_status of ['new_lead', 'quotation_in_progress', 'quotation_approved', 'contract_generated']) assert.equal(stages.needsSalesFollowUp({ ...project, sales_status }), true);
 for (const sales_status of ['contract_signed', 'transferred_to_operations', 'closed', 'cancelled', 'lost']) assert.equal(stages.needsSalesFollowUp({ ...project, sales_status }), false);
});

for(const action of ['ready','assign-measurements'])test(`online CRM ${action} passes the chosen employee through the versioned RPC`,async()=>{
 const selected='22222222-2222-4222-8222-222222222222';let called=false;
 const route=load('../src/app/api/workspace/route.ts',{
  'next/server':json,'@/lib/auth/adminServer':{},'@/lib/supabase/admin':{},'@/lib/workflow/followUps':load('../src/lib/workflow/followUps.ts'),
  '@/lib/workflow/access':{salesProject:async(_,crmOnly)=>{assert.equal(crmOnly,true);return {auth:{user:{id:'indoor'}},project:{updated_at:'version'},admin:{rpc:async(name,args)=>{called=true;assert.equal(name,'sync_field_change');assert.equal(args.p_action,action);assert.equal(args.p_expected_updated_at,'version');assert.equal(args.p_payload.assignedOutdoorSalesId,selected);return {data:{}};}}};}},
 });
 assert.equal((await route.PATCH({json:async()=>({projectId:id,action,assignedOutdoorSalesId:selected})})).status,200);assert.equal(called,true);
 called=false;assert.equal((await route.PATCH({json:async()=>({projectId:id,action,assignedOutdoorSalesId:'invalid'})})).status,400);assert.equal(called,false);
});
