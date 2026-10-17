import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => { if(name==='@/lib/auth/permissions') return load('../src/lib/auth/permissions.ts'); assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  return exports;
}
const roles = load('../src/lib/auth/roles.ts');
const username = load('../src/lib/auth/username.ts');
const id = '11111111-1111-4111-8111-111111111111';
const input = { id, action: 'update-profile', fullName: 'Updated Employee', username: 'updated.user', role: 'CEO', isActive: true, updatedAt: '2026-10-14T10:00:00.123456Z' };
function route({ role = 'Admin', authenticated = true, databaseError = null, resetError = null, employee = {id} } = {}) {
  const calls = [];
  return { calls, api: load('../src/app/api/admin/users/route.ts', {
    'next/server': { NextResponse: {json:(body, options)=>({body,status:options?.status??200})} },
    '@/lib/auth/adminServer': {requireRole:async allowed=> !authenticated ? {ok:false,status:401,error:'Authentication required'} : !allowed.includes(role) ? {ok:false,status:403,error:'Denied'} : {ok:true,role,user:{id:'actor'}}},
    '@/lib/auth/roles':roles, '@/lib/auth/username':username,
    '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
    '@/lib/supabase/admin':{createAdminClient:()=>({
      rpc:async(name,args)=>{calls.push({name,args});return {data:{id,username:args.p_username,role:args.p_role},error:databaseError};},
      from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:employee})}),
      auth:{admin:{updateUserById:async(user,attributes)=>{calls.push({user,attributes});return {error:resetError};}}},
    })},
  }) };
}
const request = body => ({json:async()=>body});
for (const role of ['Admin','HR']) test(`${role} submits a versioned profile update using the verified actor`, async () => {
  const {api,calls}=route({role});
  const result=await api.PATCH(request({...input,username:' Updated.User ',actor:'forged',password:'must-not-be-used'}));
  assert.equal(result.status,200);
  assert.deepEqual(calls,[{name:'update_employee_profile',args:{p_actor:'actor',p_employee:id,p_expected_updated_at:input.updatedAt,p_full_name:input.fullName,p_username:'updated.user',p_role:'CEO',p_is_active:true}}]);
  assert.equal(JSON.stringify(result).includes('must-not-be-used'),false);
});
for (const role of ['CEO','Sales Director','Indoor Sales','Outdoor Sales']) test(`${role} cannot edit employees`, async () => {
  const {api,calls}=route({role});assert.equal((await api.PATCH(request(input))).status,403);assert.equal(calls.length,0);
});
test('unauthenticated employee editing is rejected', async()=>{
  const {api,calls}=route({authenticated:false});assert.equal((await api.PATCH(request(input))).status,401);assert.equal(calls.length,0);
});
for(const patch of [{id:'bad-id'},{fullName:' '},{username:'bad name'},{username:'.invalid'},{role:'Owner'},{isActive:'false'},{updatedAt:''},{action:'delete'},{updatedAt:undefined}])test(`invalid employee input is rejected: ${JSON.stringify(patch)}`,async()=>{
  const {api,calls}=route();assert.equal((await api.PATCH(request({...input,...patch}))).status,400);assert.equal(calls.length,0);
});
for (const [code,status] of [['23505',409],['40001',409],['42501',403],['P0002',404],['PGRST202',503],['42883',503],['22023',400],['unknown',500]]) test(`profile error ${code} produces actionable HTTP ${status}`,async()=>{
  const {api}=route({databaseError:{code,message:'Example database failure'}});
  const result=await api.PATCH(request(input));assert.equal(result.status,status);
  if(code==='23505')assert.equal(result.body.error,'Username already exists.');
  if(code==='unknown')assert.equal(result.body.error,'Unable to update employee. Please try again.');
});
test('password reset only updates Auth and never profile, email or response credentials',async()=>{
  const {api,calls}=route();const password=' spaces are preserved ';
  const result=await api.PATCH(request({id,action:'reset-password',password}));
  assert.equal(result.status,200);assert.deepEqual(calls,[{user:id,attributes:{password}}]);assert.deepEqual(result.body,{ok:true});
});
test('HR cannot reset passwords, and missing employees or short passwords never reach Auth',async()=>{
  for(const [options,password,status] of [[{role:'HR'},'valid-password',403],[{employee:null},'valid-password',404],[{},'short',400],[{},'x'.repeat(129),400]]){
    const {api,calls}=route(options);assert.equal((await api.PATCH(request({id,action:'reset-password',password}))).status,status);assert.equal(calls.length,0);
  }
});
test('failed Auth reset does not return success or expose internal error details',async()=>{
  const {api}=route({resetError:{message:'sensitive internal error'}});const result=await api.PATCH(request({id,action:'reset-password',password:'valid-password'}));
  assert.equal(result.status,400);assert.equal(JSON.stringify(result).includes('sensitive'),false);
});

const employees=[{id,full_name:'Employee One',username:'employee.one',email:'employee.one@auth.alumex.local',role:'Indoor Sales',status:'Active',is_active:true,updated_at:input.updatedAt},
  {id:'admin-id',full_name:'Admin Employee',username:'admin',email:'admin@alumex.com',role:'Admin',status:'Active',is_active:true,updated_at:input.updatedAt}];
function render(role,editing=false){
  const component=load('../src/components/workflow/EmployeeWorkspace.tsx',{
    'react':{...React,useState(initial){const state=React.useState(initial);return editing&&initial===null?[id,()=>{}]:state;}},'react/jsx-runtime':jsxRuntime,
    '@/components/i18n/I18nProvider':{useI18n:()=>({term:(value,replacements={})=>value?.replace(/\{name\}/g,replacements.name)})},
    '@/components/auth/useCurrentRole':{useCurrentRole:()=>({role,userId:'actor'})},
    './ui':{useResource:()=>({data:{users:employees},error:'',loading:false}),Workspace:({children})=>children,Notice:()=>null},
  });
  return renderToStaticMarkup(React.createElement(component.EmployeeWorkspace));
}
test('HR can edit regular employees but does not see Admin editing controls',()=>{
  const markup=render('HR');assert.match(markup,/aria-label="Edit Employee One"/);assert.doesNotMatch(markup,/aria-label="Edit Admin Employee"/);
});
test('Admin can open editing for Admin and non-Admin employees',()=>{
  const markup=render('Admin');assert.match(markup,/aria-label="Edit Employee One"/);assert.match(markup,/aria-label="Edit Admin Employee"/);
});
test('editor is prefilled, includes leadership roles and status, and separates password reset',()=>{
  const markup=render('Admin',true);
  assert.match(markup,/aria-label="Edit employee"/);assert.match(markup,/value="Employee One"/);assert.match(markup,/value="employee.one"/);
  assert.match(markup,/<option value="CEO">CEO/);assert.match(markup,/<option value="Sales Director">Sales Director/);
  assert.match(markup,/<select name="status"/);assert.match(markup,/aria-label="Reset password"/);
  assert.doesNotMatch(render('HR',true),/aria-label="Reset password"/);
});

test('username patterns work with modern browser validation and enforce login format',()=>{
  const markup=render('Admin',true);
  const patterns=[...markup.matchAll(/pattern="([^"]+)"/g)].map(match=>new RegExp(`^(?:${match[1]})$`,'v'));
  assert.equal(patterns.length,2);
  for(const pattern of patterns){
    for(const username of ['first.last','first-last','first_last','Employee123'])assert.ok(pattern.test(username));
    for(const username of ['.invalid','invalid-','bad name','ab'])assert.equal(pattern.test(username),false);
  }
});

test('legacy Sales User profiles can retain their role while editing information',async()=>{
  const {api,calls}=route();
  const result=await api.PATCH(request({...input,role:'Sales User'}));
  assert.equal(result.status,200);assert.equal(calls[0].args.p_role,'Sales User');
});

for (const branch of ['Karkh','Rasafa']) test(`Admin saves ${branch} together with the employee profile`,async()=>{
 const {api,calls}=route();
 const result=await api.PATCH(request({...input,role:'Indoor Sales',branch}));
 assert.equal(result.status,200);assert.equal(calls[0].name,'update_employee_profile_with_branch');
 assert.equal(calls[0].args.p_branch,branch);assert.equal(calls[0].args.p_actor,'actor');
});
test('invalid branches and non-admin branch edits never reach the database',async()=>{
 for(const [role,branch,status] of [['Admin','Baghdad',400],['Admin',{},400],['HR','Karkh',403],['HR',null,403]]){
  const {api,calls}=route({role});assert.equal((await api.PATCH(request({...input,branch}))).status,status);assert.equal(calls.length,0);
 }
});
test('employee branch selector is available to Admin and hidden from HR',()=>{
 assert.match(render('Admin',true),/<select name="branch"/);
 assert.match(render('Admin',true),/<option value="Karkh">Karkh/);
 assert.match(render('Admin',true),/<option value="Rasafa">Rasafa/);
 assert.doesNotMatch(render('HR',true),/<select name="branch"/);
});
for (const branch of ['Karkh','Rasafa',null]) test(`printed document renders the stored branch: ${branch}`,()=>{
 const {DocumentParties}=load('../src/components/workflow/CommercialDocument.tsx',{
  'react/jsx-runtime':jsxRuntime,
  '@/components/i18n/I18nProvider':{useI18n:()=>({term:value=>value})},
 });
 const markup=renderToStaticMarkup(React.createElement(DocumentParties,{client:{name:'Client',mobile:'07700000000'},project:{number:'PRJ-TEST',address:'Baghdad',branch}}));
 if(branch)assert.match(markup,new RegExp('From '+branch));else assert.doesNotMatch(markup,/From Karkh|From Rasafa/);
});
