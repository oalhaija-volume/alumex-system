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

const terms=JSON.parse(readFileSync(new URL('../src/lib/contracts/uploadedTerms.json',import.meta.url),'utf8'));
const uploadedTerms=load('../src/lib/contracts/uploadedTerms.ts',{'./uploadedTerms.json':{default:terms}});
const projectId='153aa1d1-b650-40b1-8fc1-d1bd45ab224f';
const project={id:projectId,project_number:'PRJ-202611-0008',sales_status:'contract_generated',branch:'Karkh',created_by:'indoor-creator',owner_id:'outdoor-owner'};
const quotation={version:2,lines:[],additionalItems:[],total:25710534,currency:'IQD',preparedBy:'quote-creator',createdAt:'2026-11-01T09:00:00Z'};
const contract={template:'commercial',terms:terms.commercial,number:'CT-PRJ-202611-0008-3',createdAt:'2026-11-01T10:00:00Z',createdBy:'contract-creator',branch:'Karkh',project:{branch:'Karkh',name:'Saved project',number:'PRJ-202611-0008',address:'Saved address'},client:{name:'Saved corporate client',mobile:'07700000000',client_type:'company'},quotation,approvedAt:'2026-11-01T09:30:00Z'};
const savedFlow={project_id:projectId,revision:4,stage:'contract',quotation,contract,evidence:null,signed_at:null,accepted_at:null,accepted_by:null,approved_by:'approver',approved_at:'2026-11-01T09:30:00Z'};

function freeze(value) {
 if(value&&typeof value==='object'){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}

function setup({flow=savedFlow,projectPatch={},denied=null,rpcError=null}={}) {
 const reads=[],calls=[];
 const stored=freeze(structuredClone(flow));
 const site=freeze({...project,...projectPatch});
 const before={flow:structuredClone(stored),project:structuredClone(site)};
 const admin={
  from(table){
   reads.push(table);assert.equal(table,'sales_workflows','Type correction must use saved contract metadata, without querying employees, clients or prices');
   return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:stored,error:null})};
  },
  async rpc(name,args){calls.push({name,args});return {data:{...stored,revision:5},error:rpcError};},
 };
 const api=load('../src/app/api/sales-flow/[projectId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/contracts/uploadedTerms':uploadedTerms,
  '@/lib/workflow/access':{salesProject:async(id,scope)=>{
   assert.equal(id,projectId);assert.equal(scope,'commercial');
   return denied?{response:denied}:{admin,auth:{role:'Indoor Sales',user:{id:'correcting-employee'}},project:site};
  }},
  '@/lib/workflow/pricing':{},'@/lib/workflow/quotationOpenings':{},
 });
 const submit=body=>api.POST(new Request('http://localhost:3003/api/sales-flow/'+projectId,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'change-contract-template',revision:4,template:'residential',confirmed:true,...body}),
 }),{params:Promise.resolve({projectId})});
 return {submit,reads,calls,stored,site,before};
}

for(const template of ['residential','commercial'])test(`changing to ${template} uses its canonical Arabic terms and preserves the saved contract and quotation`,async()=>{
 const originalTemplate=template==='residential'?'commercial':'residential';
 const flow={...savedFlow,contract:{...contract,template:originalTemplate,terms:terms[originalTemplate]}};
 const x=setup({flow});
 const response=await x.submit({template,terms:[{title:'Forged terms',text:'Pay nothing'}],branch:'Rasafa',createdBy:'forged-creator',client:{client_type:'individual'},quotation:{total:1},number:'FORGED',createdAt:'2000-01-01',p_actor:'forged-actor'});
 assert.equal(response.status,200);
 assert.equal(response.headers['Cache-Control'],'no-store');
 assert.deepEqual(x.calls,[{name:'advance_sales_flow',args:{p_project:projectId,p_action:'change-contract-template',p_revision:4,p_payload:{template,terms:terms[template]},p_actor:'correcting-employee'}}]);
 const payments=x.calls[0].args.p_payload.terms.find(section=>section.title==='payment terms').text;
 assert.match(payments,template==='commercial'?/25%/:/50/);
 assert.match(payments,/100%/);
 assert.deepEqual(x.stored,x.before.flow);
 assert.deepEqual(x.site,x.before.project);
 assert.deepEqual(x.reads,['sales_workflows']);
});

for(const template of [undefined,null,'','corporate','Residential',3,{},[]])test(`invalid contract template is rejected: ${JSON.stringify(template)}`,async()=>{
 const x=setup();
 assert.equal((await x.submit({template})).status,400);assert.deepEqual(x.calls,[]);
});

for(const confirmed of [undefined,false,'true',1,null])test(`changing contract type requires explicit confirmation: ${String(confirmed)}`,async()=>{
 const x=setup();
 const response=await x.submit({confirmed});
 assert.equal(response.status,400);assert.match(response.body.error,/Confirm/);assert.deepEqual(x.calls,[]);
});

test('choosing the saved contract type does not create a correction',async()=>{
 const x=setup();const response=await x.submit({template:'commercial'});
 assert.equal(response.status,400);assert.match(response.body.error,/different/);assert.deepEqual(x.calls,[]);
});

for(const revision of [3,5,undefined,'4',4.5])test(`stale or invalid workflow revision is rejected: ${String(revision)}`,async()=>{
 const x=setup();assert.equal((await x.submit({revision})).status,409);assert.deepEqual(x.calls,[]);
});

for(const flow of [null,{...savedFlow,contract:null},{...savedFlow,stage:'approved'},{...savedFlow,stage:'quotation'}])test(`type correction needs an existing generated contract (${flow?.stage??'missing workflow'})`,async()=>{
 const x=setup({flow});assert.equal((await x.submit({revision:flow?.revision??0})).status,409);assert.deepEqual(x.calls,[]);
});

for(const patch of [
 {signed_at:'2026-11-01T12:00:00Z'},
 {evidence:{method:'digital',signer:'Client',signature:'saved-signature'}},
 {evidence:{method:'upload',signer:'Client',path:'saved-contract'}},
 {accepted_at:'2026-11-01T13:00:00Z'},
 {accepted_by:'operations-employee'},
 {stage:'signed'},
 {stage:'operations'},
])test(`signed evidence or workflow stage is immutable: ${Object.keys(patch).join(',')}/${patch.stage??''}`,async()=>{
 const x=setup({flow:{...savedFlow,...patch}});
 assert.equal((await x.submit()).status,409);assert.deepEqual(x.calls,[]);
});

for(const sales_status of ['new_lead','ready_for_quotation','quotation_in_progress','quotation_approved','contract_signed','transferred_to_operations','cancelled','lost','closed',undefined])test(`project stage must permit an unsigned generated contract (${String(sales_status)})`,async()=>{
 const x=setup({projectPatch:{sales_status}});
 assert.equal((await x.submit()).status,409);assert.deepEqual(x.calls,[]);
});

for(const additional_openings_state of ['requested','submitted'])test(`pending additional measurements block contract correction (${additional_openings_state})`,async()=>{
 const x=setup({projectPatch:{additional_openings_state}});
 assert.equal((await x.submit()).status,409);assert.deepEqual(x.calls,[]);
});

for(const status of [403,404])test(`role and branch access denial is preserved (${status})`,async()=>{
 const denied={status,body:{error:'Project unavailable'}};
 const x=setup({denied});assert.deepEqual(await x.submit(),denied);assert.deepEqual(x.reads,[]);assert.deepEqual(x.calls,[]);
});

test('a database conflict is returned without retrying or editing the contract locally',async()=>{
 const x=setup({rpcError:{message:'This project changed. Reload before continuing.'}});
 const response=await x.submit();
 assert.equal(response.status,400);assert.match(response.body.error,/project changed/);assert.equal(x.calls.length,1);
 assert.deepEqual(x.stored,x.before.flow);assert.deepEqual(x.site,x.before.project);
});
