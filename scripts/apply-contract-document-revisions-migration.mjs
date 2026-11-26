import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fingerprint,publicError,validateTarget} from './revise-contract-opening-schedules.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const version='20261126010000',name='contract_document_revisions';
const migrationPath=`supabase/migrations/${version}_${name}.sql`,fixturePath='tests/database/contract-document-revisions.sql';
const signatures=['public.create_contract_document_revision(uuid,integer,uuid)','public.approve_contract_document_revision(uuid,integer,uuid)','public.sign_contract_document_revision(uuid,integer,jsonb,uuid)'];
const rollback=new Error('Expected rehearsal rollback'),fixtureRollback=new Error('Expected fixture rollback');
class MigrationError extends Error {}
function ensure(value,message){if(!value)throw new MigrationError(message);}
const sha=value=>createHash('sha256').update(value).digest('hex');
function localFile(path){const file=realpathSync(resolve(root,path));ensure(file.startsWith(root+sep),'Migration files must remain inside this repository.');return file;}

export function migrationArguments(args){
 const options={apply:false};
 for(const argument of args){
  if(argument==='--apply'){ensure(!options.apply,'Duplicate apply flag.');options.apply=true;}
  else if(argument.startsWith('--sha=')){ensure(!options.sha,'Duplicate reviewed hash.');options.sha=argument.slice(6);ensure(/^[a-f0-9]{64}$/.test(options.sha),'Reviewed SHA-256 must contain 64 lowercase hexadecimal characters.');}
  else throw new MigrationError('Use no options for rollback rehearsal, or --apply --sha=<reviewed SHA-256>.');
 }
 ensure(!options.apply||options.sha,'Permanent application requires the reviewed migration SHA-256.');return options;
}

export function transactionBody(source,ending='commit'){
 const opening=/^\s*(?:--[^\n]*\n\s*)*begin;\s*/i,closing=new RegExp(`\\s*${ending};\\s*$`,'i');
 ensure(opening.test(source)&&closing.test(source),'SQL must have the expected outer transaction.');
 const body=source.replace(opening,'').replace(closing,'');
 ensure(!/^\s*(?:begin|commit|rollback)\s*;/im.test(body),'SQL cannot close its containing transaction.');return body;
}

export function migrationState(ledger,tableExists,body){
 if(!ledger){ensure(!tableExists,'An unrecorded contract revision table already exists.');return 'fresh';}
 ensure(tableExists&&ledger.name===name&&ledger.statements?.length===1&&ledger.statements[0]===body,'Existing migration history or schema differs from this reviewed migration.');return 'existing';
}

async function businessState(sql){
 const [tables]=await sql`select
  (select count(*)::integer from public.projects) as projects,
  (select md5(coalesce(string_agg(md5(to_jsonb(p)::text),',' order by p.id),'')) from public.projects p) as projects_hash,
  (select count(*)::integer from public.sales_workflows) as workflows,
  (select md5(coalesce(string_agg(md5(to_jsonb(f)::text),',' order by f.project_id),'')) from public.sales_workflows f) as workflows_hash,
  (select count(*)::integer from public.quotation_revisions) as quotations,
  (select md5(coalesce(string_agg(md5(to_jsonb(h)::text),',' order by h.project_id,h.version),'')) from public.quotation_revisions h) as quotations_hash,
  (select md5(coalesce(string_agg(md5(to_jsonb(m)::text),',' order by m.version),'')) from supabase_migrations.schema_migrations m where m.version<>${version}) as migrations_hash`;
 const functions=await sql`select p.oid::text as id,md5(pg_get_functiondef(p.oid)) as definition,p.proacl::text as acl,p.prosecdef,p.proconfig,p.proowner::text as owner
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by p.oid`;
 return {tables,functions:[...functions]};
}
function unchanged(before,after){
 ensure(fingerprint(before.tables)===fingerprint(after.tables),'Existing projects, workflows, quotation history or migration records changed.');
 const ids=new Set(before.functions.map(row=>row.id));
 ensure(fingerprint(before.functions)===fingerprint(after.functions.filter(row=>ids.has(row.id))),'An existing public function, guard or its permissions changed.');
}
async function schemaState(sql){
 const [state]=await sql`select to_regclass('public.contract_document_revisions') is not null as present`;
 const [ledger]=await sql`select name,statements from supabase_migrations.schema_migrations where version=${version}`;
 return {present:state.present,ledger};
}
async function verifySchema(sql,source){
 const [table]=await sql`select relrowsecurity as rls,
  has_table_privilege('service_role',oid,'SELECT') as service_read,
  has_table_privilege('service_role',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as service_write,
  has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_access,
  has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_access
  from pg_class where oid='public.contract_document_revisions'::regclass`;
 ensure(table.rls&&table.service_read&&!table.service_write&&!table.anon_access&&!table.authenticated_access,'Contract revision RLS or table permissions do not match the reviewed policy.');
 for(const signature of signatures){
  const [routine]=await sql`select p.prosecdef,p.proconfig,has_function_privilege('service_role',p.oid,'EXECUTE') as service,
   has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated
   from pg_proc p where p.oid=to_regprocedure(${signature})`;
  ensure(routine?.prosecdef&&fingerprint(routine.proconfig)===fingerprint(['search_path=public'])&&routine.service&&!routine.anon&&!routine.authenticated,'Contract revision RPC permissions or search path are invalid.');
 }
 const definitions=[...source.matchAll(/create function public\.(\w+)\([\s\S]*?\$\$([\s\S]*?)\$\$;/g)];
 ensure(definitions.length===4,'The reviewed migration must define exactly four contract revision functions.');
 for(const [,functionName,body] of definitions){const [row]=await sql`select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${functionName}`;ensure(row?.prosrc===body,'An installed contract revision function differs from the reviewed source.');}
 const [trigger]=await sql`select count(*)::integer as matches from pg_trigger where tgrelid='public.contract_document_revisions'::regclass and tgname='protect_contract_document_revision' and tgtype=27 and tgenabled='O' and tgfoid=to_regprocedure('public.protect_contract_document_revision()')`;
 ensure(trigger.matches===1,'Contract revision immutability trigger is missing.');
 return {rls:true,serviceSelectOnly:true,rpcServiceOnly:true,sourceFunctionsMatch:true,immutabilityTrigger:true};
}

export async function runMigration(options){
 ensure(process.cwd()===root,'Run this script from the repository root.');
 const source=readFileSync(localFile(migrationPath),'utf8'),body=transactionBody(source),migrationSha256=sha(source);
 ensure(!options.sha||options.sha===migrationSha256,'Migration source changed after review.');
 const fixture=existsSync(resolve(root,fixturePath))?readFileSync(localFile(fixturePath),'utf8'):null;
 const fixtureBody=fixture?transactionBody(fixture,'rollback'):null;
 const config=parseEnv(readFileSync(localFile('.env.local'),'utf8'));validateTarget(config);
 const {default:postgres}=await import(pathToFileURL(resolve(root,'artifacts/sql-tools/node_modules/postgres/src/index.js')).href);
 const sql=postgres(config.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,onnotice(){}});
 const directory=resolve(root,`artifacts/contract-revision-migration-20261126-${Date.now()}-${randomUUID()}`);mkdirSync(directory,{recursive:true,mode:0o700});
 let before,report,committed=false;
 try{
  try{await sql.begin('isolation level repeatable read',async tx=>{
   await tx`set local lock_timeout='10s'`;await tx`set local statement_timeout='120s'`;
   await tx`select pg_advisory_xact_lock(hashtextextended('alumex-migration-deployment',0))`;
   before=await businessState(tx);const state=await schemaState(tx),mode=migrationState(state.ledger,state.present,body);
   if(mode==='fresh'){
    await tx.unsafe(body);
    await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},${name},array[${body}]::text[])`;
   }
   const schema=await verifySchema(tx,source);
   if(fixtureBody&&!options.apply){try{await tx.savepoint(async fixtureTx=>{await fixtureTx.unsafe(fixtureBody);throw fixtureRollback;});}catch(error){if(error!==fixtureRollback)throw error;}}
   unchanged(before,await businessState(tx));
   const installed=await schemaState(tx);ensure(migrationState(installed.ledger,installed.present,body)==='existing','Migration ledger verification failed.');
   report={passed:true,mode:mode==='existing'?'no-op':options.apply?'apply':'rollback-rehearsal',...schema,fixtureTested:!!fixtureBody&&!options.apply,fixtureSha256:fixture?sha(fixture):null,existingBusinessUnchanged:true,existingFunctionsUnchanged:true,beforeSha256:fingerprint(before)};
   if(!options.apply)throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  committed=!!options.apply&&report.mode==='apply';
  await sql.begin('read only',async tx=>{
   const after=await businessState(tx);unchanged(before,after);
   const state=await schemaState(tx);
   if(report.mode==='rollback-rehearsal')ensure(!state.present&&!state.ledger&&fingerprint(after)===fingerprint(before),'Rehearsal did not restore the complete original state.');
   else{ensure(migrationState(state.ledger,state.present,body)==='existing','Committed migration verification failed.');await verifySchema(tx,source);}
  });
  report={...report,committed,rolledBack:!options.apply,migrationVersion:version,migrationSha256,bodySha256:sha(body),completedAt:new Date().toISOString()};
  writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return {...report,directory:directory.slice(root.length+1)};
 }catch(error){const failure={passed:false,committed,error:error instanceof MigrationError?error.message:publicError(error),migrationSha256};writeFileSync(resolve(directory,'failure.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx',mode:0o600});throw new MigrationError(`${failure.error} Evidence: ${directory.slice(root.length+1)}`);}
 finally{await sql.end({timeout:5});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await runMigration(migrationArguments(process.argv.slice(2)))));}
 catch(error){console.error(error instanceof MigrationError?error.message:publicError(error));process.exitCode=1;}
}
