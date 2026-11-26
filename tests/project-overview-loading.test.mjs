import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, projectId, otherId, reportId } from './project-overview-fixture.mjs';
import { performanceFixture } from './project-overview-performance-fixture.mjs';

for (const [section, expected, omitted] of [
 ['overview', ['client_contacts'], ['openings','sales_workflows','quotation_revisions','contract_document_revisions','field_sync_receipts']],
 ['measurements', ['openings','measurement_completion_reports','opening_size_history','field_sync_receipts'], ['sales_workflows','quotation_revisions','contract_document_revisions','client_contacts']],
 ['follow-ups', ['field_sync_receipts'], ['openings','sales_workflows','quotation_revisions','contract_document_revisions','measurement_completion_reports']],
 ['quotation', ['sales_workflows','quotation_revisions'], ['openings','contract_document_revisions','field_sync_receipts','measurement_completion_reports']],
 ['contract', ['sales_workflows','quotation_revisions','contract_document_revisions'], ['openings','field_sync_receipts','measurement_completion_reports']],
]) test(section+' loads only its own dependencies after the project access guard', async () => {
 const x=performanceFixture(), before=structuredClone(x.tables);
 const response=await x.get('?section='+section), data=await response.json();
 assert.equal(response.status,200);assert.equal(data.section,section);
 assert.equal(x.reads[0].table,'projects');
 for(const table of expected)assert(x.reads.some(read=>read.table===table),'Expected '+table);
 for(const table of omitted)assert(!x.reads.some(read=>read.table===table),'Unselected '+table);
 assert.doesNotMatch(JSON.stringify(data),/A{1000}|B{1000}|source_contract|private-signed-file/);
 assert.deepEqual(x.tables,before,'All stored snapshots stay unchanged');
 if(section==='contract'||section==='quotation'){
  assert.equal(data.flow.quotation.total,9000000);
  assert.equal(data.flow.contract.quotation.total,8700000,'Frozen contract pricing remains independent');
  assert.equal(data.history.length,12);
 }
 if(section==='contract')assert.equal(data.documentRevisions.length,3);
});

test('summary first response omits heavy histories and photos while retaining client and project names',async()=>{
 const x=performanceFixture(),response=await x.get('?section=overview'),data=await response.json();
 assert.equal(data.section,'overview');assert.equal(data.project.project_name,'Project overview fixture');
 assert.equal(data.client.name,'Current client');assert.equal(data.project.registeredBy,'Original creator');
 assert.equal(x.reads.length,4);
 assert(Buffer.byteLength(JSON.stringify(data))<5000);
 assert.deepEqual(data.history,[]);assert.deepEqual(data.documentRevisions,[]);assert.deepEqual(data.openings,[]);
});

test('bare requests retain the complete legacy payload for already-open production clients',async()=>{
 const x=performanceFixture(),before=structuredClone(x.tables);
 const response=await x.get(''),data=await response.json();
 assert.equal(response.status,200);assert.equal(Object.hasOwn(data,'section'),false);
 assert.equal(data.openings.length,30);assert.equal(data.history.length,12);assert.equal(data.documentRevisions.length,3);
 assert.equal(data.openings[0].curtain_wall_capture.photo,before.openings[0].curtain_wall_capture.photo);
 assert.equal(data.openings[0].skylight_capture.photo,before.openings[0].skylight_capture.photo);
 assert.equal(data.flow.quotation.total,9000000);assert.equal(data.flow.contract.quotation.total,8700000);
 assert.equal(data.followUps.entries[0].action,'snapshot');assert.equal(data.measurementReports.length,1);
 assert.equal(x.reads.length,12);assert(Buffer.byteLength(JSON.stringify(data))>4000000);
 assert.doesNotMatch(JSON.stringify(data),/source_contract|private-signed-file|PRIVATE_REPORT_PHOTO/);
 assert.deepEqual(x.tables,before);
});

test('loader default remains compact and bare legacy reads still authorize before dependencies',async()=>{
 const x=performanceFixture();
 const server=x.load('src/lib/workflow/projectOverviewServer');
 const access=await server.projectOverviewAccess(projectId);
 const data=await server.loadProjectOverview(access);
 assert.equal(data.section,'overview');assert.equal(x.reads.length,4);assert.deepEqual(data.history,[]);
 const denied=fixture({authStatus:401});
 assert.equal((await denied.get('')).status,401);assert.deepEqual(denied.reads,[]);
});

test('measurement list retains dimensions and capture flags without selecting either capture column',async()=>{
 const x=performanceFixture(),data=await (await x.get('?section=measurements')).json();
 assert.equal(data.openings.length,30);
 assert.equal(data.openings[0].width,67);assert.equal(data.openings[0].height,39);
 assert.equal(data.openings[0].has_curtain_wall_capture,true);
 assert.equal(data.openings[0].has_skylight_capture,true);
 assert.equal(data.openings[0].curtain_wall_capture,null);
 assert.equal(data.openings[0].skylight_capture,null);
 const selected=x.reads.find(read=>read.table==='openings').fields.split(',');
 assert(!selected.includes('curtain_wall_capture'));assert(!selected.includes('skylight_capture'));
});

test('opening captures are available only on explicit authorized project and opening reads',async()=>{
 const x=performanceFixture(), opening=x.tables.openings[0], before=structuredClone(x.tables);
 const response=await x.get('?opening='+opening.id),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.curtain_wall_capture.note,'Synthetic capture note');
 assert.equal(data.curtain_wall_capture.photo,opening.curtain_wall_capture.photo);
 assert.equal(data.skylight_capture.photo,opening.skylight_capture.photo);
 assert.deepEqual(x.reads.map(read=>read.table),['projects','openings']);
 assert.deepEqual(x.tables,before);
 const foreign=fixture({tables:{openings:[{id:reportId,project_id:otherId,curtain_wall_capture:{photo:'FOREIGN'},skylight_capture:null}]}});
 assert.equal((await foreign.get('?opening='+reportId)).status,404);
 const denied=fixture({branch:'Rasafa'});
 assert.equal((await denied.get('?opening='+reportId)).status,404);
 assert.deepEqual(denied.reads.map(read=>read.table),['projects']);
});

test('invalid tab and capture selectors perform no related data reads',async()=>{
 for(const query of ['?section=unknown','?opening=invalid','?opening='+reportId+'&report='+otherId,'?opening='+reportId+'&download=signed']){
  const x=fixture();assert.equal((await x.get(query)).status,404);
  assert.deepEqual(x.reads.map(read=>read.table),['projects']);
 }
 assert.equal(projectId.length,36);
});

