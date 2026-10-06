import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadModule(path, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

for (const path of ['../src/app/api/clients/route.ts', '../src/app/api/sales-intake/route.ts']) {
  test(`${path} rejects Sales Manager before reading or writing client data`, async () => {
    const dependencies = {
      'next/server': { NextResponse: { json: (body, options) => ({body, ...options}) } },
      '@/lib/auth/adminServer': { requireRole: async (roles) => roles.includes('Sales Manager')
        ? {ok: true, role: 'Sales Manager', user: {id: 'outdoor'}}
        : {ok: false, status: 403, error: 'Forbidden'} },
      '@/lib/supabase/admin': { createAdminClient: () => { throw new Error('Database must not be reached'); } },
      '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
      '@/lib/friendlyErrors': {},
      '@/lib/projects/access': {},
      '@/lib/projects/numbering': {},
      '@/lib/intake/companyName': {},
      '@/lib/location/coordinates': {},
      '@/lib/intake/nextStage': {},
      '@/lib/measurements/assignment': {},
    };
    const route = loadModule(path, dependencies);
    const response = await route.POST({json: () => { throw new Error('Body must not be read'); }});
    assert.equal(response.status, 403);
  });
}

test('Outdoor Sales can open mobile intake but Sales Manager cannot bypass intake permissions', () => {
  const permissions = loadModule('../src/lib/auth/permissions.ts', {
    '@/lib/systemScope': {isActiveSystemRoute: () => true},
    '@/lib/auth/pageAccess': {routePathMatches: (path, prefix) => path === prefix || path.startsWith(`${prefix}/`)},
  });
  assert.equal(permissions.canAccessRoute('/intake', 'Outdoor Sales'), true);
  assert.equal(permissions.canAccessRouteWithOverrides('/intake', 'Sales Manager', [{route_path:'/intake',can_access:true}]), false);
  assert.equal(permissions.canAccessRoute('/intake', 'Indoor Sales'), true);
  assert.equal(permissions.canAccessRoute('/measurements', 'Outdoor Sales'), true);
});

test('measurement assignment notifies only the assignee with the measurement link', async () => {
  const notifications = [];
  const assignment = loadModule('../src/lib/measurements/assignment.ts', {
    'server-only': {},
    '@/lib/supabase/admin': {},
    '@/lib/notifications/server': {createInternalNotification: async (notification) => notifications.push(notification)},
  });
  const request = {id:'request-1',project_id:'project-1',assigned_to:'outdoor-1',assigned_at:'2026-10-06T10:00:00Z'};
  assert.equal(await assignment.notifyMeasurementAssignment(request), undefined);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].recipientId, 'outdoor-1');
  assert.equal(notifications[0].linkPath, '/site-measurements/project-1');
  assert.equal(notifications[0].kind, 'action_required');
  await assignment.notifyMeasurementAssignment({...request,assigned_to:null});
  assert.equal(notifications.length, 1);
});

test('notification delivery failure preserves the assignment and reports a retry', async () => {
  const assignment = loadModule('../src/lib/measurements/assignment.ts', {
    'server-only': {},
    '@/lib/supabase/admin': {},
    '@/lib/notifications/server': {createInternalNotification: async () => {throw new Error('Unavailable');}},
  });
  assert.match(await assignment.notifyMeasurementAssignment({id:'r',project_id:'p',assigned_to:'o'}), /saved.*Reassign/);
});

test('project intake rejects a missing Outdoor Sales assignee before saving a client or project', async () => {
  let validated = false;
  const route = loadModule('../src/app/api/sales-intake/route.ts', {
    'next/server': {NextResponse: {json: (body, options) => ({body, ...options})}},
    '@/lib/auth/adminServer': {requireRole: async () => ({ok:true,role:'Indoor Sales',user:{id:'indoor'}})},
    '@/lib/supabase/admin': {createAdminClient: () => ({from: () => {throw new Error('Must not write');}})},
    '@/lib/supabase/config': {hasSupabaseServiceRoleKey: () => true},
    '@/lib/friendlyErrors': {},
    '@/lib/projects/numbering': {},
    '@/lib/intake/companyName': {},
    '@/lib/location/coordinates': {parseProjectLocation: () => ({isValid:false})},
    '@/lib/intake/nextStage': {readinessNeedsFollowUp: () => false},
    '@/lib/measurements/assignment': {validateOutdoorAssignee: async (_admin, id) => {
      validated = true;
      assert.equal(id, '');
      return 'Select an Outdoor Sales employee.';
    }},
  });
  const response = await route.POST({json: async () => ({
    existingClientId:'11111111-1111-4111-8111-111111111111',
    project:{projectName:'Test',projectType:'Residential',address:'Baghdad',branch:'Karkh',source:'showroom_walk_in',structureReadiness:'ready'},
  })});
  assert.equal(validated, true);
  assert.equal(response.status, 400);
});

test('assignee validation rejects inactive employees and non-Outdoor Sales roles', async () => {
  const assignment = loadModule('../src/lib/measurements/assignment.ts', {
    'server-only': {}, '@/lib/supabase/admin': {}, '@/lib/notifications/server': {},
  });
  for (const [profile, expected] of [
    [{role:'Indoor Sales',is_active:true,status:'Active'}, false],
    [{role:'Outdoor Sales',is_active:false,status:'Active'}, false],
    [{role:'Outdoor Sales',is_active:true,status:'Inactive'}, false],
    [null, false],
    [{role:'Outdoor Sales',is_active:true,status:'Active'}, true],
  ]) {
    const query = {select(){return this;},eq(){return this;},async maybeSingle(){return {data:profile,error:null};}};
    const error = await assignment.validateOutdoorAssignee({from: () => query}, 'employee');
    assert.equal(error === null, expected);
  }
});

for (const registrationRole of ['Outdoor Sales', 'Indoor Sales', 'Admin']) for (const readiness of ['ready', 'not_ready']) {
  test(`${registrationRole} short registration saves minimal fields and routes ${readiness} correctly`, async () => {
    const writes = [];
    const admin = {
      from(table) {
        const query = {
          insert(value) { writes.push({table, value}); return this; },
          update(value) { writes.push({table, value}); return this; },
          select() { return this; },
          eq() { return this; },
          async like() { return {data:[],error:null}; },
          async single() { return {data:{id:table === 'clients' ? 'client-1' : 'project-1',project_number:'PRJ-1'},error:null}; },
          then(resolve) { return Promise.resolve({data:null,error:null}).then(resolve); },
        };
        return query;
      },
      rpc() { throw new Error('Outdoor Sales must not call the indoor-only assignment RPC'); },
    };
    const route = loadModule('../src/app/api/sales-intake/route.ts', {
      'next/server': {NextResponse:{json:(body, options) => ({body,...options})}},
      '@/lib/auth/adminServer': {requireRole:async roles => {
        assert.ok(roles.includes('Outdoor Sales'));
        return {ok:true,role:registrationRole,user:{id:'outdoor-1'}};
      }},
      '@/lib/supabase/admin': {createAdminClient:() => admin},
      '@/lib/supabase/config': {hasSupabaseServiceRoleKey:() => true},
      '@/lib/friendlyErrors': {},
      '@/lib/projects/numbering': {generateNextProjectNumber:() => 'PRJ-1'},
      '@/lib/intake/companyName': {intakeCompanyName:() => null},
      '@/lib/location/coordinates': {parseProjectLocation:(latitude,longitude) => ({isValid:latitude != null && longitude != null,latitude,longitude}),outdoorSiteDuplicateRadiusMeters:200,normalizeGeofenceRadius:() => 100},
      '@/lib/intake/nextStage': {readinessNeedsFollowUp:value => value !== 'ready'},
      '@/lib/measurements/assignment': {validateOutdoorAssignee:async (_admin,id) => {
        assert.equal(id,'outdoor-1'); return null;
      }},
    });
    const response = await route.POST({json:async () => ({
      registrationMode:'simple',
      client:{clientName:'Test Client',mobile:'07701234567'},
      project:{locationLatitude:33.3,locationLongitude:44.4,structureReadiness:readiness,outdoorSalesId:'forged-other-user'},
    })});
    assert.equal(response.status,201);
    const project = writes.find(write => write.table === 'projects').value;
    assert.equal(project.project_name,'Test Client');
    assert.equal(project.original_source,registrationRole === 'Outdoor Sales' ? 'outdoor_sales' : 'showroom_walk_in');
    assert.equal(project.created_by,'outdoor-1');
    assert.equal(project.original_creator_role,registrationRole);
    assert.equal(writes.find(write => write.table === 'clients').value.created_by,'outdoor-1');
    assert.equal(project.owner_id,'outdoor-1');
    if (readiness === 'ready') {
      assert.equal(response.body.nextPath,'/site-measurements/project-1');
      assert.equal(writes.find(write => write.table === 'measurement_requests').value.assigned_to,'outdoor-1');
      assert.equal(writes.some(write => write.table === 'follow_up_tasks'),false);
    } else {
      assert.equal(response.body.nextPath,'/dashboard?intake=crm');
      assert.equal(project.sales_status,'waiting_for_follow_up');
      const task = writes.find(write => write.table === 'follow_up_tasks').value;
      assert.equal(task.task_type,'structure_readiness');
      assert.ok(Date.parse(task.due_at) > Date.now());
      assert.equal(writes.some(write => write.table === 'measurement_requests'),false);
    }
  });
}

test('employee access follows roles regardless of old per-person overrides', () => {
  const permissions = loadModule('../src/lib/auth/permissions.ts', {
    '@/lib/systemScope': {isActiveSystemRoute: () => true},
  });
  assert.equal(permissions.canAccessRouteWithOverrides('/hr', 'Outdoor Sales', [{route_path:'/hr',can_access:true}]), false);
  assert.equal(permissions.canAccessRouteWithOverrides('/hr', 'HR', [{route_path:'/hr',can_access:false}]), true);
  assert.equal(permissions.defaultRouteForRole('HR'), '/hr');
  assert.equal(permissions.defaultRouteForRole('Branch Manager'), '/projects');
  assert.equal(permissions.defaultRouteForRole('Site Engineer'), '/measurements');
});

for (const callerRole of ['Admin', 'HR']) {
  test(`${callerRole} can create an employee from name and role with generated login details`, async () => {
    let authPayload;
    let profilePayload;
    const route = loadModule('../src/app/api/admin/users/route.ts', {
      'next/server': {NextResponse:{json:(body,options) => ({body,...options})}},
      '@/lib/auth/adminServer': {requireRole:async () => ({ok:true,role:callerRole,user:{id:'admin'}})},
      '@/lib/auth/roles': {isAppRole:role => ['Admin','Indoor Sales'].includes(role)},
      '@/lib/auth/employeeCredentials': {generateEmployeeCredentials:() => ({username:'employee.test123',password:'Test-only-password-123!'})},
      '@/lib/auth/username': {authEmailForUsername:name => `${name}@auth.alumex.local`,isValidUsername:() => true},
      '@/lib/supabase/config': {hasSupabaseServiceRoleKey:() => true},
      '@/lib/supabase/admin': {createAdminClient:() => ({
        from:() => ({select(){return this;},eq(){return this;},async maybeSingle(){return {data:null,error:null};},async upsert(value){profilePayload=value;return {error:null};}}),
        auth:{admin:{createUser:async value => {authPayload=value;return {data:{user:{id:'new-employee'}},error:null};}}},
      })},
    });
    const result = await route.POST({json:async () => ({fullName:'Test Employee',role:'Indoor Sales'})});
    assert.equal(result.status,201);
    assert.equal(profilePayload.full_name,'Test Employee');
    assert.equal(profilePayload.role,'Indoor Sales');
    assert.equal(authPayload.user_metadata.requires_password_change,true);
    assert.equal(result.body.credentials.username,'employee.test123');
    assert.equal(result.body.credentials.temporaryPassword,authPayload.password);
    assert.equal(result.headers['Cache-Control'],'no-store');
    if (callerRole === 'HR') {
      const denied = await route.POST({json:async () => ({fullName:'Test',role:'Admin'})});
      assert.equal(denied.status,403);
    }
  });
}

test('protected API authorization blocks Outdoor Sales on desktop and allows phones', async () => {
  const mobile = loadModule('../src/lib/auth/mobileAccess.ts', {});
  for (const [role, agent, expected] of [
    ['Outdoor Sales','Mozilla/5.0 (Windows NT 10.0; Win64; x64)',false],
    ['Outdoor Sales','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',true],
    ['Indoor Sales','Mozilla/5.0 (Windows NT 10.0; Win64; x64)',true],
  ]) {
    const server = loadModule('../src/lib/auth/adminServer.ts', {
      'next/headers':{headers:async () => new Headers({'user-agent':agent})},
      '@/lib/auth/mobileAccess':mobile,
      '@/lib/auth/roles':{normalizeAppRole:value => value},
      '@/lib/supabase/config':{hasSupabaseServiceRoleKey:() => false},
      '@/lib/supabase/admin':{},
      '@/lib/supabase/server':{createClient:async () => ({
        auth:{getUser:async () => ({data:{user:{id:'employee',email:'test@example.invalid'}},error:null})},
        from:() => ({select(){return this;},eq(){return this;},async maybeSingle(){return {data:{role,is_active:true,status:'Active'},error:null};}}),
      })},
    });
    const result = await server.requireRole(['Outdoor Sales','Indoor Sales']);
    assert.equal(result.ok,expected);
    if (!expected) {
      assert.equal(result.status,403);
      assert.match(result.error,/mobile phone/);
    }
  }
});
