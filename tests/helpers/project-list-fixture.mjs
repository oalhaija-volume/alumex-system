import { readFileSync } from 'node:fs';
import ts from 'typescript';

export const uuid = n => `${n.toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
export const actorId = uuid(9000);
export const salespersonId = uuid(9001);
export function projectListFixture({count=103,role='Admin',branch='Karkh',sourceOverrides={},authorized=true}={}) {
 const reads=[];
 const tables={
  projects:Array.from({length:count},(_,i)=>({id:uuid(i+1),client_id:uuid(i+10000),project_name:`Project ${i+1}`,project_number:`PRJ-${String(i+1).padStart(4,'0')}`,address:`Street ${i%7}`,branch:['Karkh','Rasafa','Najaf','Governorates'][i%4],governorate:i%4===3?'البصرة':null,governorate_office:null,created_at:new Date(Date.UTC(2026,10,Math.floor(i/4)+1)).toISOString(),updated_at:'2026-11-26T08:00:00Z',created_by:i%3===0?salespersonId:actorId,original_creator_role:i%3===0?'Outdoor Sales':'Indoor Sales',legacy_outdoor_sales_id:i%13===0?salespersonId:null,assigned_outdoor_sales_id:salespersonId,structure_readiness:'ready',sales_status:'new_lead',status:'Open',next_follow_up_at:null,follow_up_owner_id:actorId,project_notes:'Saved project note. '.repeat(30),readiness_note:null,additional_openings_original_ids:Array.from({length:15},(_,j)=>uuid(20000+j)),measurement_delayed:i%9===0,measurement_delay_note:'Visit note. '.repeat(20),measurement_delayed_by:actorId,measurement_exception_reason:null,client_cancellation_note:null,client_cancelled_by:null})),
  profiles:[{id:actorId,full_name:'Employee',role,branch,is_active:true,status:'Active'},{id:salespersonId,full_name:'Outdoor colleague',role:'Outdoor Sales',branch:'Karkh',is_active:true,status:'Active'}],
  clients:Array.from({length:count},(_,i)=>({id:uuid(i+10000),client_name:i===77?'عميل بغداد':`Client ${i+1}`,mobile:`077${String(i+1).padStart(8,'0')}`})),
  field_sync_receipts:Array.from({length:count*3},(_,i)=>({operation_id:uuid(i+30000),project_id:uuid(Math.floor(i/3)+1),actor_id:actorId,action:'delay-measurements',recorded_at:'2026-11-25T08:00:00Z',result:{measurement_delay_note:'Saved visit history. '.repeat(15),measurement_delay_reason:'client_delay'}}))
 };
 function predicate(expression) {
  const split=value=>{let depth=0,start=0;const out=[];for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;else if(value[i]===')')depth--;else if(value[i]===','&&depth===0){out.push(value.slice(start,i));start=i+1;}}out.push(value.slice(start));return out;};
  if(expression.startsWith('and(')) {const terms=split(expression.slice(4,-1)).map(predicate);return row=>terms.every(term=>term(row));}
  const [key,operation,...valueParts]=expression.split('.');const value=valueParts.join('.').replace(/^"|"$/g,'');
  if(operation==='eq')return row=>String(row[key])===value;
  if(operation==='in'){const values=value.slice(1,-1).split(',');return row=>values.includes(row[key]);}
  const terms=split(expression).map(predicate);return row=>terms.some(term=>term(row));
 }
 const admin={from(table){let columns='*',first=0,last=Infinity;const filters=[],orders=[];
  return {select(value){columns=value;return this;},eq(key,value){filters.push(row=>row[key]===value);return this;},in(key,values){filters.push(row=>values.includes(row[key]));return this;},or(expression){
   // Top-level OR can include a nested AND and IN expression.
   let depth=0,start=0;const pieces=[];for(let i=0;i<expression.length;i++){if(expression[i]==='(')depth++;if(expression[i]===')')depth--;if(expression[i]===','&&depth===0){pieces.push(expression.slice(start,i));start=i+1;}}pieces.push(expression.slice(start));const alternatives=pieces.map(predicate);filters.push(row=>alternatives.some(test=>test(row)));return this;
  },order(key,{ascending=true}={}){orders.push({key,ascending});return this;},range(start,end){first=start;last=end+1;return this;},then(resolve,reject){
   let rows=tables[table].filter(row=>filters.every(filter=>filter(row)));rows.sort((a,b)=>{for(const {key,ascending}of orders){const compared=String(a[key]??'').localeCompare(String(b[key]??''));if(compared)return ascending?compared:-compared;}return 0;});
   rows=rows.slice(first,last).map(row=>columns==='*'?{...row}:Object.fromEntries(columns.split(',').map(key=>[key.trim(),row[key.trim()]]).filter(([,value])=>value!==undefined)));
   reads.push({table,columns,rows:rows.length,bytes:Buffer.byteLength(JSON.stringify(rows))});return Promise.resolve({data:rows,error:null}).then(resolve,reject);
  }};
 }};
 const dependencies={
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/auth/adminServer':{requireRole:async()=>authorized?({ok:true,user:{id:actorId},role,profile:{branch,outdoor_rotation_start_branch:'Karkh'}}):({ok:false,error:'Forbidden',status:403})},
  '@/lib/supabase/admin':{createAdminClient:()=>admin}
 };
 const cache=new Map();
 function load(path){if(cache.has(path))return cache.get(path);const source=sourceOverrides[path]??readFileSync(new URL(`../../${path}.ts`,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};cache.set(path,exports);new Function('require','exports',code)(name=>{
  if(name in dependencies)return dependencies[name];if(name.startsWith('@/'))return load(`src/${name.slice(2)}`);if(name.startsWith('./'))return load(`${path.slice(0,path.lastIndexOf('/'))}/${name.slice(2)}`);throw Error(`Unexpected dependency ${name}`);
 },exports);return exports;}
 return {tables,reads,load,async get(search=''){return load('src/app/api/workspace/route').GET(new Request(`http://localhost:3003/api/workspace${search}`));},metrics(response){return {responseBytes:Buffer.byteLength(JSON.stringify(response.body)),projectCards:response.body.projects.length,queries:reads.length,dbRows:reads.reduce((total,row)=>total+row.rows,0),dbBytes:reads.reduce((total,row)=>total+row.bytes,0),fullProjectRows:reads.filter(row=>row.table==='projects'&&row.columns.includes('project_notes')).reduce((total,row)=>total+row.rows,0),receiptQueries:reads.filter(row=>row.table==='field_sync_receipts').length};}};
}
