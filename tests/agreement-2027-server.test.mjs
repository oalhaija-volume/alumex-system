import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loader(dependencies={}){
 const cache=new Map();
 return function load(path){
  const url=path instanceof URL?path:new URL(path,import.meta.url);
  if(cache.has(url.href))return cache.get(url.href);
  const exports={};cache.set(url.href,exports);
  const code=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','exports',code)(name=>{
   if(name in dependencies)return dependencies[name];
   if(name.startsWith('@/'))return load(new URL(`../src/${name.slice(2)}.ts`,import.meta.url));
   if(name.startsWith('.'))return load(new URL(`${name}.ts`,url));
   throw new Error(`Unexpected dependency ${name}`);
  },exports);
  return exports;
 };
}
const load=loader();
const {emptyAgreement2027Fields,normalizeAgreement2027Fields,buildAgreement2027Snapshot}=load('../src/lib/contracts/agreement2027.ts');
const {agreement2027Terms}=load('../src/lib/contracts/agreement2027Content.ts');
const projectId='11111111-1111-4111-8111-111111111111';
const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const quote={version:3,lines:[{opening:{id:'opening-1',opening_type:'Window',opening_direction:'Sliding',quantity:2,width:100,height:100},system:{id:'saved-product',name:'ALUMEX 16',rate:278123,rateSource:'quotation',unit:'sqm',quantity:2,total:556246},glass:null,extras:[],area:2,total:556246}],additionalItems:[],total:25000001,currency:'IQD',preparedBy:'quoted-author',createdAt:'2026-11-01T09:00:00Z'};
const project={id:projectId,client_id:'client-id',project_number:'PRJ-1',project_name:'Saved project',address:'Baghdad',branch:'Rasafa',sales_status:'quotation_approved',additional_openings_state:null,structure_readiness:'ready',sales_engineer_id:'engineer',operations_manager_id:'operations',project_manager_id:'manager',project_engineer_id:'project-engineer',follow_up_owner_id:'sales-manager',consultant_name:'Project consultant',contractor_name:'Project contractor',engineer_name:'Legacy engineer',project_notes:'Retain these project notes'};
const client={client_name:'Client legal name',mobile:'07700000000',alternate_mobile:'07800000000',whatsapp:'07900000000',email:'client@example.invalid',company_name:'Client company',client_type:'company'};
const contacts=[{project_id:null,contact_type:'consultant',contact_name:'Global consultant',mobile:'global-phone',is_primary:true},{project_id:projectId,contact_type:'consultant',contact_name:'Project consultant',mobile:'consultant-phone',is_primary:false},{project_id:projectId,contact_type:'contractor',contact_name:'Project contractor',mobile:'contractor-phone',is_primary:true}];
const employees=[{id:actorId,full_name:'Generating employee',role:'Indoor Sales'},{id:'engineer',full_name:'Sales engineer',role:'Indoor Sales'},{id:'operations',full_name:'Operations manager',role:'Operations Manager'},{id:'manager',full_name:'Projects manager',role:'Project Manager'},{id:'project-engineer',full_name:'Project engineer',role:'Project Engineer'},{id:'sales-manager',full_name:'Sales manager',role:'Sales Manager'}];
function setup({stage='approved',site={},flowPatch={},denied=null,sourceError=null,contactRows=contacts,employeeRows=employees}={}){
 const reads=[],calls=[];
 const base={project_id:projectId,revision:4,stage,quotation:structuredClone(quote),contract:null,evidence:null,signed_at:null,accepted_at:null,accepted_by:null};
 if(stage==='contract'){
  base.contract={number:'CT-PRJ-1-3',createdAt:'2026-11-01T09:30:00Z',createdBy:'original-author',branch:'Rasafa',template:'residential',client:{name:'Original client',mobile:'old-phone',client_type:'company'},project:{name:'Original project',number:'PRJ-1',address:'Original address',branch:'Rasafa'},quotation:structuredClone(quote),terms:agreement2027Terms('residential'),agreement2027:buildAgreement2027Snapshot(quote,'residential',emptyAgreement2027Fields(),[{openingId:'opening-1',aluminumColor:'black',glassColor:'blue',bottomFrame:'yes',notes:'Retained specification'}])};
 }
 const stored={...base,...flowPatch};
 const siteRow={...project,sales_status:stage==='contract'?'contract_generated':'quotation_approved',...site};
 const before=structuredClone({flow:stored,project:siteRow});
 const admin={from(table){
  reads.push({table,filters:[],columns:null});const read=reads.at(-1);
  const values=()=>table==='projects'?siteRow:table==='clients'?client:table==='profiles'?employeeRows:table==='client_contacts'?contactRows:table==='openings'?[{id:'opening-1',aluminum_color:'black',glass_color:'blue',bottom_frame:'yes',notes:'Recorded note'},{id:'not-quoted',aluminum_color:'private-unquoted'}]:stored;
  const result=()=>({data:sourceError&&table==='client_contacts'?null:values(),error:sourceError&&table==='client_contacts'?sourceError:null});
  return {select(columns){read.columns=columns;return this;},eq(key,value){read.filters.push([key,value]);return this;},or(value){read.filters.push(['or',value]);return this;},in(key,value){read.filters.push([key,value]);return this;},order(){return this;},single:async()=>table==='profiles'?{data:{branch:'Najaf'},error:null}:result(),maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
 },rpc:async(name,args)=>{calls.push({name,args});return{data:{...stored,revision:5},error:null};}};
 const api=loader({'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},'@/lib/contracts/uploadedTerms':{uploadedContractTerms:()=>[]},'@/lib/workflow/access':{salesProject:async()=>denied?{response:denied}:{admin,auth:{role:'Indoor Sales',user:{id:actorId}},project:siteRow}},'@/lib/workflow/pricing':{},'@/lib/workflow/quotationOpenings':{}})('../src/app/api/sales-flow/[projectId]/route.ts');
 const submit=body=>api.POST(new Request('http://localhost:3003/api/sales-flow/'+projectId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:4,...body})}),{params:Promise.resolve({projectId})});
 return{api,submit,reads,calls,stored,siteRow,before,admin};
}

test('empty contract field objects are independent and include a complete first phase',()=>{
 const a=emptyAgreement2027Fields(),b=emptyAgreement2027Fields();a.approvals.salesEngineer.name='Changed';a.phases[0].notes='Changed';a.samples.push('glass');
 assert.equal(b.approvals.salesEngineer.name,'');assert.equal(b.phases[0].notes,'');assert.deepEqual(b.samples,[]);assert.equal(b.phases.length,1);
});
test('normalization validates dates, field types, phase count and signature data without accepting financial overrides',()=>{
 const fields=emptyAgreement2027Fields();fields.clientLegalName='  Client  ';fields.handoverDate='2028-02-29';fields.samples=['glass','glass'];
 const value=normalizeAgreement2027Fields(fields);assert.equal(value.clientLegalName,'Client');assert.equal(value.handoverDate,'2028-02-29');assert.deepEqual(value.samples,['glass']);assert.equal(fields.clientLegalName,'  Client  ');
 for(const patch of [{total:1},{paymentSchedule:[]},{handoverDate:'2026-02-29'},{handoverDate:'2026-13-01'},{phases:[]},{phases:Array(4).fill({})},{samples:['invented']},{approvals:{other:{}}},{clientLegalName:42},{companyRepresentativeSignature:'data:image/svg+xml;base64,PHN2Zz4='},{companyRepresentativeSignature:'data:image/png;base64,iVBORw0KGgo='}])assert.throws(()=>normalizeAgreement2027Fields({...fields,...patch}));
});
test('generation captures server source data and approved prices without querying the price catalog',async()=>{
 const x=setup();const response=await x.submit({action:'contract',template:'commercial',total:1,client:{name:'FORGED'},agreement2027:{total:1}});
 assert.equal(response.status,200);assert.equal(x.calls.length,1);assert.equal(x.calls[0].name,'advance_sales_flow');
 const payload=x.calls[0].args.p_payload;assert.equal(payload.agreement2027.version,'agreement-2027');assert.equal(payload.agreement2027.total,quote.total);assert.equal(payload.branch,'Najaf');assert.equal(payload.project.branch,'Rasafa');assert.equal(payload.createdBy,actorId);assert.equal(payload.client.name,client.client_name);assert.equal(payload.terms.length,19);
 const fields=payload.agreement2027.fields;assert.equal(fields.ownerName,client.client_name);assert.equal(fields.email,client.email);assert.equal(fields.whatsapp,client.whatsapp);assert.equal(fields.consultantName,'Project consultant');assert.equal(fields.consultantPhone,'consultant-phone');assert.equal(fields.contractorPhone,'contractor-phone');assert.equal(fields.salesEngineerName,'Sales engineer');assert.equal(fields.approvals.operationsManager.name,'Operations manager');assert.equal(fields.approvals.salesManager.name,'Sales manager');assert.equal(fields.companyRepresentativeSignature,'');assert.equal(fields.approvals.salesEngineer.signature,'');assert.equal(fields.approvals.salesEngineer.date,'');
 assert.equal(payload.agreement2027.openingSpecifications.length,1);assert.equal(payload.agreement2027.openingSpecifications[0].openingId,'opening-1');assert.match(payload.agreement2027.openingSpecifications[0].technicalDescription,/14/);
 assert.deepEqual(payload.agreement2027.paymentSchedule.map(stage=>stage.percent),[30,20,10,20,15,5]);assert.equal(payload.agreement2027.paymentSchedule.reduce((sum,stage)=>sum+stage.amount,0),quote.total);
 assert.equal(x.reads.some(read=>read.table==='product_price_settings'),false);assert.deepEqual({flow:x.stored,project:x.siteRow},x.before);
 const contactRead=x.reads.find(read=>read.table==='client_contacts');assert.deepEqual(contactRead.filters,[['client_id','client-id'],['or',`project_id.eq.${projectId},project_id.is.null`]]);
});
test('project consultant and contractor names never acquire another person’s phone number',async()=>{
 const x=setup({contactRows:contacts.map(contact=>({...contact,contact_name:'Different person'}))});
 const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,200);
 const fields=x.calls[0].args.p_payload.agreement2027.fields;
 assert.equal(fields.consultantName,'Project consultant');assert.equal(fields.consultantPhone,'');
 assert.equal(fields.contractorName,'Project contractor');assert.equal(fields.contractorPhone,'');
});
test('sales engineer uses assigned or verified sales staff and never guesses an external architect',async()=>{
 for(const role of ['Indoor Sales','Admin']){
  const x=setup({site:{sales_engineer_id:null,engineer_name:'External architect'},employeeRows:employees.map(employee=>employee.id===actorId?{...employee,role}:employee)});
  const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,200);
  const fields=x.calls[0].args.p_payload.agreement2027.fields;
  assert.equal(fields.salesEngineerName,role==='Indoor Sales'?'Generating employee':'');
  assert.equal(fields.approvals.salesEngineer.name,fields.salesEngineerName);assert.equal(fields.approvals.salesEngineer.signature,'');
 }
});
test('source lookup failure does not create a partial contract',async()=>{
 const x=setup({sourceError:{message:'private database detail'}});const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,400);assert.deepEqual(x.calls,[]);assert.equal(result.body.error.includes('private database detail'),false);
});
for(const patch of [{stage:'quotation'},{stage:'signed'},{stage:'operations'}])test(`generation requires the persisted approved quote: ${patch.stage}`,async()=>{
 const x=setup(patch);const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,400);assert.deepEqual(x.calls,[]);
});
test('saving supplementary details preserves source snapshots and recalculates payments from the saved approved total',async()=>{
 const x=setup({stage:'contract'}),details=emptyAgreement2027Fields();details.clientLegalName='Contract legal name';details.handoverDate='2026-11-15';details.phases[0].measurementReadyDate='2026-12-01';
 const response=await x.submit({action:'save-contract-details',details,confirmed:true,agreement2027:{total:1},terms:[],actor:'forged'});
 assert.equal(response.status,200);assert.equal(x.calls.length,1);assert.equal(x.calls[0].name,'update_agreement_contract');assert.equal(x.calls[0].args.p_actor,actorId);assert.equal(x.calls[0].args.p_agreement.total,quote.total);assert.deepEqual(x.calls[0].args.p_agreement.openingSpecifications,x.stored.contract.agreement2027.openingSpecifications);assert.deepEqual(x.calls[0].args.p_agreement.readiness,x.stored.contract.agreement2027.readiness);assert.deepEqual(x.calls[0].args.p_agreement.specificationNotes,x.stored.contract.agreement2027.specificationNotes);assert.equal(x.calls[0].args.p_agreement.amountInWords,x.stored.contract.agreement2027.amountInWords);assert.equal(x.calls[0].args.p_agreement.fields.clientLegalName,'Contract legal name');assert.equal(x.calls[0].args.p_terms.length,19);assert.deepEqual(x.reads.map(read=>read.table),['sales_workflows']);assert.deepEqual({flow:x.stored,project:x.siteRow},x.before);
});
test('changing 2027 contract type uses saved prices and existing filled details',async()=>{
 const x=setup({stage:'contract'});const response=await x.submit({action:'change-contract-template',template:'commercial',confirmed:true});assert.equal(response.status,200);assert.equal(x.calls[0].name,'update_agreement_contract');assert.equal(x.calls[0].args.p_template,'commercial');assert.equal(x.calls[0].args.p_agreement.total,quote.total);assert.deepEqual(x.calls[0].args.p_agreement.paymentSchedule.map(stage=>stage.percent),[30,20,10,20,15,5]);assert.deepEqual(x.reads.map(read=>read.table),['sales_workflows']);assert.deepEqual({flow:x.stored,project:x.siteRow},x.before);
});
for(const patch of [{signed_at:'2026-11-15T10:00:00Z'},{evidence:{method:'hard_copy'}},{accepted_by:'operations'},{accepted_at:'2026-11-15T11:00:00Z'},{stage:'signed'}])test(`saving details rejects immutable state ${Object.keys(patch)[0]}`,async()=>{
 const x=setup({stage:'contract',flowPatch:patch});const response=await x.submit({action:'save-contract-details',details:emptyAgreement2027Fields(),confirmed:true});assert.ok([400,409].includes(response.status));assert.deepEqual(x.calls,[]);
});
test('saving contract details requires confirmation, valid fields and current revision',async()=>{
 for(const patch of [{confirmed:false},{revision:3},{details:{total:1}},{details:{handoverDate:'not-a-date'}}]){
  const x=setup({stage:'contract'});const response=await x.submit({action:'save-contract-details',details:emptyAgreement2027Fields(),confirmed:true,...patch});assert.ok([400,409].includes(response.status));assert.deepEqual(x.calls,[]);
 }
});
test('legacy contracts are not silently upgraded by saving 2027 details',async()=>{
 const x=setup({stage:'contract'});delete x.stored.contract.agreement2027;const result=await x.submit({action:'save-contract-details',details:emptyAgreement2027Fields(),confirmed:true});assert.equal(result.status,409);assert.deepEqual(x.calls,[]);
});
test('branch or role access denial happens before contract reads or writes',async()=>{
 const x=setup({denied:{status:403,body:{error:'Unavailable'}}});const response=await x.submit({action:'save-contract-details',details:emptyAgreement2027Fields(),confirmed:true});assert.equal(response.status,403);assert.deepEqual(x.reads,[]);assert.deepEqual(x.calls,[]);
});
