import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';

function modules(dependencies = {}) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      return load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url));
    }, exports);
    return exports;
  }
  return path => load(new URL(`../src/${path}`, import.meta.url));
}

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const creatorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const legacyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const teammateId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const project = {
  id: projectId, project_name: 'Scoped measurements', project_number: 'PRJ-RECORD',
  created_by: creatorId, assigned_outdoor_sales_id: teammateId, legacy_outdoor_sales_id: legacyId,
  original_creator_role: 'Indoor Sales', created_at: '2026-11-08T08:00:00Z', updated_at: '2026-11-08T08:01:00Z',
  branch: 'Karkh', governorate: null, building_type: 'villa_house', structure_readiness: 'ready', sales_status: 'new_lead',
  address: 'Saved project address', location_latitude: 33.3, location_longitude: 44.4,
  measurement_delayed_by: null, client_cancelled_by: null,
};
const profiles = [
  { id: creatorId, full_name: 'Original creator', username: 'creator' },
  { id: teammateId, full_name: 'Assigned teammate', username: 'assignee' },
  { id: legacyId, full_name: null, username: 'original-outdoor-owner' },
];
const opening = { id: 'opening', created_by: actorId, floor: 'GF', room: 'Office', width: 120, height: 150, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' };
const context = { params: Promise.resolve({ projectId }) };

function fixture({ auth, projectPatch = {}, profileError = null, held = false } = {}) {
  const reads = [];
  const pending = new Map();
  const row = { ...project, ...projectPatch };
  const actor = auth ?? { ok: true, user: { id: actorId }, role: 'Outdoor Sales', profile: { branch: null }, outdoorTeamMemberIds: [actorId, teammateId] };
  const admin = { from(table) {
    const read = { table, filters: [] };
    reads.push(read);
    const query = {
      select(fields) { read.fields = fields; return this; },
      eq(key, value) { read.filters.push([key, value]); return this; },
      in(key, values) { read.filters.push([key, values]); return this; },
      order() { return this; },
      async maybeSingle() {
        assert.equal(table, 'projects');
        assert.deepEqual(read.filters, [['id', projectId]]);
        const fields = read.fields.split(',').map(field => field.trim());
        return { data: Object.fromEntries(fields.map(field => [field, row[field] ?? null])), error: null };
      },
      then(resolve, reject) {
        const result = { data: table === 'openings' ? [opening] : profiles, error: table === 'profiles' ? profileError : null };
        if (held) return new Promise(done => pending.set(table, () => done(result))).then(resolve, reject);
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => actor },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  return { reads, pending, route: load('app/api/initial-measurements/[projectId]/route.ts') };
}

test('one measurement response supplies attribution and location using parallel project-scoped reads', async () => {
  const x = fixture({ held: true });
  const response = x.route.GET(new Request('http://localhost:3003/api/initial-measurements/' + projectId), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...x.pending.keys()].sort(), ['openings', 'profiles']);
  assert.deepEqual(x.reads.map(read => read.table), ['projects', 'openings', 'profiles']);
  assert.deepEqual(x.reads.find(read => read.table === 'openings').filters, [['project_id', projectId]]);
  const peopleRead = x.reads.find(read => read.table === 'profiles');
  assert.deepEqual(peopleRead.filters, [['id', [creatorId, teammateId, legacyId]]]);
  x.pending.get('profiles')();
  x.pending.get('openings')();
  const result = await response;
  assert.equal(result.status, 200);
  assert.equal(result.body.recordError, false);
  const record = result.body.project;
  assert.equal(record.registeredBy, 'Original creator');
  assert.equal(record.assignedOutdoorSales, 'Assigned teammate');
  assert.equal(record.legacyOutdoorSalesOwner, 'original-outdoor-owner');
  assert.equal(record.original_creator_role, 'Indoor Sales');
  assert.equal(record.created_at, project.created_at);
  assert.equal(record.address, project.address);
  assert.equal(record.location_latitude, 33.3);
  assert.equal(record.location_longitude, 44.4);
  assert.equal(record.assignedToYou, false);
  assert.equal(record.assignedToTeam, true);
  assert.equal(result.body.openings[0].createdBy, actorId);
});

test('failed attribution lookup leaves measurements usable and reports its independent warning', async () => {
  const x = fixture({ profileError: { message: 'Private database error' } });
  const response = await x.route.GET(new Request('http://localhost:3003/api/initial-measurements/' + projectId), context);
  assert.equal(response.status, 200);
  assert.equal(response.body.recordError, true);
  assert.equal(response.body.openings.length, 1);
  assert.equal(JSON.stringify(response.body).includes('Private database error'), false);
});

for (const variant of ['unauthorized', 'other team', 'other branch']) {
  test(`measurement record does not start attribution or opening reads for ${variant}`, async () => {
    const x = fixture(variant === 'unauthorized'
      ? { auth: { ok: false, error: 'Authentication is required.', status: 401 } }
      : variant === 'other team'
        ? { projectPatch: { assigned_outdoor_sales_id: legacyId } }
        : { auth: { ok: true, user: { id: actorId }, role: 'Indoor Sales', profile: { branch: 'Rasafa' } } });
    const response = await x.route.GET(new Request('http://localhost:3003/api/initial-measurements/' + projectId), context);
    assert.equal(response.status, variant === 'unauthorized' ? 401 : 404);
    assert.ok(x.reads.every(read => read.table === 'projects'));
  });
}

test('a supplied measurement project renders its record without a full workspace request, including during initial load', () => {
  const effects = [];
  let requests = 0;
  const load = modules({
    react: { useState: () => [null, () => {}], useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': jsxRuntime,
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value, formatDateTime: value => value }) },
    '@/lib/offline/client': { fieldFetch: () => { requests++; throw new Error('Unexpected workspace download'); } },
    '@/components/projects/SavedProjectLocation': { SavedProjectLocation: ({ project }) => React.createElement('p', null, project.address) },
  });
  const { ProjectRecord } = load('components/workflow/ProjectRecord.tsx');
  const loaded = { ...project, registeredBy: 'Original creator', assignedOutdoorSales: 'Assigned teammate', legacyOutdoorSalesOwner: 'original-outdoor-owner' };
  assert.equal(ProjectRecord({ projectId, project: null }), null);
  const html = renderToStaticMarkup(ProjectRecord({ projectId, project: loaded }));
  for (const effect of effects) effect();
  assert.equal(requests, 0);
  for (const value of ['Original creator', 'Assigned teammate', 'original-outdoor-owner', project.created_at, project.address]) assert.ok(html.includes(value));
});
