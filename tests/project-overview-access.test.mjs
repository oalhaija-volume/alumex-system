import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, project, quotation, projectId, otherId, reportId, actorId, timestamp } from './project-overview-fixture.mjs';

test('Branch Manager reads the same-branch summary without loading private documents or measurements', async () => {
 const x = fixture(); const before = structuredClone(x.tables);
 const response = await x.get(); const data = await response.json();
 assert.equal(response.status, 200);
 assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
 assert.equal(response.headers.get('X-Alumex-Actor'), actorId);
 assert.deepEqual(data.actor, { id: actorId, role: 'Branch Manager', name: 'Overview reader', branch: 'Karkh' });
 assert.equal(data.project.registeredBy, 'Original creator');
 assert.equal(data.project.assignedOutdoorSales, 'Measurement employee');
 assert.equal(data.project.followUpOwner, 'indoor.employee');
 assert.equal(data.client.name, 'Current client');
 assert.equal(data.client.alternate_mobile, '07800000000');
 assert.deepEqual(data.openings, []);
 assert.equal(data.flow, null);
 assert.deepEqual(data.history, []);
 assert.deepEqual(data.documentRevisions, []);
 assert.deepEqual(data.measurementReports, []);
 assert.equal(data.signedCopyAvailable, false);
 assert.equal(data.section, 'overview');
 assert.deepEqual(x.reads.map(read => read.table).sort(), ['projects', 'clients', 'client_contacts', 'profiles'].sort());
 assert.doesNotMatch(JSON.stringify(data), /private-path|private-signed-file|PRIVATE_REPORT_PHOTO/);
 assert.deepEqual(x.tables, before, 'Rendering/read projection must preserve all stored snapshots');
 assert.equal(x.reads[0].table, 'projects');
 assert.equal(x.downloads.length, 0);
 assert.deepEqual(Object.keys(x.route), ['GET'], 'No mutation handler is introduced');
 const permissions = x.load('src/lib/auth/permissions');
 assert.equal(permissions.canPrepareQuotation('Branch Manager'), false);
 assert.equal(permissions.canAccessCRM('Branch Manager'), false);
 assert.equal(permissions.canAccessRoute(`/quotation/${projectId}`, 'Branch Manager'), false);
 assert.equal(permissions.canAccessRoute(`/contract/${projectId}`, 'Branch Manager'), false);
 assert.equal(permissions.canAccessRoute(`/projects/${projectId}`, 'Branch Manager'), true);
 const commercial = await x.load('src/lib/workflow/access').salesProject(projectId, 'commercial');
 assert.equal(commercial.response.status, 403, 'Overview permission does not grant access to sales workflow writes');
});

for (const role of ['Admin', 'Sales Director', 'Company Owner']) test(`${role} can review a project across branch boundaries`, async () => {
 const x = fixture({ role, branch: 'Rasafa', row: project({ branch: 'Najaf' }) });
 assert.equal((await x.get()).status, 200);
});

for (const query of ['', '?section=measurements', '?section=follow-ups', '?section=quotation', '?section=contract', `?opening=${reportId}`, `?report=${reportId}`, '?download=signed']) test(`foreign Branch Manager cannot read project dependencies ${query || '(overview)'}`, async () => {
 const x = fixture({ branch: 'Rasafa' });
 assert.equal((await x.get(query)).status, 404);
 assert.deepEqual(x.reads.map(read => read.table), ['projects']);
 assert.equal(x.downloads.length, 0);
});

for (const scenario of [
 { label: 'Karkh includes its governorates office', actor: 'Karkh', project: { branch: 'Governorates', governorate: 'بابل' }, allowed: true },
 { label: 'Najaf retains legacy governorates geography', actor: 'Najaf', project: { branch: 'Governorates', governorate: 'النجف' }, allowed: true },
 { label: 'Karkh cannot inherit an unmarked legacy Najaf project', actor: 'Karkh', project: { branch: 'Governorates', governorate: 'النجف' }, allowed: false },
 { label: 'Karkh retains its explicitly registered Najaf governorates project', actor: 'Karkh', project: { branch: 'Governorates', governorate: 'النجف', governorate_office: 'Karkh' }, allowed: true },
 { label: 'Najaf cannot inherit Karkh governorates office records', actor: 'Najaf', project: { branch: 'Governorates', governorate: 'النجف', governorate_office: 'Karkh' }, allowed: false },
 { label: 'unassigned branch has no project visibility', actor: null, project: {}, allowed: false },
]) test(`Branch Manager scope: ${scenario.label}`, async () => {
 const x = fixture({ branch: scenario.actor, row: project(scenario.project) });
 assert.equal((await x.get()).status, scenario.allowed ? 200 : 404);
 if (!scenario.allowed) assert.deepEqual(x.reads.map(read => read.table), ['projects']);
});

test('CEO retains existing branch scope rather than receiving a new global bypass', async () => {
 assert.equal((await fixture({ role: 'CEO', branch: 'Rasafa' }).get()).status, 404);
 assert.equal((await fixture({ role: 'CEO', branch: 'Karkh' }).get()).status, 200);
});

for (const role of ['Operations Manager', 'Project Manager', 'Indoor Sales', 'Outdoor Sales', 'Finance / Accountant']) test(`${role} cannot use the leadership overview endpoint`, async () => {
 const x = fixture({ role });
 assert.equal((await x.get()).status, 403);
 assert.deepEqual(x.reads, []);
});

test('unauthenticated, invalid, archived and missing projects fail before related data reads', async () => {
 const unauthenticated = fixture({ authStatus: 401 });
 assert.equal((await unauthenticated.get()).status, 401); assert.deepEqual(unauthenticated.reads, []);
 const invalid = fixture();
 assert.equal((await invalid.get('', 'not-a-valid-project-id')).status, 404); assert.deepEqual(invalid.reads, []);
 for (const row of [null, project({ archived_at: timestamp })]) {
  const x = fixture({ row }); assert.equal((await x.get()).status, 404); assert.deepEqual(x.reads.map(read => read.table), ['projects']);
 }
 const unavailable = fixture({ serviceAvailable: false });
 assert.equal((await unavailable.get()).status, 503); assert.deepEqual(unavailable.reads, []);
});

test('contacts are limited to this project and general contacts of its own client', async () => {
 const x = fixture({ tables: { client_contacts: [
  { id: 'general', client_id: 'client', project_id: null, is_primary: true },
  { id: 'this-project', client_id: 'client', project_id: projectId, is_primary: false },
  { id: 'other-project', client_id: 'client', project_id: otherId, is_primary: false },
  { id: 'other-client', client_id: 'foreign-client', project_id: null, is_primary: false },
 ] } });
 const data = await (await x.get()).json();
 assert.deepEqual(data.contacts.map(contact => contact.id), ['general', 'this-project']);
});

test('the project overview includes only its public document revisions and preserves the original signed contract', async () => {
 const revision = { id: reportId, project_id: projectId, document_revision: 1, source_workflow_revision: 8, source_signed_at: timestamp,
  source_contract: { number: 'PRIVATE_SOURCE_CONTRACT', path: 'PRIVATE_STORAGE_PATH' }, contract: { number: 'CT-FROZEN-R1', quotation: quotation(222), terms: [] },
  format_version: 'billable-opening-schedule-v1', status: 'pending_approval', revision: 1, created_by: actorId, created_at: timestamp, approved_by: null, approved_at: null, signed_at: null, evidence: null };
 const x = fixture({ tables: { contract_document_revisions: [revision, { ...revision, id: otherId, project_id: otherId }] } });
 const before = structuredClone(x.tables);
 const response = await x.get('?section=contract'); const data = await response.json();
 assert.equal(response.status, 200);
 assert.deepEqual(data.documentRevisions.map(row => row.id), [reportId]);
 assert.equal(data.documentRevisions[0].contract.number, 'CT-FROZEN-R1');
 assert.equal(data.documentRevisions[0].evidence, null);
 assert.equal(data.flow.contract.number, 'CT-FROZEN');
 assert.equal(data.flow.evidence.signer, 'Saved signer');
 assert.doesNotMatch(JSON.stringify(data.documentRevisions), /PRIVATE_SOURCE_CONTRACT|PRIVATE_STORAGE_PATH|source_contract/);
 assert.deepEqual(x.tables, before);
});

test('measurement photo reads are scoped to the authorized project and report', async () => {
 const x = fixture({ tables: { measurement_completion_reports: [
  { id: reportId, project_id: projectId, photo: 'OWN_PHOTO' },
  { id: otherId, project_id: otherId, photo: 'FOREIGN_PHOTO' },
 ] } });
 const response = await x.get(`?report=${reportId}`);
 assert.equal(response.status, 200); assert.deepEqual(await response.json(), { photo: 'OWN_PHOTO' });
 assert.deepEqual(x.reads.map(read => read.table), ['projects', 'measurement_completion_reports']);
 assert.equal((await x.get(`?report=${otherId}`)).status, 404);
 assert.equal((await x.get('?report=invalid')).status, 404);
});

test('signed upload downloads use only the current authorized workflow and keep its path private', async () => {
 const x = fixture();
 const response = await x.get('?download=signed');
 assert.equal(response.status, 200); assert.equal(await response.text(), '%PDF-saved-file');
 assert.equal(response.headers.get('Content-Type'), 'application/pdf');
 assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
 assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
 assert.deepEqual(x.downloads, [`${projectId}/private-signed-file`]);
 assert.deepEqual(x.reads.map(read => read.table), ['projects', 'sales_workflows']);
 const bad = fixture(); bad.tables.sales_workflows[0].evidence.path = `${otherId}/foreign-signed-file`;
 assert.equal((await bad.get('?download=signed')).status, 404); assert.deepEqual(bad.downloads, []);
 for (const path of [`${projectId}/../${otherId}/file`, `${projectId}/%2e%2e%2fforeign`, `${projectId}/..`, `${projectId}/`]) {
  const unsafe = fixture(); unsafe.tables.sales_workflows[0].evidence.path = path;
  assert.equal((await unsafe.get('?download=signed')).status, 404); assert.deepEqual(unsafe.downloads, []);
 }
 for (const evidence of [null, { method: 'hard_copy', signer: 'Signer' }]) {
  const empty = fixture(); empty.tables.sales_workflows[0].evidence = evidence;
  assert.equal((await empty.get('?download=signed')).status, 404); assert.deepEqual(empty.downloads, []);
 }
});

test('follow-up and measurement history retain authors, types and honest fallback dates', async () => {
 const x = fixture({ tables: { field_sync_receipts: [
  { operation_id: 'follow-up', project_id: projectId, actor_id: 'indoor', action: 'follow-up', recorded_at: timestamp, result: { project_notes: 'Called client', next_follow_up_at: timestamp, follow_up_type: 'call', follow_up_owner_name: 'Saved owner' } },
  { operation_id: 'delay', project_id: projectId, actor_id: 'measurer', action: 'delay-measurements', recorded_at: timestamp, result: { measurement_delay_note: 'Client postponed', measurement_delay_reason: 'client_delay' } },
 ] } });
 const data = await (await x.get('?section=follow-ups')).json();
 assert.equal(data.followUps.entries.length, 1);
 assert.equal(data.followUps.entries[0].note, 'Called client');
 assert.equal(data.followUps.entries[0].recordedBy, 'indoor.employee');
 assert.equal(data.followUps.entries[0].followUpType, 'call');
 const measurements = await (await x.get('?section=measurements')).json();
 assert.equal(measurements.project.measurement_attempts[0].note, 'Client postponed');
 assert.equal(measurements.project.measurement_attempts[0].recordedBy, 'Measurement employee');
 const fallback = await (await fixture().get('?section=follow-ups')).json();
 assert.equal(fallback.followUps.entries[0].action, 'snapshot');
 assert.equal(fallback.followUps.entries[0].recordedAt, null);
 assert.equal(fallback.followUps.entries[0].recordedBy, 'Not recorded');
});

test('history pagination preserves follow-ups beyond the first response page', async () => {
 const x = fixture({ tables: { field_sync_receipts: Array.from({ length: 1001 }, (_, index) => ({ operation_id: `follow-${String(index).padStart(4, '0')}`, project_id: projectId, actor_id: 'indoor', action: 'follow-up', recorded_at: timestamp, result: { project_notes: `Note ${index}` } })) } });
 const data = await (await x.get('?section=follow-ups')).json();
 assert.equal(data.followUps.entries.length, 1001);
 assert.equal(data.followUps.entries.at(-1).note, 'Note 1000');
});

for (const code of ['42P01', 'PGRST205']) test(`known legacy missing tables (${code}) produce explicit partial-data warnings`, async () => {
 const optional = ['client_contacts', 'sales_workflows', 'quotation_revisions', 'measurement_completion_reports', 'opening_size_history', 'field_sync_receipts'];
 const warnings = new Set();
 for (const section of ['overview', 'measurements', 'follow-ups', 'quotation', 'contract']) {
  const x = fixture({ errors: Object.fromEntries(optional.map(table => [table, { code, message: 'Missing table' }])) });
  const response = await x.get('?section='+section); const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.flow, null); assert.deepEqual(data.history, []); assert.deepEqual(data.measurementReports, []);
  data.warnings.forEach(warning => warnings.add(warning));
  assert.equal(data.signedCopyAvailable, false);
  assert.equal((await x.get('?download=signed')).status, 404);
  assert.equal((await x.get(`?report=${reportId}`)).status, 404);
 }
 assert.ok(warnings.size >= 6);

});

for (const table of ['projects', 'openings', 'clients', 'profiles', 'sales_workflows', 'quotation_revisions', 'field_sync_receipts', 'measurement_completion_reports']) test(`${table} database errors are surfaced instead of pretending data is absent`, async () => {
 const x = fixture({ errors: { [table]: { code: '42501', message: 'PRIVATE_DATABASE_ERROR' } } });
 const section = { openings: 'measurements', sales_workflows: 'contract', quotation_revisions: 'quotation', field_sync_receipts: 'follow-ups', measurement_completion_reports: 'measurements' }[table] ?? 'overview';
 const response = await x.get('?section='+section);
 assert.equal(response.status, 500);
 assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE_DATABASE_ERROR/);
});
