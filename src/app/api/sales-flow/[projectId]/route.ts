import { NextResponse } from 'next/server';
import { uploadedContractTerms } from '@/lib/contracts/uploadedTerms';
import { salesProject } from '@/lib/workflow/access';
import { applyQuotationDiscount, repriceQuotation, quotationPriceKey, QUOTATION_DISCOUNTS_ENABLED, type CatalogItem, type OpeningChoice, type AdditionalChoice } from '@/lib/workflow/pricing';
import { normalizeExcludedOpeningIds, quotationOpenings } from '@/lib/workflow/quotationOpenings';
import { applyOpeningSizeChanges, normalizeOpeningSizeChanges, priceQuotationWithSizeChanges, type OpeningSizeChange, type OpeningSizeHistory } from '@/lib/workflow/openingSizeChanges';
import type { Json } from '@/lib/supabase/database.types';
import type { SalesFlow } from '@/lib/workflow/types';
type Context={params:Promise<{projectId:string}>};
const unavailable='The sales workflow database update is required. Ask the administrator to apply the prepared migration.';
export async function GET(request:Request,context:Context){
 const {projectId}=await context.params;const access=await salesProject(projectId,'commercial',true);if(access.response)return access.response;
 const {admin,project}=access;
 const [flow,openings,catalog,client,history]=await Promise.all([
  admin.from('sales_workflows').select('*').eq('project_id',projectId).maybeSingle(),
  admin.from('openings').select('id,floor,room,width,height,quantity,work_area,facade_number,has_arch,has_roller_shutter,opening_type,opening_direction').eq('project_id',projectId).order('created_at'),
  admin.from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').eq('is_active',true).order('product_name'),
  admin.from('clients').select('name:client_name,mobile,client_type').eq('id',project.client_id).single(),
  admin.from('quotation_revisions').select('version,quotation,contract,previous_stage,superseded_at').eq('project_id',projectId).order('version',{ascending:false})
 ]);
 if(flow.error||history.error)return NextResponse.json({error:unavailable},{status:503});
 if(openings.error||catalog.error||client.error)return NextResponse.json({error:'Unable to load quotation information.'},{status:500});
 if(new URL(request.url).searchParams.get('download')==='signed'){
  if(access.quotationAccess==='prices')return NextResponse.json({error:'Shared access is limited to the quotation and its prices.'},{status:403});
  const evidence=(flow.data as unknown as SalesFlow|null)?.evidence;
  if(evidence?.method!=='upload'||!evidence.path)return NextResponse.json({error:'Signed file not found.'},{status:404});
  const file=await admin.storage.from('signed-contracts-private').download(evidence.path);
  if(file.error||!file.data)return NextResponse.json({error:'Unable to retrieve signed file.'},{status:500});
  return new Response(file.data,{headers:{'Content-Type':file.data.type,'Content-Disposition':'attachment; filename="signed-contract"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(access.quotationAccess==='prices'){
  const {id,project_number,project_name,address,building_type,branch,governorate,sales_status,additional_openings_state}=project;
  return NextResponse.json({quotationAccess:'prices',project:{id,project_number,project_name,address,building_type,branch,governorate,sales_status,additional_openings_state},client:client.data,flow:flow.data?{...flow.data,contract:null,evidence:flow.data.evidence?{recorded:true}:null}:null,openings:openings.data,catalog:catalog.data,history:[],sizeHistory:[]},{headers:{'Cache-Control':'private, no-store'}});
 }
 // Old installations can continue opening quotations until the size-edit
 // migration is applied. Existing revision snapshots still remain available.
 let sizeHistory:OpeningSizeHistory[]=[];let sizeHistoryError:string|undefined;
 try{
  const audit=await admin.from('opening_size_history').select('*').eq('project_id',projectId).order('changed_at',{ascending:false});
  if(audit.error){
   if(!['42P01','PGRST205'].includes(audit.error.code))sizeHistoryError='Unable to load size change history.';
  }else if(audit.data?.length){
   const ids=[...new Set(audit.data.map(row=>row.changed_by))];
   const people=await admin.from('profiles').select('id,full_name,username').in('id',ids);
   const names=new Map((people.data??[]).map(person=>[person.id,person.full_name||person.username||'Employee']));
   sizeHistory=audit.data.map(row=>({...row,changed_by_name:names.get(row.changed_by)??'Employee'}));
   if(people.error)sizeHistoryError='Unable to load size change history.';
  }
 }catch{sizeHistoryError='Unable to load size change history.';}
 return NextResponse.json({project,client:client.data,flow:flow.data,openings:openings.data,catalog:catalog.data,history:history.data,sizeHistory,...(sizeHistoryError?{sizeHistoryError}:{})},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request,context:Context){
 const {projectId}=await context.params;const access=await salesProject(projectId,'commercial',true);if(access.response)return access.response;
 const {admin,auth,project}=access;
 if(['cancelled','lost','closed'].includes(project.sales_status))return NextResponse.json({error:'This project is closed. Its quotation and contract history is read-only.'},{status:409});
 const saved=await admin.from('sales_workflows').select('*').eq('project_id',projectId).maybeSingle();
 if(saved.error)return NextResponse.json({error:unavailable},{status:503});
 const flow=saved.data as unknown as SalesFlow|null;
 let body:Record<string,unknown>;let upload:File|null=null;
 if(request.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(request.headers.get('content-length'))>4*1024*1024)return NextResponse.json({error:'Maximum file size is 3 MB.'},{status:413});
  const form=await request.formData().catch(()=>null);if(!form)return NextResponse.json({error:'Invalid upload.'},{status:400});
  body={action:'sign',revision:Number(form.get('revision')),method:'upload',signer:form.get('signer'),consent:form.get('consent')==='true'};
  const file=form.get('file');upload=file instanceof File?file:null;
 }else{body=await request.json().catch(()=>({}));}
 const action=body.action;const revision=body.revision;
 if(access.quotationAccess==='prices'&&action!=='save-shared-prices')return NextResponse.json({error:'Shared access permits quotation price editing only.'},{status:403});
 if(action==='save-shared-prices'){
  if(!Number.isInteger(revision)||revision!==flow?.revision)return NextResponse.json({error:'The project changed. Reload and try again.'},{status:409});
  if(!flow||flow.signed_at||flow.evidence||flow.accepted_at||flow.accepted_by||!['quotation','approved','contract'].includes(flow.stage)||['contract_signed','transferred_to_operations'].includes(project.sales_status))return NextResponse.json({error:'Signed contracts cannot be changed.'},{status:409});
  if(project.additional_openings_state)return NextResponse.json({error:'Complete the additional measurements and save a quotation revision before continuing.'},{status:409});
  if(flow.stage==='contract'&&body.replaceUnsignedContract!==true)return NextResponse.json({error:'Confirm that this revision replaces the unsigned contract and requires new client approval.'},{status:400});
  const catalog=await admin.from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').eq('is_active',true);
  if(catalog.error)return NextResponse.json({error:'Unable to load pricing.'},{status:500});
  try{
   const {reviseSharedQuotationPrices}=await import('@/lib/quotations/sharedPrices');
   const quotation=reviseSharedQuotationPrices(flow.quotation,{systemRates:body.systemRates,additionalRates:body.additionalRates},catalog.data as CatalogItem[],auth.user.id);
   const result=await admin.rpc('advance_sales_flow',{p_project:projectId,p_action:'save',p_revision:revision as number,p_payload:quotation as unknown as Json,p_actor:auth.user.id});
   if(result.error)return NextResponse.json({error:result.error.message},{status:result.error.code==='42501'?403:409});
   return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
  }catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:'Unable to update quotation prices.'},{status:400});}
 }
 if(project.additional_openings_state==='requested'||(project.additional_openings_state==='submitted'&&action!=='save'))return NextResponse.json({error:'Complete the additional measurements and save a quotation revision before continuing.'},{status:409});
 if(!['save','approve','contract','sign','preview-prices','update-prices','set-discount','change-contract-template','save-contract-details'].includes(String(action))||!Number.isInteger(revision)||revision!==(flow?.revision??0))return NextResponse.json({error:'The project changed. Reload and try again.'},{status:409});
 if(!QUOTATION_DISCOUNTS_ENABLED&&(action==='set-discount'||['save','preview-prices','update-prices'].includes(String(action))&&body.discountPercent===5))return NextResponse.json({error:'Quotation discounts are temporarily unavailable.'},{status:403});
 let payload:Json={};let uploadedPath:string|null=null;let sizeChanges:OpeningSizeChange[]=[];
 try{
  if(action!=='save'&&body.openingSizeChanges!==undefined)throw new Error('Save opening size changes with a quotation revision.');
  if(action==='save-contract-details'){
   if(flow?.signed_at||flow?.evidence||flow?.accepted_at||flow?.accepted_by||['contract_signed','transferred_to_operations'].includes(project.sales_status))return NextResponse.json({error:'Signed contracts cannot be changed.'},{status:409});
   if(!flow?.contract||flow.stage!=='contract'||project.sales_status!=='contract_generated'||flow.contract.agreement2027?.version!=='agreement-2027')return NextResponse.json({error:'Only an unsigned 2027 contract can have its details changed.'},{status:409});
   if(body.confirmed!==true)throw new Error('Confirm that you want to save the contract details.');
   const kind=flow.contract.template;
   if(kind!=='residential'&&kind!=='commercial'&&kind!=='unified')throw new Error('The saved contract template is invalid.');
   const {normalizeAgreement2027Fields}=await import('@/lib/contracts/agreement2027Server');
   const fields=normalizeAgreement2027Fields(body.details);
   const agreement={...flow.contract.agreement2027,fields};
   const result=await admin.rpc('update_agreement_contract',{p_project:projectId,p_revision:revision as number,p_agreement:agreement as unknown as Json,p_terms:flow.contract.terms as unknown as Json,p_template:kind,p_actor:auth.user.id});
   if(result.error)throw new Error(result.error.message);
   return NextResponse.json({flow:result.data},{headers:{'Cache-Control':'no-store'}});
  }
  if(action==='change-contract-template'){
   if(flow?.signed_at||flow?.evidence||flow?.accepted_at||flow?.accepted_by||['contract_signed','transferred_to_operations'].includes(project.sales_status))return NextResponse.json({error:'Signed contracts cannot be changed.'},{status:409});
   if(!flow?.contract||flow.stage!=='contract'||project.sales_status!=='contract_generated')return NextResponse.json({error:'Only an unsigned generated contract can have its type changed.'},{status:409});
   if(flow.contract.template==='unified')return NextResponse.json({error:'The saved unified agreement cannot be changed to a single contract type.'},{status:409});
   const kind=body.template;
   if(kind!=='residential'&&kind!=='commercial')throw new Error('Choose the residential or commercial contract template.');
   if(body.confirmed!==true)throw new Error('Confirm that you want to change the contract type.');
   if(kind===flow.contract.template)throw new Error('Choose a different contract type.');
   if(flow.contract.agreement2027?.version==='agreement-2027'){
    const savedAgreement=flow.contract.agreement2027;
    const source=savedAgreement.documentLayout==='source-pdf-2027';
    const {agreement2027PaymentSchedule,agreement2027Terms}=await import('@/lib/contracts/agreement2027Content');
    const {legacyAgreement2027PaymentSchedule,legacyAgreement2027Terms}=await import('@/lib/contracts/agreement2027LegacyPolicy');
    // A type correction replaces its payment branch, retaining the issued
    // layout, manual details and all other saved contract information.
    const agreement={...savedAgreement,paymentSchedule:source?agreement2027PaymentSchedule(savedAgreement.total,kind):legacyAgreement2027PaymentSchedule(savedAgreement.total,kind)};
    const terms=source?flow.contract.terms.map((section,index)=>index===2?agreement2027Terms(kind)[2]:section):legacyAgreement2027Terms(flow.contract.terms,kind);
    const result=await admin.rpc('update_agreement_contract',{p_project:projectId,p_revision:revision as number,p_agreement:agreement as unknown as Json,p_terms:terms as unknown as Json,p_template:kind,p_actor:auth.user.id});
    if(result.error)throw new Error(result.error.message);
    return NextResponse.json({flow:result.data},{headers:{'Cache-Control':'no-store'}});
   }
   payload={template:kind,terms:uploadedContractTerms(kind)};
  }
  if(action==='set-discount'){
   if(!flow)throw new Error('Save a quotation before changing its discount.');
   if(flow.signed_at||!['quotation','approved','contract'].includes(flow.stage)||['contract_signed','transferred_to_operations'].includes(project.sales_status))return NextResponse.json({error:'Signed contracts cannot be changed.'},{status:409});
   if(flow.stage==='contract'&&body.replaceUnsignedContract!==true)throw new Error('Confirm that this revision replaces the unsigned contract and requires new client approval.');
   if(!Object.hasOwn(body,'discountPercent'))throw new Error('Choose either no discount or the 5% quotation discount.');
   payload={...applyQuotationDiscount(flow.quotation,body.discountPercent),createdAt:new Date().toISOString(),preparedBy:auth.user.id} as unknown as Json;
  }
  if(action==='preview-prices'||action==='update-prices'){
   if(project.additional_openings_state)return NextResponse.json({error:'Complete the additional measurements and save a quotation revision before continuing.'},{status:409});
   if(!flow)return NextResponse.json({error:'Save a quotation before updating its prices.'},{status:409});
   if(flow.signed_at||!['quotation','approved','contract'].includes(flow.stage)||['contract_signed','transferred_to_operations'].includes(project.sales_status))return NextResponse.json({error:'Signed contracts cannot be changed.'},{status:409});
   if(action==='update-prices'&&body.confirmed!==true)throw new Error('Confirm that you want to update prices for this quotation.');
   if(action==='update-prices'&&flow.stage==='contract'&&body.replaceUnsignedContract!==true)throw new Error('Confirm that this revision replaces the unsigned contract and requires new client approval.');
   const catalog=await admin.from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').eq('is_active',true);
   if(catalog.error)throw new Error('Unable to load pricing.');
   const repriced=repriceQuotation(flow.quotation,catalog.data as CatalogItem[],auth.user.id);
   const quotation=QUOTATION_DISCOUNTS_ENABLED?repriced:applyQuotationDiscount(repriced,0);
   const priceKey=quotationPriceKey(quotation);
   if(action==='preview-prices')return NextResponse.json({quotation,priceKey,revision:flow.revision},{headers:{'Cache-Control':'private, no-store'}});
   if(body.priceKey!==priceKey)return NextResponse.json({error:'Catalog prices changed. Preview the updated prices again before saving.'},{status:409});
   payload=quotation as unknown as Json;
  }
  if(action==='save'){
   if(flow && (flow.signed_at || !['quotation','approved','contract'].includes(flow.stage)))throw new Error('Signed contracts cannot be changed.');
   if(flow?.stage==='contract' && body.replaceUnsignedContract!==true)throw new Error('Confirm that this revision replaces the unsigned contract and requires new client approval.');
   const [openings,catalog]=await Promise.all([admin.from('openings').select('id,floor,room,width,height,quantity,work_area,facade_number,has_arch,has_roller_shutter,opening_type,opening_direction').eq('project_id',projectId).order('created_at'),admin.from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').eq('is_active',true)]);
   if(openings.error||catalog.error)throw new Error('Unable to load pricing.');
   if(!Array.isArray(body.choices))throw new Error('Select a system for every opening.');
   sizeChanges=normalizeOpeningSizeChanges(openings.data??[],body.openingSizeChanges===undefined?[]:body.openingSizeChanges);
   if(sizeChanges.length){
    if(flow?.signed_at||flow?.evidence||flow?.accepted_at||flow?.accepted_by||['contract_signed','transferred_to_operations'].includes(project.sales_status))return NextResponse.json({error:'Signed contracts cannot be changed.'},{status:409});
    if(project.additional_openings_state)return NextResponse.json({error:'Save the additional measurements in a quotation revision before changing opening sizes.'},{status:409});
   }
   const resized=applyOpeningSizeChanges(openings.data??[],sizeChanges);
   const allMeasured=quotationOpenings(resized,body.newOpenings??[]);
   if(allMeasured.slice(resized.length).some(opening=>opening.opening_type==='Facade')&&project.building_type!=='commercial_building')throw new Error('Facade and Internal works are only available for commercial buildings.');
   const excludedOpeningIds=normalizeExcludedOpeningIds(openings.data??[],body.excludedOpeningIds===undefined?flow?.quotation.excludedOpeningIds??[]:body.excludedOpeningIds);
   const excluded=new Set(excludedOpeningIds);
   if(sizeChanges.some(change=>excluded.has(change.openingId)))throw new Error('Restore the opening to the quotation before changing its size.');
   const measured=allMeasured.filter(opening=>!excluded.has(opening.id));
   const discountPercent=body.discountPercent===undefined?(QUOTATION_DISCOUNTS_ENABLED?flow?.quotation.discount?.percent??0:0):body.discountPercent;
   // Pricing exceptions can only come from the stored, authorized quotation.
   // Ignore client-supplied policy fields when building a new revision.
   payload={...priceQuotationWithSizeChanges(measured,body.choices as OpeningChoice[],catalog.data as CatalogItem[],auth.user.id,(body.additionalItems??[]) as AdditionalChoice[],discountPercent,flow?.quotation,sizeChanges,flow?.quotation.pricingPolicy),...(sizeChanges.length?{openingSizeChanges:sizeChanges,replaceUnsignedContract:body.replaceUnsignedContract===true}:{}),...(excludedOpeningIds.length?{excludedOpeningIds}:{}),branch:project.branch,governorate:project.governorate??null} as unknown as Json;
  }
  if(action==='approve' && body.confirmed!==true)throw new Error('Confirm that the client approved this quotation.');
  if(action==='contract'){
   if(!flow||flow.stage!=='approved'||flow.signed_at||project.sales_status!=='quotation_approved')throw new Error('Generate the contract from a client-approved quotation first.');
   const kind=body.template;
   if(kind!=='residential'&&kind!=='commercial')throw new Error('Choose the residential or commercial contract template.');
   let branch=project.branch;
   if((auth.role === 'Indoor Sales' || auth.role === 'Sales Manager')){
    const creator=await admin.from('profiles').select('branch').eq('id',auth.user.id).single();
    if(creator.error)throw new Error('Unable to load your employee branch.');
    if(creator.data.branch!=='Karkh'&&creator.data.branch!=='Rasafa'&&creator.data.branch!=='Najaf')throw new Error('Ask Admin to assign your branch before generating a contract.');
    branch=creator.data.branch;
   }
   const [{formatWorkflowContractNumber},{effectiveProjectBranch}]=await Promise.all([
    import('@/lib/contracts/numbering'),import('@/lib/auth/projectBranchAccess')
   ]);
   const numberBranch=auth.role==='Indoor Sales'||auth.role==='Sales Manager'?branch:effectiveProjectBranch(project);
   const number=formatWorkflowContractNumber(numberBranch,project.project_number,revision as number);
   const {loadAgreement2027Snapshot,agreement2027Terms}=await import('@/lib/contracts/agreement2027Server');
   const agreement2027=await loadAgreement2027Snapshot(admin,projectId,flow.quotation,kind,auth.user.id);
   const client={name:agreement2027.fields.clientLegalName,mobile:agreement2027.fields.directPhone||null,client_type:agreement2027.fields.clientClassification==='شركة'?'company':agreement2027.fields.clientClassification==='فرد'?'individual':null};
   payload={number,createdAt:new Date().toISOString(),createdBy:auth.user.id,branch,client,project:{branch:project.branch,governorate:project.governorate??null,name:project.project_name,number:project.project_number,address:project.address},terms:agreement2027Terms(kind),template:kind,agreement2027} as unknown as Json;
  }
  if(action==='sign'){
   if(flow?.stage!=='contract')throw new Error('Only an unsigned generated contract can be signed.');
   if(body.method==='hard_copy'&&(flow.signed_at||flow.evidence||flow.accepted_at||flow.accepted_by||project.sales_status!=='contract_generated'))throw new Error('Only an unsigned generated contract can be signed.');
   const signer=typeof body.signer==='string'?body.signer.trim():'';
   if(!signer || signer.length>150 || body.consent!==true)throw new Error('Enter the signer’s name and confirm the contract has been signed.');
   if(body.method==='digital'){
    const signature=typeof body.signature==='string'?body.signature:'';
    if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)||signature.length<500||signature.length>2e6)throw new Error('Please sign in the signature box.');
    const bytes=Buffer.from(signature.split(',')[1],'base64');
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid signature image.');
    payload={method:'digital',signer,signature};
   }else if(body.method==='upload'){
    if(!upload||upload.size===0||upload.size>3*1024*1024)throw new Error('Upload the signed PDF, PNG or JPEG, up to 3 MB.');
    const bytes=Buffer.from(await upload.arrayBuffer());
    const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'image/png':bytes.subarray(0,3).toString('hex')==='ffd8ff'?'image/jpeg':null;
    if(!mime)throw new Error('The uploaded file must be a PDF, PNG or JPEG.');
    const path=`${projectId}/${crypto.randomUUID()}`;
    const result=await admin.storage.from('signed-contracts-private').upload(path,bytes,{contentType:mime,upsert:false});
    if(result.error)throw new Error('Unable to store signed document.');
    uploadedPath=path;payload={method:'upload',signer,path,fileName:upload.name.slice(0,200)};
   }else if(body.method==='hard_copy'){
    payload={method:'hard_copy',signer,confirmed:true};
   }else throw new Error('Choose digital signing, upload a signed copy, or record a hard-copy signature.');
  }
  const result=sizeChanges.length
   ?await admin.rpc('save_quotation_with_opening_sizes',{p_project:projectId,p_revision:revision as number,p_payload:payload,p_actor:auth.user.id})
   :await admin.rpc('advance_sales_flow',{p_project:projectId,p_action:action==='update-prices'||action==='set-discount'?'save':String(action),p_revision:revision as number,p_payload:payload,p_actor:auth.user.id});
  if(sizeChanges.length&&result.error?.code==='PGRST202')return NextResponse.json({error:unavailable},{status:503});
  if(result.error)throw new Error(result.error.message);
  return NextResponse.json({flow:result.data},{headers:{'Cache-Control':'no-store'}});
 }catch(cause){
  // A network error can arrive after the transaction committed. Preserve its evidence.
  if(uploadedPath){
   const current=await admin.from('sales_workflows').select('*').eq('project_id',projectId).maybeSingle();
   const persisted=current.data as unknown as SalesFlow|null;
   if(!current.error && persisted?.evidence?.path===uploadedPath && persisted.signed_at)return NextResponse.json({flow:current.data},{headers:{'Cache-Control':'no-store'}});
   if(!current.error)await admin.storage.from('signed-contracts-private').remove([uploadedPath]);
  }
  return NextResponse.json({error:cause instanceof Error?cause.message:'Unable to update project.'},{status:400});
 }
}
