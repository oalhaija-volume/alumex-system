import assert from 'node:assert/strict';
import test from 'node:test';
import {assembleRestInventory,createManifest,errorMetadata,fingerprint,formatVersion,parseArguments,publicError,quotationSummary,restInventory,revisionRequests,validateTarget,verifyManifest,verifyReadback,verifyRevision,verifySourceIds,verifySourceSnapshots} from '../scripts/revise-contract-opening-schedules.mjs';
import {migrationArguments,migrationState,transactionBody} from '../scripts/apply-contract-document-revisions-migration.mjs';
import postgres from '../artifacts/sql-tools/node_modules/postgres/src/index.js';
import {types as postgresTypes} from '../artifacts/sql-tools/node_modules/postgres/src/types.js';

const actor='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222';
function source(signed=true){
 const lines=[[67,39],[57,53],[93,50],[164,73]].map(([width,height],index)=>{
  const area=width*height/10000,quantity=Math.max(area,1);
  return {opening:{id:`opening-${index}`,width,height,quantity:1},area,system:{unit:'sqm',quantity,rate:300000,total:Math.round(quantity*300000)},extras:[],total:Math.round(quantity*300000)};
 });
 const contract={number:'RA-PRJ-202611-0262-4',createdAt:'2026-11-26T08:00:00Z',createdBy:'saved-author',approvedAt:'2026-11-26T09:00:00Z',
  client:{name:'PRIVATE CLIENT'},project:{address:'PRIVATE SITE'},terms:[{title:'Saved terms',text:'PRIVATE TERM'}],
  quotation:{lines,total:1259160,currency:'IQD'},agreement2027:{total:1259160,amountInWords:'Saved words',paymentSchedule:[{percent:100,amount:1259160}],readiness:{notes:['Saved readiness']},openingSpecifications:[{openingId:'opening-0',notes:'Saved detail'}],
   fields:{ownerName:'PRIVATE OWNER',companyRepresentativeSignature:'PRIVATE COMPANY SIGNATURE',companyRepresentativeDate:'2026-11-26',approvals:{salesEngineer:{name:'PRIVATE ENGINEER',signature:'PRIVATE STAFF SIGNATURE',date:'2026-11-26'}}}}};
 return {flow:{project_id:projectId,revision:8,stage:signed?'signed':'contract',quotation:structuredClone(contract.quotation),contract,signed_at:signed?'2026-11-26T09:00:00+00:00':null,evidence:signed?{method:'upload',path:'PRIVATE SIGNED FILE'}:null},project:{id:projectId,project_number:'PRJ-202611-0262',sales_status:signed?'transferred_to_operations':'contract_generated'},history:[{version:3,contract:{number:'SAVED HISTORICAL CONTRACT'}}]};
}
function revision(original){
 const contract=structuredClone(original.flow.contract);
 contract.number+='-R1';contract.createdAt='2026-11-26T10:00:00Z';contract.createdBy=actor;delete contract.approvedAt;
 const fields=contract.agreement2027.fields;fields.companyRepresentativeSignature='';fields.companyRepresentativeDate='';
 for(const approval of Object.values(fields.approvals)){approval.signature='';approval.date='';}
 return {id:'33333333-3333-4333-8333-333333333333',project_id:projectId,source_workflow_revision:8,format_version:formatVersion,document_revision:1,revision:1,status:'pending_approval',
  evidence:null,signed_at:null,approved_at:null,approved_by:null,source_contract:structuredClone(original.flow.contract),source_signed_at:original.flow.signed_at,contract};
}

test('the batch defaults to dry-run and requires an explicit reviewed inventory and Admin identity for apply',()=>{
 assert.deepEqual(parseArguments([]),{apply:false,help:false});
 assert.throws(()=>parseArguments(['--apply']),/requires/);
 assert.throws(()=>parseArguments(['--apply',`--actor=${actor}`]),/requires/);
 assert.throws(()=>parseArguments(['--apply','--actor=not-a-uuid','--manifest=artifacts/manifest.json']),/requires/);
 assert.throws(()=>parseArguments(['--manifest=artifacts/manifest.json']),/require --apply/);
 assert.throws(()=>parseArguments(['--apply=false']),/Flags/);
 assert.throws(()=>parseArguments(['--help','--help']),/Duplicate/);
 assert.throws(()=>parseArguments(['--unknown']),/Unknown/);
 const options=parseArguments(['--apply',`--actor=${actor}`,'--manifest=artifacts/reviewed/manifest.json']);
 assert.equal(options.apply,true);assert.equal(options.actor,actor);assert.equal(options.manifest,'artifacts/reviewed/manifest.json');
});

test('database configuration must identify the same Supabase project, including pooler identity',()=>{
 const config={NEXT_PUBLIC_SUPABASE_URL:'https://alumex-ref.supabase.co',DATABASE_URL:'postgresql://postgres:secret@db.alumex-ref.supabase.co:5432/postgres'};
 assert.doesNotThrow(()=>validateTarget(config));
 assert.doesNotThrow(()=>validateTarget({...config,DATABASE_URL:'postgresql://postgres.alumex-ref:secret@aws-0.pooler.supabase.com:6543/postgres'}));
 for(const DATABASE_URL of ['postgresql://postgres:secret@db.other-ref.supabase.co/postgres','postgresql://postgres.other-ref:secret@aws-0.pooler.supabase.com/postgres','postgresql://postgres.alumex-ref:secret@db.alumex-ref.supabase.co.attacker.invalid/postgres'])assert.throws(()=>validateTarget({...config,DATABASE_URL}),/does not match/);
 assert.throws(()=>validateTarget({...config,NEXT_PUBLIC_SUPABASE_URL:'http://alumex-ref.supabase.co'}),/invalid/);
 assert.equal(publicError(new Error('postgresql://user:PRIVATE-PASSWORD@host with PRIVATE TOKEN')).includes('PRIVATE'),false,'Unexpected failures cannot disclose credentials or source records');
});

test('manifest reconciles saved billing quantities and fingerprints without exposing client or signature details',()=>{
 const signed=source(),unsigned=source(false);unsigned.project.id='44444444-4444-4444-8444-444444444444';unsigned.flow.project_id=unsigned.project.id;
 const sources=[signed,unsigned],before=structuredClone(sources),manifest=createManifest(sources,'2026-11-26T10:00:00Z');
 assert.equal(manifest.sourceCount,2);assert.equal(manifest.signedCount,1);assert.equal(manifest.unsignedCount,1);
 assert.deepEqual(manifest.rows[0].summary,{openingRows:4,openingCount:4,billableArea:4.1972,total:1259160,currency:'IQD'});
 assert.equal(JSON.stringify(manifest).includes('PRIVATE'),false);
 assert.equal(manifest.originalsSha256,fingerprint(sources));assert.equal(fingerprint({a:1,b:2}),fingerprint({b:2,a:1}));
 assert.doesNotThrow(()=>verifyManifest(manifest,sources));assert.deepEqual(sources,before);
});

test('a reviewed inventory becomes invalid if any workflow, project, history or inventory membership changes',()=>{
 const saved=source(),manifest=createManifest([saved]);
 const changes=[value=>{value.flow.contract.quotation.lines[0].system.rate++;},value=>{value.flow.signed_at=null;},value=>{value.project.sales_status='cancelled';},value=>{value.history.push({version:4});}];
 for(const change of changes){const altered=structuredClone(saved);change(altered);assert.throws(()=>verifyManifest(manifest,[altered]),/no longer matches/);}
 assert.throws(()=>verifyManifest(manifest,[]),/no longer matches/);
 assert.throws(()=>verifyManifest(manifest,[saved,source(false)]),/no longer matches/);
});

test('cached backups require the complete locked inventory and exact server equality for every source component',()=>{
 const sources=[source()],record={project_id:projectId,flow_matches:true,project_matches:true,history_matches:true};
 assert.doesNotThrow(()=>verifySourceIds([{project_id:projectId}],sources));
 assert.doesNotThrow(()=>verifySourceSnapshots([record],sources));
 for(const key of ['flow_matches','project_matches','history_matches']){
  assert.throws(()=>verifySourceSnapshots([{...record,[key]:false}],sources),/differs from the reviewed backup/);
  assert.throws(()=>verifySourceSnapshots([{...record,[key]:null}],sources),/differs from the reviewed backup/);
 }
 assert.throws(()=>verifySourceIds([],sources),/complete current contract inventory/);
 assert.throws(()=>verifySourceIds([{project_id:actor}],sources),/complete current contract inventory/);
 assert.throws(()=>verifySourceIds([{project_id:projectId},{project_id:projectId}],sources),/complete current contract inventory/);
 const backup=structuredClone(sources),manifest=createManifest(backup);backup[0].flow.contract.quotation.total++;
 assert.throws(()=>verifyManifest(manifest,backup),/no longer matches/,'A locally altered backup fails before any database transaction');
});

test('REST inventory assembly excludes archived projects and null contracts while preserving exact snapshots and ordered history',()=>{
 const active=source(),archived=source();archived.project.id=actor;archived.flow.project_id=actor;archived.project.archived_at='2026-11-26T10:00:00Z';
 const flows=[archived.flow,{...active.flow,project_id:'44444444-4444-4444-8444-444444444444',contract:null},active.flow];
 const projects=[archived.project,active.project],history=[{project_id:projectId,version:3},{project_id:actor,version:1},{project_id:projectId,version:1}],before=structuredClone({flows,projects,history});
 const rows=assembleRestInventory(flows,projects,history);
 assert.equal(rows.length,1);assert.deepEqual(rows[0].flow,active.flow);assert.deepEqual(rows[0].project,active.project);
 assert.deepEqual(rows[0].history,[history[2],history[0]]);assert.deepEqual({flows,projects,history},before);
});

test('REST inventory paginates every table and scopes project and history requests to at most 100 IDs',async()=>{
 const id=index=>`${(index+1).toString(16).padStart(8,'0')}-0000-4000-8000-000000000000`;
 const flows=Array.from({length:1001},(_,index)=>({project_id:id(index),contract:{number:`saved-${index}`}}));
 const projects=flows.map(flow=>({id:flow.project_id,archived_at:null}));
 const history=Array.from({length:1001},(_,index)=>({project_id:id(0),version:index+1})),calls=[];
 const config={NEXT_PUBLIC_SUPABASE_URL:'https://alumex-ref.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE REST KEY'};
 const rows=await restInventory(config,async(url,options)=>{
  const table=url.pathname.split('/').at(-1),offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit'));
  assert.equal(url.searchParams.get('select'),'*');assert.equal(limit,1000);assert.equal(options.body,undefined);assert.equal(options.method,undefined);
  assert.equal(options.headers.Authorization,'Bearer PRIVATE REST KEY');assert.ok(options.signal instanceof AbortSignal);
  let data;
  if(table==='sales_workflows'){assert.equal(url.searchParams.get('contract'),'not.is.null');assert.equal(url.searchParams.get('order'),'project_id.asc');data=flows;}
  else{
   const ids=url.searchParams.get(table==='projects'?'id':'project_id').slice(4,-1).split(',');assert.ok(ids.length<=100);
   if(table==='projects'){assert.equal(url.searchParams.get('archived_at'),'is.null');assert.equal(url.searchParams.get('order'),'id.asc');data=projects.filter(row=>ids.includes(row.id));}
   else{assert.equal(table,'quotation_revisions');assert.equal(url.searchParams.get('order'),'project_id.asc,version.asc');data=history.filter(row=>ids.includes(row.project_id));}
  }
  calls.push({table,offset});return {ok:true,json:async()=>data.slice(offset,offset+limit)};
 });
 assert.equal(rows.length,1001);assert.equal(rows[0].history.length,1001);assert.equal(rows[0].history.at(-1).version,1001);
 assert.equal(calls.filter(call=>call.table==='sales_workflows').length,2);
 assert.equal(calls.filter(call=>call.table==='projects').length,11);
 assert.equal(calls.filter(call=>call.table==='quotation_revisions'&&call.offset===1000).length,1);
});

test('REST inventory failures never reveal service credentials, response bodies or client data',async()=>{
 const config={NEXT_PUBLIC_SUPABASE_URL:'https://alumex-ref.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE TOKEN'};
 for(const fetcher of [async()=>{throw new Error('PRIVATE TOKEN and PRIVATE CLIENT');},async()=>({ok:false,json:async()=>({message:'PRIVATE TOKEN'})}),async()=>({ok:true,json:async()=>({error:'PRIVATE CLIENT'})})]){
  await assert.rejects(restInventory(config,fetcher),error=>!error.message.includes('PRIVATE')&&/inventory/.test(error.message));
 }
});

test('billable summaries count saved repetitions and eligible standalone sqm once without recalculating measurements',()=>{
 const contract=source().flow.contract;contract.quotation.lines=[{opening:{width:20,height:20,quantity:4},area:.16,system:{unit:'sqm',quantity:4}},{opening:{quantity:2},system:{unit:'item',quantity:2}}];
 contract.quotation.additionalItems=[{unit:'sqm',quantity:2},{unit:'sqm',quantity:99,projectAddon:true},{unit:'item',quantity:50}];
 assert.deepEqual(quotationSummary(contract),{openingRows:2,openingCount:6,billableArea:6,total:1259160,currency:'IQD'});
 contract.quotation.lines[0].system.quantity=.16;
 assert.equal(quotationSummary(contract).billableArea,2.16,'Historical saved quantities cannot be replaced by current minimum rules');
 contract.quotation.lines[0].system.quantity=NaN;assert.throws(()=>quotationSummary(contract),/Invalid saved billable/);
});

test('revision verification accepts only an unsigned approval-pending copy retaining its exact saved contract content',()=>{
 for(const signed of [true,false]){
  const saved=source(signed),row=revision(saved),before=structuredClone({saved,row});
  assert.doesNotThrow(()=>verifyRevision(row,saved,actor));assert.deepEqual({saved,row},before);
 }
 assert.throws(()=>verifyRevision(1,source(),actor),/Revision identity/,'A scalar revision counter is not a complete database readback record');
});

test('revision verification rejects changed prices, terms, payments, product details and client or project data',()=>{
 const saved=source();
 const changes=[row=>{row.contract.quotation.lines[0].system.quantity++;},row=>{row.contract.terms[0].text='Changed';},row=>{row.contract.agreement2027.paymentSchedule[0].amount++;},row=>{row.contract.agreement2027.openingSpecifications[0].notes='Changed';},row=>{row.contract.client.name='Changed';},row=>{row.contract.project.address='Changed';},row=>{row.contract.agreement2027.fields.approvals.salesEngineer.name='Changed';}];
 for(const change of changes){const row=revision(saved);change(row);assert.throws(()=>verifyRevision(row,saved,actor),/changed saved contract content/);}
});

test('revision verification rejects copied approval, signing evidence, signatures and staff signing dates',()=>{
 const saved=source();
 const changes=[row=>{row.status='approved';},row=>{row.evidence={signature:'OLD SIGNATURE'};},row=>{row.signed_at=saved.flow.signed_at;},row=>{row.approved_by=actor;},row=>{row.contract.approvedAt='2026-11-26';},row=>{row.contract.agreement2027.fields.companyRepresentativeSignature='OLD SIGNATURE';},row=>{row.contract.agreement2027.fields.approvals.salesEngineer.date='2026-11-26';}];
 for(const change of changes){const row=revision(saved);change(row);assert.throws(()=>verifyRevision(row,saved,actor));}
 const row=revision(saved);row.source_contract.quotation.total++;
 assert.throws(()=>verifyRevision(row,saved,actor),/source snapshot changed/);
});

test('bulk readback requires server-confirmed exact source equality before checking every revised document',()=>{
 const saved=source(),value=revision(saved);delete value.source_contract;
 const records=[{value,source_matches:true}],before=structuredClone({saved,records});
 assert.equal(verifyReadback(records,[saved],actor)[0].id,value.id);
 assert.deepEqual({saved,records},before,'Readback checks cannot mutate either the saved source or database response');
 assert.throws(()=>verifyReadback([{value,source_matches:false}],[saved],actor),/source snapshot does not match/);
 assert.throws(()=>verifyReadback([],[saved],actor),/does not cover/);
 const changed=structuredClone(value);changed.contract.quotation.total++;
 assert.throws(()=>verifyReadback([{value:changed,source_matches:true}],[saved],actor),/changed saved contract content/);
 const second=source();second.project.id='44444444-4444-4444-8444-444444444444';second.flow.project_id=second.project.id;
 assert.throws(()=>verifyReadback([...records,...records],[saved,second],actor),/source snapshot does not match/,'Duplicate results cannot disguise a missing contract');
});

test('the actual PostgreSQL driver binds bulk revision metadata as a JSON array rather than a JSON string',async()=>{
 // Constructing a typed parameter opens no database connection.
 const sql=postgres({host:'127.0.0.1',port:1,username:'driver_test',database:'driver_test',password:'driver_test',fetch_types:false});
 try{
  const parameter=revisionRequests(sql,[source()]);
  assert.equal(parameter.type,3802);
  assert.ok(Array.isArray(parameter.value));
  const encoded=postgresTypes.json.serialize(parameter.value);
  assert.deepEqual(JSON.parse(encoded),[{project_id:projectId,source_revision:8}]);
  assert.equal(Array.isArray(JSON.parse(encoded)),true,'jsonb_to_recordset must receive an array, never a double-encoded string');
 }finally{await sql.end();}
});

test('failure diagnostics retain safe database metadata without printing query values or credentials',()=>{
 const failure=Object.assign(new Error('PRIVATE PASSWORD in SQL'),{code:'23514',constraint_name:'contract_revision_content_check',routine:'ExecConstraints',detail:'PRIVATE SOURCE ROW',query:'PRIVATE SQL',token:'PRIVATE TOKEN'});
 assert.deepEqual(errorMetadata(failure),{code:'23514',constraint:'contract_revision_content_check',routine:'ExecConstraints',type:'Error'});
 assert.equal(JSON.stringify(errorMetadata(failure)).includes('PRIVATE'),false);
 assert.deepEqual(errorMetadata({code:'postgres://PRIVATE',routine:'private values with spaces',constraint_name:'invalid/path'}),{});
});

test('migration application requires a reviewed hash and SQL cannot close its rehearsal transaction',()=>{
 assert.deepEqual(migrationArguments([]),{apply:false});
 assert.throws(()=>migrationArguments(['--apply']),/requires the reviewed/);
 assert.throws(()=>migrationArguments(['--apply','--sha=invalid']),/64 lowercase/);
 assert.equal(migrationArguments(['--apply',`--sha=${'a'.repeat(64)}`]).apply,true);
 assert.equal(transactionBody('begin;\ncreate table reviewed(id uuid);\ncommit;'),'create table reviewed(id uuid);');
 assert.equal(transactionBody('-- Fixture only\nbegin;\ndo $$ begin null; end; $$;\nrollback;','rollback'),'do $$ begin null; end; $$;');
 assert.throws(()=>transactionBody('begin;\ncommit;\nselect 1;\ncommit;'),/containing transaction/);
 assert.throws(()=>transactionBody('select 1;'),/expected outer transaction/);
});

test('migration no-op requires an exact ledger match and rejects orphaned schema or unexpected history',()=>{
 const body='create table reviewed(id uuid);',ledger={name:'contract_document_revisions',statements:[body]};
 assert.equal(migrationState(undefined,false,body),'fresh');
 assert.equal(migrationState(ledger,true,body),'existing');
 assert.throws(()=>migrationState(undefined,true,body),/unrecorded/);
 assert.throws(()=>migrationState(ledger,false,body),/differs/);
 assert.throws(()=>migrationState({...ledger,name:'other'},true,body),/differs/);
 assert.throws(()=>migrationState({...ledger,statements:['unreviewed SQL']},true,body),/differs/);
});
