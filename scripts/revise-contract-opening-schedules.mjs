import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const formatVersion='billable-opening-schedule-v1';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
class BatchError extends Error {}
function ensure(condition,message){if(!condition)throw new BatchError(message);}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const publicError=error=>error instanceof BatchError?error.message:'Database or filesystem operation failed; no credentials or source records are printed.';
export function errorMetadata(error){
 return Object.fromEntries([['code',error?.code],['constraint',error?.constraint_name],['routine',error?.routine],['type',error?.name]]
  .filter(([,value])=>typeof value==='string'&&/^[A-Za-z_0-9]{1,128}$/.test(value)));
}
export const revisionRequests=(sql,sources)=>sql.json(sources.map(source=>({project_id:source.project.id,source_revision:source.flow.revision})));

export function parseArguments(args){
 const options={apply:false,help:false};
 for(const argument of args){
  const [key,...parts]=argument.split('='),value=parts.join('=');
  ensure(['--apply','--help','--actor','--manifest'].includes(key),'Unknown command option.');
  const name=key.slice(2);ensure(!Object.hasOwn(options,name)||options[name]===false,'Duplicate command option.');
  if(['apply','help'].includes(name)){ensure(!parts.length,'Flags cannot contain a value.');options[name]=true;}
  else{ensure(value.length>0,'Command option requires a value.');options[name]=value;}
 }
 if(options.apply)ensure(uuid.test(options.actor??'')&&options.manifest,'Apply requires --actor=<Admin UUID> and --manifest=<reviewed manifest path>.');
 else ensure(!options.manifest&&!options.actor,'Actor and manifest options require --apply.');
 return options;
}

export function validateTarget(config){
 ensure(config.DATABASE_URL&&config.NEXT_PUBLIC_SUPABASE_URL,'Repository database configuration is incomplete.');
 let connection,service;try{connection=new URL(config.DATABASE_URL);service=new URL(config.NEXT_PUBLIC_SUPABASE_URL);}catch{throw new BatchError('Repository database configuration is invalid.');}
 const ref=service.hostname.split('.')[0];
 ensure(service.protocol==='https:'&&service.hostname===`${ref}.supabase.co`&&['postgres:','postgresql:'].includes(connection.protocol),'Repository Supabase target is invalid.');
 ensure(connection.hostname===`db.${ref}.supabase.co`||(connection.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(connection.username)===`postgres.${ref}`),'Database target does not match this repository Supabase project.');
}

export function quotationSummary(contract){
 const quote=contract?.quotation;ensure(quote&&Array.isArray(quote.lines),'Every source contract must contain its saved quotation.');
 let billableArea=0,openingCount=0;
 for(const line of quote.lines){
  const count=line.opening?.quantity??1;ensure(Number.isSafeInteger(count)&&count>0,'Invalid saved opening count.');openingCount+=count;
  if(line.system?.unit==='sqm'){ensure(Number.isFinite(line.system.quantity)&&line.system.quantity>=0,'Invalid saved billable quantity.');billableArea+=line.system.quantity;}
 }
 for(const item of quote.additionalItems??[])if(item.unit==='sqm'&&!item.projectAddon){ensure(Number.isFinite(item.quantity)&&item.quantity>=0,'Invalid saved standalone billable quantity.');billableArea+=item.quantity;}
 ensure(Number.isFinite(billableArea)&&Number.isSafeInteger(openingCount),'Invalid saved quotation quantity totals.');
 ensure(Number.isSafeInteger(quote.total)&&quote.total>=0,'Invalid saved quotation total.');
 return {openingRows:quote.lines.length,openingCount,billableArea:Number(billableArea.toFixed(8)),total:quote.total,currency:quote.currency};
}

export function createManifest(sources,generatedAt=new Date().toISOString()){
 const rows=sources.map(source=>{
  const {flow,project}=source,contract=flow.contract,agreement=contract.agreement2027??{};
  return {projectId:project.id,projectNumber:project.project_number,sourceWorkflowRevision:flow.revision,contractNumber:contract.number,signed:!!flow.signed_at,
   summary:quotationSummary(contract),sourceSha256:fingerprint(source),quotationSha256:fingerprint(contract.quotation),
   termsPaymentsSha256:fingerprint({terms:contract.terms,total:agreement.total??null,amountInWords:agreement.amountInWords??null,paymentSchedule:agreement.paymentSchedule??null,paymentSchedules:agreement.paymentSchedules??null})};
 });
 return {schemaVersion:1,formatVersion,generatedAt,sourceCount:rows.length,signedCount:rows.filter(row=>row.signed).length,unsignedCount:rows.filter(row=>!row.signed).length,originalsSha256:fingerprint(sources),rows};
}

export function verifyManifest(manifest,sources){
 const current=createManifest(sources,manifest.generatedAt);
 ensure(fingerprint(manifest)===fingerprint(current),'Reviewed manifest no longer matches the complete current contract inventory. Run a new dry run.');
}
export function verifySourceIds(records,sources){
 const actual=records.map(row=>row.project_id).sort(),expected=sources.map(source=>source.project.id).sort();
 ensure(new Set(actual).size===sources.length&&fingerprint(actual)===fingerprint(expected),'The complete current contract inventory differs from the reviewed backup.');
}
export function verifySourceSnapshots(records,sources){
 verifySourceIds(records,sources);
 ensure(records.every(row=>row.flow_matches===true&&row.project_matches===true&&row.history_matches===true),'A saved workflow, project or quotation history differs from the reviewed backup.');
}
export function assembleRestInventory(flows,projects,history){
 const activeProjects=new Map(projects.filter(project=>project.archived_at==null).map(project=>[project.id,project]));
 const grouped=new Map();
 for(const entry of history){const entries=grouped.get(entry.project_id)??[];entries.push(entry);grouped.set(entry.project_id,entries);}
 return flows.filter(flow=>flow.contract!=null&&activeProjects.has(flow.project_id)).map(flow=>({flow,project:activeProjects.get(flow.project_id),history:(grouped.get(flow.project_id)??[]).sort((a,b)=>a.version-b.version)})).sort((a,b)=>a.project.id.localeCompare(b.project.id));
}

export async function restInventory(config,fetcher=fetch){
 ensure(config.SUPABASE_SERVICE_ROLE_KEY,'Repository REST inventory configuration is incomplete.');
 const deadline=Date.now()+45000,headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,Accept:'application/json'};
 async function pages(table,filters,order){
  const rows=[];
  for(let offset=0;;offset+=1000){
   ensure(Date.now()<deadline,'Current contract inventory request timed out.');
   const url=new URL(`/rest/v1/${table}`,config.NEXT_PUBLIC_SUPABASE_URL);
   for(const [key,value] of Object.entries({select:'*',...filters,order,offset:String(offset),limit:'1000'}))url.searchParams.set(key,value);
   let page;
   try{const response=await fetcher(url,{headers,cache:'no-store',signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});ensure(response.ok,'Unable to read current contract inventory.');page=await response.json();}
   catch{throw new BatchError('Unable to read current contract inventory.');}
   ensure(Array.isArray(page)&&page.length<=1000,'Current contract inventory returned an invalid page.');rows.push(...page);
   if(page.length<1000)return rows;
  }
 }
 async function scoped(table,ids,filters,order){
  const rows=[];
  for(let offset=0;offset<ids.length;offset+=100){const chunk=ids.slice(offset,offset+100);ensure(chunk.every(id=>uuid.test(id)),'The inventory contains an invalid project identity.');rows.push(...await pages(table,{...filters,[table==='projects'?'id':'project_id']:`in.(${chunk.join(',')})`},order));}
  return rows;
 }
 const flows=await pages('sales_workflows',{contract:'not.is.null'},'project_id.asc');
 const projects=await scoped('projects',[...new Set(flows.map(flow=>flow.project_id))],{archived_at:'is.null'},'id.asc');
 const activeIds=projects.filter(project=>project.archived_at==null).map(project=>project.id);
 const history=await scoped('quotation_revisions',activeIds,{},'project_id.asc,version.asc');
 return assembleRestInventory(flows,projects,history);
}

function immutableContract(contract){
 const result=structuredClone(contract);
 for(const key of ['number','createdAt','createdBy','approvedAt'])delete result[key];
 const fields=result.agreement2027?.fields;
 if(fields){fields.companyRepresentativeSignature='';fields.companyRepresentativeDate='';for(const approval of Object.values(fields.approvals??{})){approval.signature='';approval.date='';}}
 return result;
}

export function verifyRevision(row,source,actor){
 const original=source.flow.contract;
 ensure(row&&row.project_id===source.project.id&&row.source_workflow_revision===source.flow.revision&&row.format_version===formatVersion,'Revision identity does not match its reviewed source.');
 ensure(row.status==='pending_approval'&&row.revision===1,'A created revision must await approval.');
 for(const key of ['evidence','signed_at','approved_at','approved_by'])ensure(row[key]===null,'A new revision cannot carry approval or signing evidence.');
 ensure(fingerprint(row.source_contract)===fingerprint(original),'The revision source snapshot changed.');
 ensure(row.source_signed_at===source.flow.signed_at,'The original signing date was not preserved as source metadata.');
 ensure(row.contract?.number===`${original.number}-R${row.document_revision}`&&row.contract.createdBy===actor,'The revised document identity is invalid.');
 ensure(typeof row.contract.createdAt==='string'&&Number.isFinite(Date.parse(row.contract.createdAt))&&!row.contract.approvedAt,'The revised document must have a new issue date and no copied approval.');
 ensure(fingerprint(immutableContract(row.contract))===fingerprint(immutableContract(original)),'A revision changed saved contract content, quotation, terms, payments or details.');
 ensure(fingerprint(quotationSummary(row.contract))===fingerprint(quotationSummary(original)),'The revised billing summary changed.');
 const fields=row.contract.agreement2027?.fields;
 if(fields){ensure(!fields.companyRepresentativeSignature&&!fields.companyRepresentativeDate,'A revision copied a company signature or signing date.');for(const approval of Object.values(fields.approvals??{}))ensure(!approval.signature&&!approval.date,'A revision copied staff signature or signing dates.');}
}

export function verifyReadback(records,sources,actor){
 ensure(records.length===sources.length,'The revision readback does not cover every reviewed source.');
 const byProject=new Map(sources.map(source=>[source.project.id,source])),seen=new Set();
 return records.map(record=>{
  const row=record.value,source=byProject.get(row?.project_id);
  ensure(source&&!seen.has(row.project_id)&&record.source_matches===true,'The revision readback source snapshot does not match its original.');
  seen.add(row.project_id);
  // Only the server's exact JSON equality permits omitting the large duplicate
  // original contract from the response. Every other field is still verified.
  verifyRevision({...row,source_contract:source.flow.contract},source,actor);return row;
 });
}

const businessFingerprints=sql=>sql`select flow.project_id,
 md5(to_jsonb(flow)::text) as workflow_hash,md5(to_jsonb(project)::text) as project_hash,
 (select md5(coalesce(string_agg(md5(to_jsonb(history)::text),',' order by history.version),'')) from public.quotation_revisions history where history.project_id=project.id) as history_hash
 from public.sales_workflows flow join public.projects project on project.id=flow.project_id
 where flow.contract is not null and project.archived_at is null order by project.id`;
function localFile(path){const value=realpathSync(resolve(root,path));ensure(value.startsWith(root+sep),'File must remain inside this repository.');return value;}
function save(directory,name,value){writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}

export async function runBatch(options){
 ensure(process.cwd()===root,'Run this script from the repository root.');
 const config=parseEnv(readFileSync(localFile('.env.local'),'utf8'));validateTarget(config);
 if(!options.apply){
  console.error(JSON.stringify({event:'batch-progress',phase:'rest-inventory',mode:'dry-run'}));
  const sources=await restInventory(config);ensure(sources.length>0,'No current contracts were found.');
  const directory=resolve(root,`artifacts/contract-opening-revisions-20261126-run${Date.now()}-${randomUUID()}`);mkdirSync(directory,{recursive:true,mode:0o700});
  const manifest=createManifest(sources),result={mode:'dry-run',sourceCount:manifest.sourceCount,signedCount:manifest.signedCount,unsignedCount:manifest.unsignedCount};
  save(directory,'originals.json',sources);save(directory,'manifest.json',manifest);save(directory,'result.json',{...result,completedAt:new Date().toISOString()});
  return {...result,directory:directory.slice(root.length+1)};
 }
 const reviewed=options.apply?JSON.parse(readFileSync(localFile(options.manifest),'utf8')):null;
 const reviewedSources=options.apply?JSON.parse(readFileSync(localFile(resolve(dirname(localFile(options.manifest)),'originals.json')),'utf8')):null;
 if(options.apply)verifyManifest(reviewed,reviewedSources);
 const {default:postgres}=await import(pathToFileURL(resolve(root,'artifacts/sql-tools/node_modules/postgres/src/index.js')).href);
 const sql=postgres(config.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,onnotice(){}});
 let directory,phase='connect',committed=false,primaryFailure;
 const progress=next=>{phase=next;console.error(JSON.stringify({event:'batch-progress',phase,mode:options.apply?'apply':'dry-run'}));};
 try{
  progress('connect');
  const result=await sql.begin(options.apply?'':'read only',async tx=>{
   try{
   progress('session-setup');
   await tx`set local statement_timeout='120s'`;await tx`set local lock_timeout='10s'`;
   const sources=reviewedSources;progress('inventory-lock');
    const locked=await tx`select flow.project_id from public.sales_workflows flow join public.projects project on project.id=flow.project_id
     where flow.contract is not null and project.archived_at is null order by project.id for update of flow,project`;
    verifySourceIds(locked,sources);progress('verify-sources');
    const checks=await tx`select current_project.id as project_id,
     expected_source.flow is not distinct from to_jsonb(current_flow) as flow_matches,
     expected_source.project is not distinct from to_jsonb(current_project) as project_matches,
     expected_source.history is not distinct from coalesce((select jsonb_agg(to_jsonb(history_row) order by history_row.version) from public.quotation_revisions history_row where history_row.project_id=current_project.id),'[]'::jsonb) as history_matches
     from jsonb_to_recordset(${tx.json(sources)}::jsonb) as expected_source(flow jsonb,project jsonb,history jsonb)
     join public.projects current_project on current_project.id=(expected_source.project->>'id')::uuid
     join public.sales_workflows current_flow on current_flow.project_id=current_project.id
     where current_flow.contract is not null and current_project.archived_at is null order by current_project.id`;
   verifySourceSnapshots(checks,sources);
   ensure(sources.length>0,'No current contracts were found.');
   progress('review');
   if(options.apply){const [admin]=await tx`select id from public.profiles where id=${options.actor} and role::text='Admin' and is_active=true and status='Active'`;ensure(admin,'The explicit actor must be an active Admin.');}
   directory=resolve(root,`artifacts/contract-opening-revisions-20261126-run${Date.now()}-${randomUUID()}`);mkdirSync(directory,{recursive:true,mode:0o700});
   progress('backup');const manifest=createManifest(sources);save(directory,'originals.json',sources);save(directory,'manifest.json',manifest);
   await tx`select set_config('request.jwt.claims',${JSON.stringify({role:'service_role'})},true)`;
   const existing=new Set((await tx`select id from public.contract_document_revisions where format_version=${formatVersion}`).map(row=>row.id));
   progress('fingerprint-before');const before=await businessFingerprints(tx);ensure(before.length===sources.length,'The current contract inventory changed before creation.');
   const requests=revisionRequests(tx,sources);
   progress('create-revisions');const created=await tx`select (public.create_contract_document_revision(requested.project_id,requested.source_revision,${options.actor}::uuid)).id as id
    from jsonb_to_recordset(${requests}::jsonb) as requested(project_id uuid,source_revision integer) order by requested.project_id`;
   const returnedIds=new Set(created.map(row=>row.id));ensure(returnedIds.size===sources.length,'Creation did not return one revision per source.');
   progress('readback');const records=await tx`select to_jsonb(document_row)-'source_contract' as value,
    document_row.source_contract is not distinct from original_flow.contract as source_matches
    from public.contract_document_revisions document_row
    join jsonb_to_recordset(${requests}::jsonb) as requested(project_id uuid,source_revision integer)
      on document_row.project_id=requested.project_id and document_row.source_workflow_revision=requested.source_revision
    join public.sales_workflows original_flow on original_flow.project_id=document_row.project_id
    where document_row.format_version=${formatVersion} and document_row.revision_reason='opening_schedule' order by document_row.project_id`;
   const revisions=verifyReadback(records,sources,options.actor).map(row=>{
    ensure(returnedIds.has(row.id),'Readback returned an unexpected revision.');
    return {projectId:row.project_id,id:row.id,documentRevision:row.document_revision,status:row.status,created:!existing.has(row.id)};
   });
   progress('fingerprint-after');ensure(fingerprint(await businessFingerprints(tx))===fingerprint(before),'Original workflows, contracts, projects or quotation history changed.');
   progress('commit');
   return {mode:'apply',sourceCount:sources.length,pendingApprovalCount:revisions.length,createdCount:revisions.filter(row=>row.created).length,existingCount:revisions.filter(row=>!row.created).length,originalsUnchanged:true,businessFingerprintSha256:fingerprint(before),sourceOriginalsSha256:manifest.originalsSha256,revisions};
   }catch(error){
    primaryFailure={phase,error:publicError(error),...errorMetadata(error)};
    console.error(JSON.stringify({event:'transaction-error',...primaryFailure}));
    if(directory)save(directory,'transaction-failure.json',{...primaryFailure,failedAt:new Date().toISOString()});
    throw error;
   }
  });
  committed=!!options.apply;progress('save-result');save(directory,'result.json',{...result,completedAt:new Date().toISOString()});
  return {...result,revisions:undefined,directory:directory.slice(root.length+1)};
 }catch(error){
  const evidence={phase,committed,...errorMetadata(error),...primaryFailure,directory:directory?.slice(root.length+1)};
  if(directory)save(directory,'failure.json',{error:publicError(error),...evidence,failedAt:new Date().toISOString()});
  throw Object.assign(new BatchError(publicError(error)),{batchEvidence:evidence});
 }
 finally{await sql.end({timeout:5}).catch(()=>{});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options=parseArguments(process.argv.slice(2));if(options.help)console.log('Dry run: node scripts/revise-contract-opening-schedules.mjs\nApply reviewed inventory: node scripts/revise-contract-opening-schedules.mjs --apply --actor=<Admin UUID> --manifest=<manifest path>');else console.log(JSON.stringify(await runBatch(options)));}
 catch(error){console.error(JSON.stringify({error:publicError(error),...error.batchEvidence,...errorMetadata(error)}));process.exitCode=1;}
}
