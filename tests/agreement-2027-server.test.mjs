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
function setup({stage='approved',site={},flowPatch={},denied=null,sourceError=null,contactRows=contacts,employeeRows=employees,clientRow=client,openingRows=[{id:'opening-1',aluminum_color:'black',glass_color:'blue',bottom_frame:'yes',notes:'Recorded note'},{id:'not-quoted',aluminum_color:'private-unquoted'}]}={}){
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
  const values=()=>table==='projects'?siteRow:table==='clients'?clientRow:table==='profiles'?employeeRows:table==='client_contacts'?contactRows:table==='openings'?openingRows:stored;
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
test('historical unified snapshot helpers retain the legacy document layout',()=>{
 const unified=buildAgreement2027Snapshot(quote,'unified',emptyAgreement2027Fields());
 assert.equal(Object.hasOwn(unified,'documentLayout'),false);
 assert.equal(Object.hasOwn(unified,'selectedProductsOnly'),false);
 assert.equal(Object.hasOwn(unified,'compactLayout'),false);
 assert.deepEqual(unified.paymentSchedule,[]);
 assert.deepEqual(unified.paymentSchedules.map(schedule=>schedule.id),['residential','commercial']);
});
test('normalization validates dates, field types, phase count and signature data without accepting financial overrides',()=>{
 const fields=emptyAgreement2027Fields();fields.clientLegalName='  Client  ';fields.handoverDate='2028-02-29';fields.samples=['glass','glass'];
 const value=normalizeAgreement2027Fields(fields);assert.equal(value.clientLegalName,'Client');assert.equal(value.handoverDate,'2028-02-29');assert.deepEqual(value.samples,['glass']);assert.equal(fields.clientLegalName,'  Client  ');
 for(const patch of [{total:1},{paymentSchedule:[]},{handoverDate:'2026-02-29'},{handoverDate:'2026-13-01'},{phases:[]},{phases:Array(4).fill({})},{samples:['invented']},{approvals:{other:{}}},{clientLegalName:42},{companyRepresentativeSignature:'data:image/svg+xml;base64,PHN2Zz4='},{companyRepresentativeSignature:'data:image/png;base64,iVBORw0KGgo='}])assert.throws(()=>normalizeAgreement2027Fields({...fields,...patch}));
});
test('generation captures server source data and approved prices without querying the price catalog',async()=>{
 const x=setup();const response=await x.submit({action:'contract',template:'commercial',total:1,client:{name:'FORGED'},agreement2027:{total:1}});
 assert.equal(response.status,200);assert.equal(x.calls.length,1);assert.equal(x.calls[0].name,'advance_sales_flow');
 const payload=x.calls[0].args.p_payload;assert.equal(payload.number,'NAJ-PRJ-1-4');assert.equal(payload.agreement2027.version,'agreement-2027');assert.equal(payload.agreement2027.total,quote.total);assert.equal(payload.branch,'Najaf');assert.equal(payload.project.branch,'Rasafa');assert.equal(payload.createdBy,actorId);assert.equal(payload.client.name,client.client_name);assert.equal(payload.terms.length,19);assert.equal(payload.template,'commercial');assert.match(payload.terms[2].text,/للمشاريع التجارية/);assert.doesNotMatch(payload.terms[2].text,/للمشاريع السكنية/);
 const fields=payload.agreement2027.fields;assert.equal(fields.ownerName,'');assert.equal(fields.ownerPhone,'');assert.equal(fields.directPhone,client.mobile);assert.equal(fields.email,client.email);assert.equal(fields.whatsapp,client.whatsapp);assert.equal(fields.consultantName,'Project consultant');assert.equal(fields.consultantPhone,'consultant-phone');assert.equal(fields.contractorPhone,'contractor-phone');assert.equal(fields.executingEntity,'');assert.equal(fields.salesEngineerName,'Sales engineer');assert.equal(fields.approvals.operationsManager.name,'Operations manager');assert.equal(fields.approvals.salesManager.name,'Sales manager');assert.equal(fields.companyRepresentativeSignature,'');assert.equal(fields.approvals.salesEngineer.signature,'');assert.equal(fields.approvals.salesEngineer.date,'');
 assert.equal(payload.agreement2027.openingSpecifications.length,1);assert.equal(payload.agreement2027.openingSpecifications[0].openingId,'opening-1');assert.match(payload.agreement2027.openingSpecifications[0].technicalDescription,/14/);
 assert.equal(payload.agreement2027.documentLayout,'source-pdf-2027');
 assert.equal(payload.agreement2027.selectedProductsOnly,true);
 assert.equal(payload.agreement2027.compactLayout,true);
 assert.deepEqual(payload.agreement2027.paymentSchedule.map(stage=>stage.percent),[30,20,10,20,15,5]);assert.deepEqual(payload.agreement2027.paymentSchedule.map(stage=>stage.id),['signing','profiles-delivered','profiles-installed','glass-delivered','glass-installed','before-finishing']);assert.equal(payload.agreement2027.paymentSchedule.reduce((sum,stage)=>sum+stage.amount,0),quote.total);assert.equal(Object.hasOwn(payload.agreement2027,'paymentSchedules'),false);
 assert.equal(x.reads.some(read=>read.table==='product_price_settings'),false);assert.deepEqual({flow:x.stored,project:x.siteRow},x.before);
 const contactRead=x.reads.find(read=>read.table==='client_contacts');assert.deepEqual(contactRead.filters,[['client_id','client-id'],['or',`project_id.eq.${projectId},project_id.is.null`]]);
});
for(const [systemModel,description]of [['A16',/14 سم.*1\.6 إلى 1\.8/],['A16 Pro',/14 سم.*1\.6 إلى 2/],['A16 Pro+',undefined],['4500',/5\.5 سم.*1\.5 إلى 1\.6/],['4500 Pro',/14 سم.*1\.5 إلى 2/]])test(`contract specifications use saved ${systemModel} without inventing unsupported dimensions`,async()=>{
 const quotation=structuredClone(quote);
 quotation.lines[0].systemModel=systemModel;
 quotation.lines[0].opening.opening_direction=systemModel.startsWith('4500')?'Hinged':'Sliding';
 const before=structuredClone(quotation);
 const x=setup({flowPatch:{quotation}});
 const response=await x.submit({action:'contract',template:'residential'});
 assert.equal(response.status,200);
 const specifications=x.calls[0].args.p_payload.agreement2027.openingSpecifications;
 if(description)assert.match(specifications[0].technicalDescription,description);
 else assert.equal(Object.hasOwn(specifications[0],'technicalDescription'),false,'Pro+ must not inherit unverified PLUS specifications');
 assert.deepEqual(x.stored.quotation,before);
 assert.equal(x.reads.some(read=>read.table==='product_price_settings'),false);
});
for(const name of ['ALUMEX PHOTO CELL DOOR','THE ADDRESS CURTAIN WALL ACW 1200 1500 2800'])test(`generation does not guess an unresolved variant for ${name}`,async()=>{
 const quotation=structuredClone(quote);quotation.lines[0].system.name=name;
 const x=setup({flowPatch:{quotation}});
 assert.equal((await x.submit({action:'contract',template:'commercial'})).status,200);
 const specifications=x.calls[0].args.p_payload.agreement2027.openingSpecifications;
 assert.equal(specifications.length,1);
 assert.equal(Object.hasOwn(specifications[0],'technicalDescription'),false,'Alternative reference models are not a recorded project specification');
 assert.equal(specifications[0].aluminumColor,'black');assert.equal(specifications[0].notes,'Recorded note');
 assert.deepEqual(x.stored.quotation,quotation);
});
for(const template of ['residential','commercial'])for(const total of [14_999_999,15_000_000,25_000_001])test(`generation uses only the selected ${template} policy for ${total} IQD`,async()=>{
 const quotation={...structuredClone(quote),total};
 const x=setup({flowPatch:{quotation}});
 const response=await x.submit({action:'contract',...(template===undefined?{}:{template}),total:1,paymentSchedule:[{percent:100,amount:1}],paymentSchedules:[],agreement2027:{total:1,paymentSchedule:[],paymentSchedules:[]}});
 assert.equal(response.status,200);
 const contract=x.calls[0].args.p_payload;
 assert.equal(contract.template,template);
 assert.equal(contract.agreement2027.selectedProductsOnly,true);
 assert.equal(contract.agreement2027.compactLayout,true);
 assert.equal(contract.agreement2027.total,total);
 assert.equal(Object.hasOwn(contract.agreement2027,'paymentSchedules'),false);
 const stages=contract.agreement2027.paymentSchedule;
 const expected=total<15_000_000?[100]:template==='residential'?[50,50]:[30,20,10,20,15,5];
 assert.deepEqual(stages.map(stage=>stage.percent),expected);
 assert.equal(stages.reduce((sum,stage)=>sum+stage.amount,0),total);
 assert.match(contract.terms[2].text,/15,000,000.*100%/s,'The source PDF full-payment exception applies to either selected contract type');
 if(template==='residential'){
  if(total>=15_000_000)assert.match(stages[1].trigger,/جهوزية.*مصنع.*سبعة أيام/s);
  assert.match(contract.terms[2].text,/للمشاريع السكنية.*50%/s);
  assert.doesNotMatch(contract.terms[2].text,/للمشاريع التجارية/);
 }else{
  assert.match(contract.terms[2].text,/للمشاريع التجارية.*30%.*15,000,000.*100%/s);
  assert.doesNotMatch(contract.terms[2].text,/للمشاريع السكنية/);
 }
 assert.deepEqual(x.stored.quotation,quotation,'Generation does not rewrite approved prices');
});
for(const template of [undefined,null,'','unified','Residential','commercial_building',3,{},[]])test(`contract generation rejects an unchosen or invalid type: ${JSON.stringify(template)}`,async()=>{
 const x=setup();
 const response=await x.submit({action:'contract',...(template===undefined?{}:{template})});
 assert.equal(response.status,400);
 assert.match(response.body.error,/Choose the residential or commercial contract template/);
 assert.deepEqual(x.calls,[],'A missing contract type must not advance the workflow');
 assert.equal(x.reads.some(read=>['projects','clients','client_contacts','profiles','openings'].includes(read.table)),false,'Reject before preparing contract source data');
 assert.deepEqual({flow:x.stored,project:x.siteRow},x.before);
});
test('project consultant and contractor names never acquire another person’s phone number',async()=>{
 const x=setup({contactRows:contacts.map(contact=>({...contact,contact_name:'Different person'}))});
 const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,200);
 const fields=x.calls[0].args.p_payload.agreement2027.fields;
 assert.equal(fields.consultantName,'Project consultant');assert.equal(fields.consultantPhone,'');
 assert.equal(fields.contractorName,'Project contractor');assert.equal(fields.contractorPhone,'');
});
test('contract source facts include alternate phone and matching project contact details without guessing another client',async()=>{
 const contact=(patch={})=>({project_id:projectId,contact_type:'client',contact_name:client.client_name,mobile:'project-phone',whatsapp:'project-whatsapp',email:'project@example.invalid',is_primary:false,...patch});
 const x=setup({clientRow:{...client,mobile:null,alternate_mobile:'alternate-phone',whatsapp:null,email:null},contactRows:[
  contact({project_id:null,mobile:'global-phone',whatsapp:'global-whatsapp',email:'global@example.invalid',is_primary:true}),
  contact({contact_name:'Different client',mobile:'unrelated-phone',is_primary:true}),
  contact(),
 ]});
 const response=await x.submit({action:'contract',template:'residential'});assert.equal(response.status,200);
 const fields=x.calls[0].args.p_payload.agreement2027.fields;
 assert.equal(fields.ownerName,'');assert.equal(fields.ownerPhone,'');assert.equal(fields.directPhone,'alternate-phone');
 assert.equal(fields.whatsapp,'project-whatsapp');assert.equal(fields.email,'project@example.invalid');
 assert.equal(fields.companyRepresentativeSignature,'');assert.equal(fields.approvals.salesEngineer.signature,'');
 const missing=setup({clientRow:{...client,mobile:null,alternate_mobile:null,whatsapp:null,email:null},contactRows:[contact({contact_name:'Different client',is_primary:true})]});
 assert.equal((await missing.submit({action:'contract',template:'commercial'})).status,200);
 const blank=missing.calls[0].args.p_payload.agreement2027.fields;
 assert.equal(blank.ownerPhone,'');assert.equal(blank.directPhone,'');assert.equal(blank.whatsapp,'');assert.equal(blank.email,'');
});
test('an explicitly individual client supplies the recorded owner name and contact number',async()=>{
 const individual={...client,client_type:'individual',company_name:null,mobile:null,alternate_mobile:'individual-alternate'};
 const x=setup({clientRow:individual});
 assert.equal((await x.submit({action:'contract',template:'residential'})).status,200);
 const fields=x.calls[0].args.p_payload.agreement2027.fields;
 assert.equal(fields.clientLegalName,individual.client_name);assert.equal(fields.clientClassification,'فرد');
 assert.equal(fields.ownerName,individual.client_name);assert.equal(fields.ownerPhone,'individual-alternate');assert.equal(fields.directPhone,'individual-alternate');
 assert.equal(fields.executingEntity,'','A contractor name does not establish the separate executing entity');
});
test('unknown project facts remain blank for manual completion without manufactured names, classifications, dates or approvals',async()=>{
 const x=setup({
  site:{sales_engineer_id:null,operations_manager_id:null,project_manager_id:null,project_engineer_id:null,follow_up_owner_id:null,structure_readiness:null,consultant_name:null,contractor_name:null,project_notes:null},
  clientRow:{...client,client_type:null,company_name:null,mobile:null,alternate_mobile:null,whatsapp:null,email:null},contactRows:[],
 });
 assert.equal((await x.submit({action:'contract',template:'commercial'})).status,200);
 const contract=x.calls[0].args.p_payload,fields=contract.agreement2027.fields;
 assert.equal(fields.clientLegalName,client.client_name,'Known client identity remains filled');
 assert.equal(contract.client.client_type,null,'An unknown client classification must not become an individual client');
 for(const key of ['clientClassification','companyName','executingEntity','ownerName','ownerPhone','directPhone','whatsapp','email','consultantName','consultantPhone','contractorName','contractorPhone','salesEngineerName','stateAtSigning','handoverDate','handoverReceivedDate','projectApprovalDate','advancePaidDate','specialInstructions','agreedCommitments','followUpNotes','administrativeNotes','companyRepresentativeName','companyRepresentativeTitle','companyRepresentativeDate','companyRepresentativeSignature'])assert.equal(fields[key],'',key+' must wait for an actual record or manual entry');
 assert.deepEqual(fields.samples,[]);
 assert.deepEqual(fields.phases,[{technicalMeetingDate:'',measurementReadyDate:'',installationReadyDate:'',notes:''}]);
 for(const approval of Object.values(fields.approvals))assert.deepEqual(approval,{name:'',date:'',signature:''});
 assert.equal(contract.project.name,project.project_name);assert.equal(contract.project.address,project.address);
 assert.deepEqual(x.stored.quotation,quote);
});
test('every approved quotation opening retains its selected system specification even without a source opening row',async()=>{
 const quotation=structuredClone(quote);
 quotation.lines.push({...structuredClone(quotation.lines[0]),opening:{...quotation.lines[0].opening,id:'quotation-added-opening'},systemModel:'A16 Pro'});
 const x=setup({flowPatch:{quotation},openingRows:[{id:'opening-1',aluminum_color:'black',glass_color:'blue',bottom_frame:'yes',notes:'Recorded note'}]});
 assert.equal((await x.submit({action:'contract',template:'commercial'})).status,200);
 const specifications=x.calls[0].args.p_payload.agreement2027.openingSpecifications;
 assert.deepEqual(specifications.map(specification=>specification.openingId),['opening-1','quotation-added-opening']);
 assert.equal(specifications[0].aluminumColor,'black');assert.equal(specifications[0].notes,'Recorded note');
 assert.match(specifications[1].technicalDescription,/14 سم.*1\.6 إلى 2/);
 assert.equal(specifications[1].aluminumColor,'');assert.equal(specifications[1].glassColor,'');assert.equal(specifications[1].bottomFrame,'');assert.equal(specifications[1].notes,'');
 assert.deepEqual(x.stored.quotation,quotation);
});
test('sales engineer uses the assigned project employee and never guesses the generating actor or an external architect',async()=>{
 for(const role of ['Indoor Sales','Admin']){
  const x=setup({site:{sales_engineer_id:null,engineer_name:'External architect'},employeeRows:employees.map(employee=>employee.id===actorId?{...employee,role}:employee)});
  const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,200);
  const fields=x.calls[0].args.p_payload.agreement2027.fields;
  assert.equal(fields.salesEngineerName,'');
  assert.equal(fields.approvals.salesEngineer.name,fields.salesEngineerName);assert.equal(fields.approvals.salesEngineer.signature,'');
 }
});
test('source lookup failure does not create a partial contract',async()=>{
 const x=setup({sourceError:{message:'private database detail'}});const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,400);assert.deepEqual(x.calls,[]);assert.equal(result.body.error.includes('private database detail'),false);
});
for(const patch of [{stage:'quotation'},{stage:'signed'},{stage:'operations'}])test(`generation requires the persisted approved quote: ${patch.stage}`,async()=>{
 const x=setup(patch);const result=await x.submit({action:'contract',template:'residential'});assert.equal(result.status,400);assert.deepEqual(x.calls,[]);
});
test('saving supplementary details preserves source snapshots and the saved payment schedule',async()=>{
 const x=setup({stage:'contract'}),details=emptyAgreement2027Fields();details.clientLegalName='Contract legal name';details.ownerName='Manually confirmed property owner';details.ownerPhone='07700000111';details.executingEntity='Manually confirmed executing entity';details.handoverDate='2026-11-15';details.phases[0].measurementReadyDate='2026-12-01';
 const response=await x.submit({action:'save-contract-details',details,confirmed:true,agreement2027:{total:1},terms:[],actor:'forged'});
 assert.equal(response.status,200);assert.equal(x.calls.length,1);assert.equal(x.calls[0].name,'update_agreement_contract');assert.equal(x.calls[0].args.p_actor,actorId);assert.equal(x.calls[0].args.p_agreement.total,quote.total);assert.deepEqual(x.calls[0].args.p_agreement.openingSpecifications,x.stored.contract.agreement2027.openingSpecifications);assert.deepEqual(x.calls[0].args.p_agreement.readiness,x.stored.contract.agreement2027.readiness);assert.deepEqual(x.calls[0].args.p_agreement.specificationNotes,x.stored.contract.agreement2027.specificationNotes);assert.equal(x.calls[0].args.p_agreement.amountInWords,x.stored.contract.agreement2027.amountInWords);assert.equal(x.calls[0].args.p_agreement.fields.clientLegalName,'Contract legal name');assert.equal(x.calls[0].args.p_agreement.fields.ownerName,details.ownerName);assert.equal(x.calls[0].args.p_agreement.fields.ownerPhone,details.ownerPhone);assert.equal(x.calls[0].args.p_agreement.fields.executingEntity,details.executingEntity);assert.equal(x.calls[0].args.p_terms.length,19);assert.deepEqual(x.reads.map(read=>read.table),['sales_workflows']);assert.deepEqual({flow:x.stored,project:x.siteRow},x.before);
});
test('supplementary edits do not silently switch older contracts to the source PDF layout',async()=>{
 const x=setup({stage:'contract'});
 delete x.stored.contract.agreement2027.documentLayout;
 delete x.stored.contract.agreement2027.selectedProductsOnly;
 delete x.stored.contract.agreement2027.compactLayout;
 const before=structuredClone(x.stored);
 const details=emptyAgreement2027Fields();details.ownerName='Updated contract owner';
 assert.equal((await x.submit({action:'save-contract-details',details,confirmed:true})).status,200);
 assert.equal(Object.hasOwn(x.calls[0].args.p_agreement,'documentLayout'),false);
 assert.equal(Object.hasOwn(x.calls[0].args.p_agreement,'selectedProductsOnly'),false);
 assert.equal(Object.hasOwn(x.calls[0].args.p_agreement,'compactLayout'),false);
 assert.deepEqual(x.stored,before);
});
test('supplementary edits preserve the selected-products marker without changing older source layouts',async()=>{
 for(const selectedOnly of [true,undefined]){
  const x=setup({stage:'contract'});
  if(selectedOnly===undefined){delete x.stored.contract.agreement2027.selectedProductsOnly;delete x.stored.contract.agreement2027.compactLayout;}
  const before=structuredClone(x.stored);
  const details=emptyAgreement2027Fields();details.ownerName='Manually reviewed owner';
  assert.equal((await x.submit({action:'save-contract-details',details,confirmed:true,selectedProductsOnly:!selectedOnly})).status,200);
  assert.equal(x.calls[0].args.p_agreement.documentLayout,'source-pdf-2027');
  assert.equal(x.calls[0].args.p_agreement.selectedProductsOnly,selectedOnly);
  assert.equal(Object.hasOwn(x.calls[0].args.p_agreement,'selectedProductsOnly'),selectedOnly===true);
  assert.deepEqual(x.stored,before);
 }
});
test('supplementary edits preserve compact pagination choices on newly generated and previously issued source contracts',async()=>{
 for(const compact of [true,undefined]){
  const x=setup({stage:'contract'});
  if(compact===undefined)delete x.stored.contract.agreement2027.compactLayout;
  const before=structuredClone(x.stored);
  const details=emptyAgreement2027Fields();details.ownerName='Manually reviewed owner';
  assert.equal((await x.submit({action:'save-contract-details',details,confirmed:true,compactLayout:!compact})).status,200);
  const saved=x.calls[0].args.p_agreement;
  assert.equal(saved.documentLayout,'source-pdf-2027');assert.equal(saved.selectedProductsOnly,true);
  assert.equal(saved.compactLayout,compact);assert.equal(Object.hasOwn(saved,'compactLayout'),compact===true);
  assert.deepEqual(x.stored,before);
 }
});
for(const template of ['residential','commercial'])test(`supplementary edits retain the historical ${template} payments and terms exactly`,async()=>{
 const total=template==='residential'?10_000_001:quote.total;
 const percentages=template==='residential'?[100]:[25,25,25,15,10];
 const x=setup({stage:'contract'});
 x.stored.quotation.total=total;
 x.stored.contract.template=template;
 x.stored.contract.quotation.total=total;
 x.stored.contract.agreement2027.total=total;
 let allocated=0;
 x.stored.contract.agreement2027.paymentSchedule=percentages.map((percent,index)=>{
  const amount=index===percentages.length-1?total-allocated:Math.round(total*percent/100);allocated+=amount;
  return {id:`historical-${index}`,label:`Saved stage ${index}`,percent,amount,trigger:`Saved trigger ${index}`};
 });
 x.stored.contract.terms[2].text='Previously issued payment terms';
 const before=structuredClone(x.stored);
 const details=emptyAgreement2027Fields();details.ownerName='Updated owner name';
 const response=await x.submit({action:'save-contract-details',details,confirmed:true});
 assert.equal(response.status,200);
 assert.deepEqual(x.calls[0].args.p_agreement.paymentSchedule,before.contract.agreement2027.paymentSchedule);
 assert.deepEqual(x.calls[0].args.p_terms,before.contract.terms);
 assert.deepEqual(x.stored,before);
});
test('unsigned selected-type corrections replace only payments and preserve every issued layout marker',async()=>{
 const layouts=[{}, {documentLayout:'source-pdf-2027'}, {documentLayout:'source-pdf-2027',selectedProductsOnly:true}, {documentLayout:'source-pdf-2027',selectedProductsOnly:true,compactLayout:true}];
 for(const flags of layouts)for(const previous of ['residential','commercial'])for(const total of [10000001,25000001]){
  const x=setup({stage:'contract'}),target=previous==='residential'?'commercial':'residential';
  x.stored.quotation.total=total;x.stored.contract.quotation.total=total;x.stored.contract.template=previous;
  const saved=x.stored.contract.agreement2027;saved.total=total;
  for(const key of ['documentLayout','selectedProductsOnly','compactLayout'])delete saved[key];
  Object.assign(saved,flags);saved.fields.ownerName='Manual owner';saved.fields.directPhone='';
  x.stored.contract.terms[14].text='Preserved manually reviewed duration';
  const before=structuredClone(x.stored);
  const response=await x.submit({action:'change-contract-template',template:target,confirmed:true,agreement2027:{total:1},details:{ownerName:'FORGED'},compactLayout:!flags.compactLayout});
  assert.equal(response.status,200);assert.equal(x.calls.length,1);assert.equal(x.calls[0].name,'update_agreement_contract');
  const args=x.calls[0].args,agreement=args.p_agreement;
  assert.equal(args.p_template,target);assert.equal(args.p_actor,actorId);assert.equal(args.p_revision,4);
  for(const key of ['documentLayout','selectedProductsOnly','compactLayout']){assert.equal(Object.hasOwn(agreement,key),Object.hasOwn(flags,key));assert.equal(agreement[key],flags[key]);}
  assert.deepEqual({...agreement,paymentSchedule:undefined},{...before.contract.agreement2027,paymentSchedule:undefined});
  const expected=flags.documentLayout?(total<15000000?[100]:target==='residential'?[50,50]:[30,20,10,20,15,5]):target==='residential'?[50,50]:total<15000000?[100]:[25,25,25,15,10];
  assert.deepEqual(agreement.paymentSchedule.map(stage=>stage.percent),expected);assert.equal(agreement.paymentSchedule.reduce((n,stage)=>n+stage.amount,0),total);
  assert.deepEqual(args.p_terms.filter((_,index)=>index!==2),before.contract.terms.filter((_,index)=>index!==2));
  assert.match(args.p_terms[2].text,target==='residential'?/للمشاريع السكنية/:/للمشاريع التجارية/);
  assert.doesNotMatch(args.p_terms[2].text,target==='residential'?/للمشاريع التجارية/:/للمشاريع السكنية/);
  if(target==='commercial')assert.match(args.p_terms[2].text,flags.documentLayout?/30%/:/25%/);
  assert.deepEqual(x.reads.map(read=>read.table),['sales_workflows']);assert.deepEqual(x.stored,before);
 }
});
test('historical unified agreements cannot be converted to one selected payment branch',async()=>{
 const x=setup({stage:'contract'});x.stored.contract.template='unified';x.stored.contract.agreement2027=buildAgreement2027Snapshot(quote,'unified',emptyAgreement2027Fields());
 const before=structuredClone(x.stored),response=await x.submit({action:'change-contract-template',template:'commercial',confirmed:true});
 assert.equal(response.status,409);assert.deepEqual(x.calls,[]);assert.deepEqual(x.stored,before);
});
test('selected-type corrections reject unsigned-contract guard violations before RPC writes',async()=>{
 for(const patch of [{signed_at:'2026-11-15T10:00:00Z'},{evidence:{method:'hard_copy'}},{accepted_at:'2026-11-15T10:00:00Z'},{accepted_by:'operations'},{stage:'signed'}]){
  const x=setup({stage:'contract',flowPatch:patch});
  assert.equal((await x.submit({action:'change-contract-template',template:'commercial',confirmed:true})).status,409);assert.deepEqual(x.calls,[]);
 }
 for(const patch of [{confirmed:false},{revision:3},{template:'residential'},{template:'unified'}]){
  const x=setup({stage:'contract'});assert.ok([400,409].includes((await x.submit({action:'change-contract-template',template:'commercial',confirmed:true,...patch})).status));assert.deepEqual(x.calls,[]);
 }
});
test('unified supplementary edits retain both saved payment policies, terms and approved prices',async()=>{
 const x=setup({stage:'contract'});
 x.stored.contract.template='unified';
 x.stored.contract.terms=agreement2027Terms('unified');
 x.stored.contract.agreement2027=buildAgreement2027Snapshot(quote,'unified',emptyAgreement2027Fields());
 const before=structuredClone(x.stored);
 const details=emptyAgreement2027Fields();details.ownerName='Updated owner';
 const response=await x.submit({action:'save-contract-details',details,confirmed:true,paymentSchedules:[],terms:[]});
 assert.equal(response.status,200);
 const args=x.calls[0].args;
 assert.equal(args.p_template,'unified');
 assert.deepEqual(args.p_agreement.paymentSchedule,[]);
 assert.deepEqual(args.p_agreement.paymentSchedules,before.contract.agreement2027.paymentSchedules);
 assert.deepEqual(args.p_terms,before.contract.terms);
 assert.deepEqual(x.stored,before);
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
