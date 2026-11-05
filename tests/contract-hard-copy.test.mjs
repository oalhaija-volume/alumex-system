import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path,dependencies={}) {
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',source)(name=>{
  assert.ok(name in dependencies,`Unexpected dependency: ${name}`);
  return dependencies[name];
 },exports);
 return exports;
}

const projectId='153aa1d1-b650-40b1-8fc1-d1bd45ab224f';
const project={id:projectId,project_number:'PRJ-202611-0008',sales_status:'contract_generated',branch:'Karkh',additional_openings_state:null};
const quotation={version:2,lines:[],additionalItems:[],total:25710534,currency:'IQD',preparedBy:'quote-creator',createdAt:'2026-11-01T09:00:00Z'};
const contract={number:'CT-PRJ-202611-0008-3',template:'commercial',quotation,terms:[]};
const savedFlow={project_id:projectId,revision:4,stage:'contract',quotation,contract,evidence:null,signed_at:null,accepted_at:null,accepted_by:null};
const requestBody={action:'sign',revision:4,method:'hard_copy',signer:'Client Name',consent:true};

function setup({flow=savedFlow,projectPatch={},denied=null,rpcError=null,rpcThrows=null,readError=null}={}) {
 const reads=[],calls=[];
 let storageReads=0;
 const stored=structuredClone(flow),site={...project,...projectPatch};
 const before=structuredClone({flow:stored,project:site});
 const signed=flow?{...flow,revision:flow.revision+1,stage:'signed',evidence:{method:'hard_copy',signer:'Client Name',recordedBy:'recording-employee'},signed_at:'2026-11-05T09:00:00Z'}:null;
 const admin={
  from(table){
   reads.push(table);assert.equal(table,'sales_workflows','Recording a signed hard copy must not reload or rewrite quotation prices, employee data or client details');
   return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:stored,error:readError})};
  },
  async rpc(name,args){calls.push({name,args});if(rpcThrows)throw rpcThrows;return {data:signed,error:rpcError};},
  get storage(){storageReads++;throw new Error('Hard-copy confirmation must not access file storage.');},
 };
 const route=load('../src/app/api/sales-flow/[projectId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/contracts/uploadedTerms':{},
  '@/lib/workflow/access':{salesProject:async(id,scope)=>{
   assert.equal(id,projectId);assert.equal(scope,'commercial');
   return denied?{response:denied}:{admin,auth:{role:'Indoor Sales',user:{id:'recording-employee'}},project:site};
  }},
  '@/lib/workflow/pricing':{},'@/lib/workflow/quotationOpenings':{},
 });
 const submitRaw=body=>route.POST(new Request('http://localhost:3003/api/sales-flow/'+projectId,{
  method:'POST',headers:{'Content-Type':'application/json'},body,
 }),{params:Promise.resolve({projectId})});
 return {submit:body=>submitRaw(JSON.stringify({...requestBody,...body})),submitRaw,reads,calls,stored,site,before,signed,get storageReads(){return storageReads;}};
}

test('Indoor Sales records a signed hard copy without a signature image or uploaded file',async()=>{
 const x=setup();const response=await x.submit({signer:'  Client Name  '});
 assert.equal(response.status,200);assert.equal(response.headers['Cache-Control'],'no-store');
 assert.deepEqual(x.calls,[{name:'advance_sales_flow',args:{p_project:projectId,p_action:'sign',p_revision:4,p_payload:{method:'hard_copy',signer:'Client Name',confirmed:true},p_actor:'recording-employee'}}]);
 assert.deepEqual(response.body,{flow:x.signed});
 assert.equal(x.storageReads,0);assert.deepEqual(x.reads,['sales_workflows']);
 assert.deepEqual({flow:x.stored,project:x.site},x.before,'Only the atomic workflow transition may change the saved contract or project');
});

test('hard-copy confirmation excludes forged signature, path, employee, timestamp and quotation fields',async()=>{
 const x=setup();const response=await x.submit({signature:'forged-signature',path:'other-project/private.pdf',fileName:'forged.pdf',recordedBy:'another-employee',signed_at:'2000-01-01',recordedAt:'2000-01-01',p_actor:'another-employee',contract:{number:'FORGED'},quotation:{total:1}});
 assert.equal(response.status,200);
 assert.deepEqual(x.calls[0].args.p_payload,{method:'hard_copy',signer:'Client Name',confirmed:true});
 assert.equal(x.calls[0].args.p_actor,'recording-employee');assert.equal(x.storageReads,0);
});

for(const signer of [undefined,null,'','   ',151,'x'.repeat(151),{},[]])test(`hard-copy signing requires a valid client name (${JSON.stringify(signer)})`,async()=>{
 const x=setup();const response=await x.submit({signer});
 assert.equal(response.status,400);assert.match(response.body.error,/signer|name/i);assert.deepEqual(x.calls,[]);assert.equal(x.storageReads,0);
});

test('hard-copy signing accepts a client name at the supported length limit',async()=>{
 const x=setup();assert.equal((await x.submit({signer:'x'.repeat(150)})).status,200);assert.equal(x.calls[0].args.p_payload.signer.length,150);
});

for(const consent of [undefined,null,false,'true',1,{}])test(`hard-copy signing requires explicit confirmation (${JSON.stringify(consent)})`,async()=>{
 const x=setup();const response=await x.submit({consent});
 assert.equal(response.status,400);assert.deepEqual(x.calls,[]);assert.equal(x.storageReads,0);
});

for(const revision of [3,5,undefined,'4',4.5])test(`hard-copy signing rejects stale or invalid revisions (${String(revision)})`,async()=>{
 const x=setup();assert.equal((await x.submit({revision})).status,409);assert.deepEqual(x.calls,[]);
});

for(const flow of [null,{...savedFlow,stage:'quotation'},{...savedFlow,stage:'approved'},{...savedFlow,stage:'signed'},{...savedFlow,stage:'operations'}])test(`hard-copy signing requires an unsigned generated contract (${flow?.stage??'no workflow'})`,async()=>{
 const x=setup({flow});const response=await x.submit({revision:flow?.revision??0});
 assert.ok([400,409].includes(response.status));assert.deepEqual(x.calls,[]);
});

for(const patch of [
 {signed_at:'2026-11-01T12:00:00Z'},
 {evidence:{method:'digital',signer:'Original client',signature:'saved-signature'}},
 {evidence:{method:'upload',signer:'Original client',path:'saved-contract'}},
 {evidence:{method:'hard_copy',signer:'Original client',recordedBy:'original-employee'}},
 {accepted_at:'2026-11-01T13:00:00Z'},
 {accepted_by:'operations-employee'},
])test(`hard-copy confirmation cannot replace existing signing or acceptance (${Object.keys(patch)[0]})`,async()=>{
 const x=setup({flow:{...savedFlow,...patch}});const response=await x.submit();
 assert.ok([400,409].includes(response.status));assert.deepEqual(x.calls,[]);assert.deepEqual({flow:x.stored,project:x.site},x.before);
});

for(const sales_status of ['new_lead','ready_for_quotation','quotation_in_progress','quotation_approved','contract_signed','transferred_to_operations','cancelled','lost','closed',undefined])test(`hard-copy confirmation respects the project stage (${String(sales_status)})`,async()=>{
 const x=setup({projectPatch:{sales_status}});const response=await x.submit();
 assert.ok([400,409].includes(response.status));assert.deepEqual(x.calls,[]);
});

for(const additional_openings_state of ['requested','submitted'])test(`additional measurements must finish before hard-copy confirmation (${additional_openings_state})`,async()=>{
 const x=setup({projectPatch:{additional_openings_state}});assert.equal((await x.submit()).status,409);assert.deepEqual(x.calls,[]);
});

for(const method of [undefined,null,'','paper','hard-copy',{}])test(`unrecognized signing methods do not produce hard-copy evidence (${JSON.stringify(method)})`,async()=>{
 const x=setup();assert.equal((await x.submit({method})).status,400);assert.deepEqual(x.calls,[]);
});

for(const status of [401,403,404])test(`commercial role and project-branch access denial is preserved (${status})`,async()=>{
 const denied={status,body:{error:'Project unavailable'}};const x=setup({denied});
 assert.deepEqual(await x.submit(),denied);assert.deepEqual(x.reads,[]);assert.deepEqual(x.calls,[]);assert.equal(x.storageReads,0);
});

test('malformed JSON cannot record a hard-copy signature',async()=>{
 const x=setup();assert.equal((await x.submitRaw('{"action":"sign",')).status,409);assert.deepEqual(x.calls,[]);
});

test('workflow read failure does not attempt signing',async()=>{
 const x=setup({readError:{message:'Database unavailable'}});assert.equal((await x.submit()).status,503);assert.deepEqual(x.calls,[]);
});

for(const failure of [{rpcError:{message:'This project changed. Reload before continuing.'}},{rpcThrows:new Error('Connection interrupted')}])test(`hard-copy signing reports the transaction failure without retrying (${failure.rpcError?'conflict':'network'})`,async()=>{
 const x=setup(failure);const response=await x.submit();
 assert.equal(response.status,400);assert.match(response.body.error,/project changed|Connection interrupted/);assert.equal(x.calls.length,1);assert.equal(x.storageReads,0);
 assert.deepEqual({flow:x.stored,project:x.site},x.before);
});
