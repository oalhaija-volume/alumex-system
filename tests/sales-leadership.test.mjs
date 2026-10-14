import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';

function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const roles = load('../src/lib/auth/roles.ts');
const permissions = load('../src/lib/auth/permissions.ts');
const capabilities = load('../src/lib/auth/capabilities.ts');
const mobile = load('../src/lib/auth/mobileAccess.ts');
const json = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
const projectId = '11111111-1111-4111-8111-111111111111';

function authorization(role, active = true) {
  return load('../src/lib/auth/adminServer.ts', {
    'next/headers': { headers: async () => new Headers({'user-agent':'Desktop'}) },
    '@/lib/auth/mobileAccess': mobile,
    '@/lib/auth/roles': roles,
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => false },
    '@/lib/supabase/admin': {},
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'leader', email: 'leader@example.invalid' } } }) },
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role, is_active: active, status: active ? 'Active' : 'Inactive' } }) }),
    }) },
  });
}

for (const role of ['Sales Director', 'CEO']) {
  test(`${role} retains its identity and has full sales pages and capabilities`, () => {
    assert.equal(roles.normalizeAppRole(role), role);
    assert.ok(roles.appRoles.includes(role));
    assert.equal(permissions.defaultRouteForRole(role), '/dashboard');
    for (const path of ['/dashboard', '/projects', '/intake', '/mini-crm', `/initial-measurements/${projectId}`, `/quotation/${projectId}`, `/contract/${projectId}`, `/projects/${projectId}/follow-ups`]) {
      assert.equal(permissions.canAccessRoute(path, role), true, path);
    }
    for (const capability of ['clients:create', 'clients:update', 'projects:create', 'projects:view-team', 'projects:reassign', 'measurements:request', 'measurements:record', 'measurements:review', 'quotations:manage', 'contracts:manage', 'follow-ups:perform']) {
      assert.ok(capabilities.roleHasCapability(role, capability), capability);
      assert.ok(capabilities.rolesForCapability(capability).includes(role), capability);
    }
    assert.ok(roles.canViewSalesPrices(role));
    assert.ok(roles.canViewFinanceValues(role));
    for (const path of ['/hr', '/catalog']) assert.equal(permissions.canAccessRoute(path, role), false);
    assert.equal(permissions.canAccessRoute('/operations', role), role === 'CEO');
    assert.equal(capabilities.roleHasCapability(role, 'workflow:configure'), false);
  });

  test(`${role} passes real authorization without becoming Admin`, async () => {
    const auth = authorization(role);
    const allowed = await auth.requireRole(['Admin', 'Sales Director', 'CEO', 'Indoor Sales', 'Outdoor Sales']);
    assert.equal(allowed.ok, true);
    assert.equal(allowed.role, role);
    assert.equal((await auth.requireAdminUser()).ok, false);
    assert.equal((await auth.requireRole(['Admin', 'HR'])).ok, false);
    assert.equal((await auth.requireRole(['Admin'])).ok, false);
    assert.equal((await authorization(role, false).requireRole([role])).ok, false);
  });

  test(`${role} can open another employee's project`, async () => {
    const project = {id:projectId,created_by:'other',follow_up_owner_id:'other',assigned_outdoor_sales_id:'other'};
    const access = load('../src/lib/workflow/access.ts', {
      'next/server': json,
      '@/lib/auth/adminServer': authorization(role),
      '@/lib/supabase/config': {hasSupabaseServiceRoleKey:()=>true},
      '@/lib/supabase/admin': {createAdminClient:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:project})})})},
    });
    const result = await access.salesProject(projectId);
    assert.equal(result.response, undefined);
    assert.equal(result.project, project);
    assert.equal(result.auth.role, role);
  });

  test(`${role} sees team projects without owner filters in online and offline lists`, async () => {
    for (const path of ['../src/app/api/workspace/route.ts', '../src/app/api/offline/route.ts']) {
      let filters = 0;
      const admin = {from: table => ({
        select(){return this;},eq(){return this;},in(){return this;},order(){return this;},or(){filters++;return this;},
        single:async()=>({data:{full_name:'Leader'}}),
        then(resolve){return Promise.resolve({data:table==='projects'?[{id:projectId,client_id:'client',created_by:'other'}]:[],error:null}).then(resolve);},
      })};
      const route = load(path, {
        'next/server':json, '@/lib/auth/adminServer':authorization(role),
        '@/lib/supabase/admin':{createAdminClient:()=>admin},
        '@/lib/workflow/access':{salesRoles:['Admin','Sales Director','CEO','Indoor Sales','Outdoor Sales']},
        '@/lib/workflow/followUps':{}, '@/lib/measurements/registrationOpening':{}, '@/lib/location/coordinates':{},
      });
      const result = await route.GET(new Request('http://localhost:3003/api/offline'));
      assert.equal(result.status,200);
      assert.equal(result.body.projects[0].created_by,'other');
      assert.equal(filters,0);
    }
  });

  test(`${role} provisioning requires the database permissions migration`, async () => {
    let created = false;
    const route = load('../src/app/api/admin/users/route.ts', {
      'next/server':json, '@/lib/auth/adminServer':authorization('Admin'), '@/lib/auth/roles':roles,
      '@/lib/auth/username':load('../src/lib/auth/username.ts'),
      '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
      '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({error:{message:'Missing migration'}}),auth:{admin:{createUser:()=>{created=true;}}}})},
    });
    const result = await route.POST({json:async()=>({fullName:'Leader',username:'leader',password:'example-password',role})});
    assert.equal(result.status,503);
    assert.equal(created,false);
  });

  test(`${role} provisions successfully with its own stored role`, async () => {
    let saved;
    const route = load('../src/app/api/admin/users/route.ts', {
      'next/server':json, '@/lib/auth/adminServer':authorization('Admin'), '@/lib/auth/roles':roles,
      '@/lib/auth/username':load('../src/lib/auth/username.ts'),
      '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
      '@/lib/supabase/admin':{createAdminClient:()=>({
        rpc:async()=>({data:true}),
        from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null}),upsert:async value=>{saved=value;return {};}}),
        auth:{admin:{createUser:async()=>({data:{user:{id:'new-leader'}}})}},
      })},
    });
    const result = await route.POST({json:async()=>({fullName:'Leader',username:'leader',password:'example-password',role})});
    assert.equal(result.status,201);
    assert.equal(saved.role,role);
    assert.equal(result.body.user.role,role);
    assert.equal('password' in saved,false);
  });

  test(`${role} operations acceptance follows its permitted scope`, async () => {
    let called = false;
    const route = load('../src/app/api/operations/route.ts', {
      'next/server':json, '@/lib/auth/adminServer':authorization(role), '@/lib/workflow/operations':{},
      '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{
        called=true;assert.equal(name,'advance_sales_flow');assert.equal(args.p_action,'accept');assert.equal(args.p_actor,'leader');return {data:{quotation:{total:100}}};
      }})},
    });
    const result=await route.POST({json:async()=>({projectId,revision:1})});
    assert.equal(result.status,role==='CEO'?200:403);
    assert.equal(called,role==='CEO');
    if(called)assert.deepEqual(result.body,{ok:true});
  });
}

for (const actor of ['Admin', 'HR']) test(`${actor} employee form offers both leadership roles`, () => {
  const component = load('../src/components/workflow/EmployeeWorkspace.tsx', {
    'react': React, 'react/jsx-runtime': jsxRuntime,
    '@/components/i18n/I18nProvider': {useI18n:()=>({term:value=>value})},
    '@/components/auth/useCurrentRole': {useCurrentRole:()=>({role:actor})},
    './ui': {useResource:()=>({data:{users:[]},error:'',loading:false}),Workspace:({children})=>children,Notice:()=>null},
  });
  const markup=renderToStaticMarkup(React.createElement(component.EmployeeWorkspace));
  assert.match(markup, /<option value="Sales Director">Sales Director<\/option>/);
  assert.match(markup, /<option value="CEO">CEO<\/option>/);
  assert.equal(markup.includes('<option value="Admin">'),actor==='Admin');
});
