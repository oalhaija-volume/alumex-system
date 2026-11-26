import assert from 'node:assert/strict';
import test from 'node:test';
import { actorId, projectListFixture, salespersonId, uuid } from './helpers/project-list-fixture.mjs';

test.beforeEach(context=>context.mock.timers.enable({apis:['Date'],now:new Date('2026-11-14T08:00:00Z')}));
test('full workspace stays backward compatible and summary cards omit visit receipts',async()=>{
 const full=projectListFixture(),summary=projectListFixture();const before=await full.get(),after=await summary.get('?view=projects');
 assert.equal(before.status,200);assert.equal(before.body.projects.length,103);assert.equal(before.body.projects[0].measurement_attempts.length,3);assert.equal('pagination' in before.body,false);
 assert.equal(after.status,200);assert.equal(after.body.projects.length,25);assert.equal(after.body.pagination.total,103);assert.equal(after.body.pagination.totalProjects,103);
 assert.equal(after.body.projects.some(row=>'measurement_attempts' in row),false);assert.equal(summary.metrics(after).receiptQueries,0);assert.equal(summary.metrics(after).fullProjectRows,25);
 assert.ok(summary.metrics(after).responseBytes<full.metrics(before).responseBytes/5);
 const expected=before.body.projects.map(row=>{const copy={...row};delete copy.measurement_attempts;return copy;}).slice(0,25);assert.deepEqual(after.body.projects,expected);
});
test('dashboard keeps all records for accurate filters but omits lazy details and visit-history reads',async()=>{
 const full=await projectListFixture().get();const fixture=projectListFixture();const response=await fixture.get('?view=dashboard');assert.equal(response.status,200);assert.equal(response.body.summary,true);assert.equal(response.body.projects.length,103);
 const expected=full.body.projects.map(row=>{const copy={...row};delete copy.project_notes;delete copy.readiness_note;delete copy.measurement_attempts;return copy;});assert.deepEqual(response.body.projects,expected);
 assert.equal(fixture.reads.some(read=>read.table==='field_sync_receipts'),false);assert.equal(fixture.reads.filter(read=>read.table==='projects').some(read=>read.columns.split(',').includes('project_notes')),false);
});
for(const role of ['Admin','Sales Director','Company Owner'])test(`${role}: summary totals keep existing cross-branch visibility`,async()=>{
 const response=await projectListFixture({role}).get('?view=projects&pageSize=100');assert.equal(response.body.pagination.totalProjects,103);assert.equal(new Set(response.body.projects.map(row=>row.branch)).size,4);
});
test('summary, dashboard and single-project reads authorize before querying records',async()=>{
 for(const query of ['?view=projects','?view=dashboard',`?projectId=${uuid(1)}`]){const fixture=projectListFixture({authorized:false});const response=await fixture.get(query);assert.equal(response.status,403);assert.deepEqual(fixture.reads,[]);}
});
test('server search scans every lean index page and resolves a project beyond the first thousand',async()=>{
 const fixture=projectListFixture({count:1003});const response=await fixture.get('?view=projects&q=PRJ-1003');assert.equal(response.body.pagination.total,1);assert.equal(response.body.pagination.totalProjects,1003);assert.deepEqual(response.body.projects.map(row=>row.id),[uuid(1003)]);assert.equal(fixture.metrics(response).fullProjectRows,1);assert.equal(fixture.metrics(response).receiptQueries,0);
});
for(const [branch,expected]of[['Karkh',[2,5]],['Najaf',[1,3,4]]])test(`legacy Najaf geography and Karkh office markers remain isolated for ${branch}`,async()=>{
 const fixture=projectListFixture({count:5,role:'Indoor Sales',branch});
 const locations=[{branch:'Governorates',governorate:'النجف'},{branch:'Governorates',governorate:'النجف',governorate_office:'Karkh'},{branch:'Governorates',governorate:'Najaf'},{branch:'Najaf',governorate:null},{branch:'Governorates',governorate:'البصرة'}];fixture.tables.projects.forEach((row,index)=>Object.assign(row,locations[index]));
 const response=await fixture.get('?view=projects');assert.deepEqual(new Set(response.body.projects.map(row=>row.id)),new Set(expected.map(uuid)));
});
test('stable registration ordering traverses equal timestamps without repeats or omissions',async()=>{
 const ids=[];for(let page=1;page<=5;page++){const response=await projectListFixture().get(`?view=projects&page=${page}`);ids.push(...response.body.projects.map(row=>row.id));}
 const full=await projectListFixture().get();assert.deepEqual(ids,full.body.projects.map(row=>row.id));assert.equal(new Set(ids).size,103);
 const oldest=await projectListFixture().get('?view=projects&order=oldest&pageSize=100');assert.deepEqual(oldest.body.projects.slice(0,4).map(row=>row.id),[1,2,3,4].map(uuid));
});
test('search spans all pages, normalizes Arabic digits and includes client identities',async()=>{
 for(const [query,expected]of[['PRJ-٠٠٧٨',uuid(78)],['عميل بغداد',uuid(78)],['٠٧٧٠٠٠٠٠٠٧٨',uuid(78)],['Project 78 Street 0',uuid(78)]]){
  const response=await projectListFixture().get(`?view=projects&q=${encodeURIComponent(query)}`);assert.equal(response.status,200);assert.deepEqual(response.body.projects.map(row=>row.id),[expected]);assert.equal(response.body.pagination.totalProjects,103);assert.equal(response.body.pagination.total,1);
 }
});
test('a project hash target selects its accessible page without changing global counts',async()=>{
 const response=await projectListFixture().get(`?view=projects&focus=${uuid(1)}`);assert.equal(response.body.pagination.page,4);assert.ok(response.body.projects.some(row=>row.id===uuid(1)));assert.equal(response.body.pagination.total,103);
 const hidden=await projectListFixture({role:'Indoor Sales',branch:'Rasafa'}).get(`?view=projects&focus=${uuid(1)}`);assert.equal(hidden.body.pagination.page,1);assert.ok(hidden.body.projects.every(row=>row.branch==='Rasafa'));
});
test('Outdoor origin counts cover all accessible records independently of search and selected page',async()=>{
 const full=await projectListFixture().get();const expected=full.body.projects.filter(row=>row.legacy_outdoor_sales_id===salespersonId||row.original_creator_role==='Outdoor Sales').length;
 const response=await projectListFixture().get(`?view=projects&salesperson=${salespersonId}&pageSize=10`);
 assert.equal(response.body.pagination.total,expected);assert.equal(response.body.outdoorOptions[0].count,expected);assert.equal(response.body.outdoorOptions[0].name,'Outdoor colleague');
 const searched=await projectListFixture().get('?view=projects&q=does-not-exist&page=99');assert.equal(searched.body.pagination.total,0);assert.equal(searched.body.pagination.page,1);assert.equal(searched.body.outdoorOptions[0].count,expected);
});
for(const role of ['Indoor Sales','Sales Manager','CEO'])for(const branch of ['Karkh','Rasafa','Najaf',null])test(`${role} ${branch}: pagination and scoped detail preserve branch privacy`,async()=>{
 const full=await projectListFixture({role,branch}).get();const allowed=full.body.projects.map(row=>row.id);
 const list=await projectListFixture({role,branch}).get('?view=projects&pageSize=100');assert.deepEqual(new Set(list.body.projects.map(row=>row.id)),new Set(allowed));assert.equal(list.body.pagination.totalProjects,allowed.length);
 for(const target of [uuid(1),uuid(2),uuid(3)]){const fixture=projectListFixture({role,branch});const response=await fixture.get(`?projectId=${target}`);assert.deepEqual(response.body.projects.map(row=>row.id),allowed.includes(target)?[target]:[]);assert.ok(fixture.reads.filter(read=>read.table==='projects').every(read=>read.rows<=1));assert.equal(response.body.actor.id,actorId);}
});
test('Outdoor scoped detail includes own historical visits but not unrelated projects',async()=>{
 const fixture=projectListFixture({role:'Outdoor Sales'});fixture.tables.projects.forEach(row=>{row.created_by=uuid(9999);row.assigned_outdoor_sales_id=uuid(9998);row.legacy_outdoor_sales_id=null;});fixture.tables.field_sync_receipts=fixture.tables.field_sync_receipts.filter(row=>row.project_id===uuid(1));
 const visible=await fixture.get(`?projectId=${uuid(1)}`);assert.equal(visible.body.projects[0].project_log_only,true);
 const denied=await fixture.get(`?projectId=${uuid(5)}`);assert.deepEqual(denied.body.projects,[]);
});
for(const search of ['?projectId=invalid','?projectId=','?view=other','?view=projects&page=-1','?view=projects&pageSize=101','?view=projects&salesperson=bad','?view=projects&order=bad',`?projectId=${uuid(1)}&view=projects`])test(`malformed options fail before business reads: ${search}`,async()=>{
 const fixture=projectListFixture();const response=await fixture.get(search);assert.equal(response.status,400);assert.deepEqual(fixture.reads,[]);
});
