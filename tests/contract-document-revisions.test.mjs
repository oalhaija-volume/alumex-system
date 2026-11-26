import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const projectId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
const revisionId='33333333-3333-4333-8333-333333333333';
const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const timestamp='2026-11-26T08:00:00Z';
const png='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(600)]).toString('base64');

function fixture({role='Admin',branch='Karkh',projectBranch='Karkh',authStatus=null,error=null,rpcError=null,targetProject=projectId}={}){
 const reads=[],calls=[];
 const quote={lines:[],total:1259160,currency:'IQD',createdAt:timestamp,preparedBy:actorId};
 const row={id:revisionId,project_id:targetProject,document_revision:1,source_workflow_revision:8,source_signed_at:timestamp,source_contract:{number:'CT-ORIGINAL',path:'PRIVATE_SOURCE_PATH'},contract:{number:'CT-ORIGINAL-R1',quotation:quote,terms:[{title:'Saved terms',text:'Original payment and delivery terms'}],client:{name:'Saved client',mobile:null,client_type:'individual'},project:{name:'Saved project',number:'PRJ-1',address:null},createdAt:timestamp,extraEvidence:{path:'PRIVATE_NESTED_PATH'}},status:'pending_approval',revision:1,format_version:'billable-opening-schedule-v1',created_by:actorId,created_at:timestamp,approved_by:null,approved_at:null,signed_at:null,evidence:null};
 const project={id:projectId,branch:projectBranch,governorate:null,governorate_office:null,archived_at:null};
 const admin={
  from(table){
   assert.ok(['projects','contract_document_revisions'].includes(table),`Unexpected table ${table}`);
   const predicates=[];let fields='*',single=false;
   const query={
    select(value){fields=value;return this;},eq(key,value){predicates.push(row=>row[key]===value);return this;},
    order(){return this;},range(){return this;},maybeSingle(){single=true;return this;},
    then(resolve,reject){const data=(table==='projects'?[project]:[row]).filter(row=>predicates.every(p=>p(row))).map(value=>fields==='*'?{...value}:Object.fromEntries(fields.split(',').map(key=>[key,value[key]])));
     reads.push({table,fields,rows:data});return Promise.resolve({data:error&&table==='contract_document_revisions'?null:single?data[0]??null:data,error:table==='contract_document_revisions'?error:null}).then(resolve,reject);},
   };return query;
  },
  async rpc(name,args){calls.push({name,args});return {data:rpcError?null:row,error:rpcError};},
 };
 const cache=new Map();
 function load(path){
  if(cache.has(path))return cache.get(path);
  const exports={};cache.set(path,exports);
  const code=ts.transpileModule(readFileSync(new URL(`../${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',code)(name=>{
   if(name==='server-only')return {};
   if(name==='next/server')return {NextResponse:{json:(body,options)=>Response.json(body,options)}};
   if(name==='@/lib/auth/adminServer')return {requireRole:async allowed=>authStatus?{ok:false,status:authStatus,error:'Authentication denied.'}:!allowed.includes(role)?{ok:false,status:403,error:'Access denied.'}:{ok:true,user:{id:actorId},role,profile:{branch}}};
   if(name==='@/lib/supabase/admin')return {createAdminClient:()=>admin};
   if(name==='@/lib/supabase/config')return {hasSupabaseServiceRoleKey:()=>true};
   if(name.startsWith('@/'))return load(`src/${name.slice(2)}`);
   if(name.startsWith('./'))return load(path.slice(0,path.lastIndexOf('/'))+'/'+name.slice(2));
   throw Error(`Unexpected dependency ${name}`);
  },exports);return exports;
 }
 const route=load('src/app/api/projects/[projectId]/contract-revisions/route');
 return {row,reads,calls,load,get:()=>route.GET(new Request(`http://localhost:3003/api/projects/${projectId}/contract-revisions`),{params:Promise.resolve({projectId})}),post:body=>route.POST(new Request(`http://localhost:3003/api/projects/${projectId}/contract-revisions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({projectId})})};
}

test('Branch Manager can read revised documents without original/private storage snapshots',async()=>{
 const x=fixture({role:'Branch Manager'}),before=structuredClone(x.row);
 const response=await x.get(),data=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.equal(data.documentRevisions[0].contract.number,'CT-ORIGINAL-R1');
 assert.equal(data.documentRevisions[0].contract.quotation.total,1259160);
 assert.equal(data.documentRevisions[0].source_signed_at,timestamp);
 assert.equal(data.documentRevisions[0].status,'pending_approval');
 assert.equal('source_contract'in data.documentRevisions[0],false);
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);
 assert.ok(x.reads.find(read=>read.table==='contract_document_revisions').fields.split(',').every(key=>key!=='source_contract'));
 assert.deepEqual(x.row,before);assert.deepEqual(x.calls,[]);
});

for(const role of ['Indoor Sales','Sales Manager'])test(`${role} can read same-branch corrected contract revisions without private sources`,async()=>{
 const x=fixture({role});x.row.revision_reason='client_name_correction';x.row.superseded_at=null;
 const response=await x.get(),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.documentRevisions[0].revision_reason,'client_name_correction');
 assert.equal(data.documentRevisions[0].superseded_at,null);assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);
 const foreign=fixture({role,branch:'Rasafa'});assert.equal((await foreign.get()).status,404);
 assert.equal(foreign.reads.some(read=>read.table==='contract_document_revisions'),false);
});

for(const action of ['approve','sign'])test(`a superseded name revision cannot ${action} even with valid confirmation`,async()=>{
 const x=fixture();x.row.superseded_at=timestamp;
 const response=await x.post({action,id:revisionId,revision:1,confirmed:true,evidence:{method:'hard_copy',signer:'Client',confirmed:true}});
 assert.equal(response.status,409);assert.match((await response.json()).error,/latest contract revision/);assert.deepEqual(x.calls,[]);
});

for(const role of ['Branch Manager','Operations Manager','Outdoor Sales'])test(`${role} cannot create, approve or sign revised contracts`,async()=>{
 for(const action of ['create','approve','sign']){
  const x=fixture({role});const response=await x.post({action,id:revisionId,revision:1,sourceRevision:8,confirmed:true,evidence:{method:'hard_copy',signer:'Client',confirmed:true}});
  assert.equal(response.status,403);assert.deepEqual(x.calls,[]);assert.deepEqual(x.reads,[]);
 }
});

test('only Admin can create revised copies while commercial employees can record approval',async()=>{
 const forbidden=fixture({role:'Indoor Sales'});assert.equal((await forbidden.post({action:'create',sourceRevision:8})).status,403);assert.deepEqual(forbidden.calls,[]);
 const admin=fixture();const response=await admin.post({action:'create',sourceRevision:8});
 assert.equal(response.status,200);assert.deepEqual(admin.calls,[{name:'create_contract_document_revision',args:{p_project:projectId,p_source_revision:8,p_actor:actorId}}]);
 assert.equal('source_contract'in(await response.json()).documentRevision,false);
 for(const role of ['Indoor Sales','Sales Manager','Sales Director','Company Owner']){
  const x=fixture({role});assert.equal((await x.post({action:'approve',id:revisionId,revision:1,confirmed:true})).status,200);
  assert.deepEqual(x.calls,[{name:'approve_contract_document_revision',args:{p_id:revisionId,p_revision:1,p_actor:actorId}}]);
 }
});

test('foreign-branch readers and approvers are rejected before revision or RPC access',async()=>{
 const reader=fixture({role:'Branch Manager',branch:'Rasafa'});
 assert.equal((await reader.get()).status,404);assert.deepEqual(reader.reads.map(read=>read.table),['projects']);
 const writer=fixture({role:'Indoor Sales',branch:'Rasafa'});
 assert.equal((await writer.post({action:'approve',id:revisionId,revision:1,confirmed:true})).status,404);
 assert.deepEqual(writer.reads.map(read=>read.table),['projects']);assert.deepEqual(writer.calls,[]);
});

test('a revision id from another project cannot be approved through an authorized project URL',async()=>{
 const x=fixture({targetProject:otherId});
 assert.equal((await x.post({action:'approve',id:revisionId,revision:1,confirmed:true})).status,404);assert.deepEqual(x.calls,[]);
});

for(const confirmed of [undefined,false,'true',null])test(`approval requires explicit true confirmation (${String(confirmed)})`,async()=>{
 const x=fixture();assert.equal((await x.post({action:'approve',id:revisionId,revision:1,confirmed})).status,400);assert.deepEqual(x.calls,[]);
});

test('signing requires fresh consent and a supported signer/method; no original evidence is reused',async()=>{
 for(const evidence of [null,{method:'hard_copy',signer:'Client'},{method:'hard_copy',signer:' ',confirmed:true},{method:'upload',signer:'Client',confirmed:true},{method:'digital',signer:'Client',confirmed:true,signature:'forged'}, {method:'digital',signer:'Client',confirmed:true,signature:'data:image/png;base64,'+Buffer.alloc(600).toString('base64')}]){
  const x=fixture();assert.equal((await x.post({action:'sign',id:revisionId,revision:2,evidence})).status,400);assert.deepEqual(x.calls,[]);
 }
 for(const method of ['hard_copy','digital']){
  const x=fixture();const evidence={method,signer:' New signer ',confirmed:true,...(method==='digital'?{signature:png}:{}),path:'DO_NOT_FORWARD',recordedBy:'SPOOFED_ACTOR'};
  assert.equal((await x.post({action:'sign',id:revisionId,revision:2,evidence})).status,200);
  assert.equal(x.calls[0].name,'sign_contract_document_revision');
  assert.deepEqual(x.calls[0].args,{p_id:revisionId,p_revision:2,p_actor:actorId,p_evidence:{method,signer:'New signer',confirmed:true,...(method==='digital'?{signature:png}:{})}});
 }
});

for(const body of [{action:'create',sourceRevision:0},{action:'create',sourceRevision:'8'},{action:'approve',id:'invalid',revision:1,confirmed:true},{action:'approve',id:revisionId,revision:'1',confirmed:true},{action:'unsupported'}])test(`malformed action is rejected: ${JSON.stringify(body)}`,async()=>{
 const x=fixture();assert.equal((await x.post(body)).status,400);assert.deepEqual(x.calls,[]);
});

for(const code of ['42P01','PGRST205'])test(`optional missing revision table ${code} does not hide existing project documents`,async()=>{
 const x=fixture({error:{code}});const response=await x.get();assert.equal(response.status,200);assert.deepEqual(await response.json(),{documentRevisions:[]});
});

for(const [code,status]of [['40001',409],['23505',409],['42501',403],['22023',409],['PGRST202',503],['XX000',500]])test(`RPC failure ${code} has a safe response and preserves original documents`,async()=>{
 const x=fixture({rpcError:{code,message:'PRIVATE_DATABASE_MESSAGE'}}),before=structuredClone(x.row);
 const response=await x.post({action:'approve',id:revisionId,revision:1,confirmed:true});
 assert.equal(response.status,status);assert.doesNotMatch(JSON.stringify(await response.json()),/PRIVATE_DATABASE_MESSAGE/);assert.deepEqual(x.row,before);
});
