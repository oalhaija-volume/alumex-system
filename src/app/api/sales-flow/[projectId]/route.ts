import { NextResponse } from 'next/server';
import { uploadedContractTerms } from '@/lib/contracts/uploadedTerms';
import { salesProject } from '@/lib/workflow/access';
import { priceQuotation, type CatalogItem, type OpeningChoice, type AdditionalChoice } from '@/lib/workflow/pricing';
import { quotationOpenings } from '@/lib/workflow/quotationOpenings';
import type { Json } from '@/lib/supabase/database.types';
import type { SalesFlow } from '@/lib/workflow/types';
type Context={params:Promise<{projectId:string}>};
const unavailable='The sales workflow database update is required. Ask the administrator to apply the prepared migration.';
export async function GET(request:Request,context:Context){
 const {projectId}=await context.params;const access=await salesProject(projectId);if(access.response)return access.response;
 const {admin,project}=access;
 const [flow,openings,catalog,client,history]=await Promise.all([
  admin.from('sales_workflows').select('*').eq('project_id',projectId).maybeSingle(),
  admin.from('openings').select('id,floor,room,width,height,opening_type,opening_direction').eq('project_id',projectId).order('created_at'),
  admin.from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').eq('is_active',true).order('product_name'),
  admin.from('clients').select('name:client_name,mobile,client_type').eq('id',project.client_id).single(),
  admin.from('quotation_revisions').select('version,quotation,contract,previous_stage,superseded_at').eq('project_id',projectId).order('version',{ascending:false})
 ]);
 if(flow.error||history.error)return NextResponse.json({error:unavailable},{status:503});
 if(openings.error||catalog.error||client.error)return NextResponse.json({error:'Unable to load quotation information.'},{status:500});
 if(new URL(request.url).searchParams.get('download')==='signed'){
  const evidence=(flow.data as unknown as SalesFlow|null)?.evidence;
  if(evidence?.method!=='upload'||!evidence.path)return NextResponse.json({error:'Signed file not found.'},{status:404});
  const file=await admin.storage.from('signed-contracts-private').download(evidence.path);
  if(file.error||!file.data)return NextResponse.json({error:'Unable to retrieve signed file.'},{status:500});
  return new Response(file.data,{headers:{'Content-Type':file.data.type,'Content-Disposition':'attachment; filename="signed-contract"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 return NextResponse.json({project,client:client.data,flow:flow.data,openings:openings.data,catalog:catalog.data,history:history.data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request,context:Context){
 const {projectId}=await context.params;const access=await salesProject(projectId);if(access.response)return access.response;
 const {admin,auth,project}=access;
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
 if(!['save','approve','contract','sign'].includes(String(action))||!Number.isInteger(revision)||revision!==(flow?.revision??0))return NextResponse.json({error:'The project changed. Reload and try again.'},{status:409});
 let payload:Json={};let uploadedPath:string|null=null;
 try{
  if(action==='save'){
   if(flow && (flow.signed_at || !['quotation','approved','contract'].includes(flow.stage)))throw new Error('Signed contracts cannot be changed.');
   if(flow?.stage==='contract' && body.replaceUnsignedContract!==true)throw new Error('Confirm that this revision replaces the unsigned contract and requires new client approval.');
   const [openings,catalog]=await Promise.all([admin.from('openings').select('id,floor,room,width,height,opening_type,opening_direction').eq('project_id',projectId).order('created_at'),admin.from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active').eq('is_active',true)]);
   if(openings.error||catalog.error)throw new Error('Unable to load pricing.');
   if(!Array.isArray(body.choices))throw new Error('Select a system for every opening.');
   const measured=quotationOpenings(openings.data??[],body.newOpenings??[]);
   payload=priceQuotation(measured,body.choices as OpeningChoice[],catalog.data as CatalogItem[],auth.user.id,(body.additionalItems??[]) as AdditionalChoice[]) as unknown as Json;
  }
  if(action==='approve' && body.confirmed!==true)throw new Error('Confirm that the client approved this quotation.');
  if(action==='contract'){
   const kind=body.template;
   if(kind!=='residential'&&kind!=='commercial')throw new Error('Choose the residential or commercial contract template.');
   const client=await admin.from('clients').select('name:client_name,mobile,client_type').eq('id',project.client_id).single();
   if(client.error)throw new Error('Unable to load client information.');
   const sections=uploadedContractTerms(kind);
   payload={number:`CT-${project.project_number}-${revision}`,createdAt:new Date().toISOString(),client:client.data,project:{name:project.project_name,number:project.project_number,address:project.address},terms:sections,template:kind};
  }
  if(action==='sign'){
   if(flow?.stage!=='contract')throw new Error('Only an unsigned generated contract can be signed.');
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
   }else throw new Error('Choose digital signing or upload a signed copy.');
  }
  const result=await admin.rpc('advance_sales_flow',{p_project:projectId,p_action:String(action),p_revision:revision as number,p_payload:payload,p_actor:auth.user.id});
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
