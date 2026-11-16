import type { createAdminClient } from '@/lib/supabase/admin';
import type { QuoteSnapshot } from '@/lib/workflow/pricing';
import { alumexSystemLabel } from '@/lib/workflow/alumexModels';
import { emptyAgreement2027Fields, buildAgreement2027Snapshot } from './agreement2027';
import { productTechnicalDescription } from './agreement2027Content';
import type { Agreement2027Snapshot, AgreementOpeningSpecification } from './agreement2027Types';
export { buildAgreement2027Snapshot, normalizeAgreement2027Fields, isAgreement2027 } from './agreement2027';
export { agreement2027Terms } from './agreement2027Content';

type Admin = ReturnType<typeof createAdminClient>;
const string=(value:unknown)=>typeof value==='string'?value.trim():'';

// Capture the existing approved quotation and source facts once. No catalog
// price is read here; later client, project and catalog edits cannot rewrite it.
export async function loadAgreement2027Snapshot(admin:Admin,projectId:string,quotation:QuoteSnapshot,kind:'residential'|'commercial',actorId:string):Promise<Agreement2027Snapshot> {
 const project=await admin.from('projects').select('id,client_id,consultant_name,contractor_name,sales_engineer_id,operations_manager_id,project_manager_id,project_engineer_id,follow_up_owner_id,structure_readiness,project_notes').eq('id',projectId).single();
 if(project.error||!project.data)throw new Error('Unable to load contract project details.');
 const site=project.data;
 const [client,contacts,openings]=await Promise.all([
  admin.from('clients').select('client_name,mobile,alternate_mobile,whatsapp,email,company_name,client_type').eq('id',site.client_id).single(),
  admin.from('client_contacts').select('project_id,contact_type,contact_name,mobile,whatsapp,email,is_primary').eq('client_id',site.client_id).or(`project_id.eq.${site.id},project_id.is.null`),
  admin.from('openings').select('id,aluminum_color,glass_color,bottom_frame,notes').eq('project_id',site.id),
 ]);
 if(client.error||!client.data||contacts.error||openings.error)throw new Error('Unable to load contract contact or specification details.');
 const fields=emptyAgreement2027Fields();
 const person=client.data;
 fields.clientLegalName=string(person.client_name);fields.ownerName=fields.clientLegalName;fields.ownerPhone=string(person.mobile);
 fields.directPhone=string(person.mobile)||string(person.alternate_mobile);fields.whatsapp=string(person.whatsapp);fields.email=string(person.email);fields.companyName=string(person.company_name);
 fields.clientClassification=person.client_type==='company'?'شركة':'فرد';
 fields.stateAtSigning=site.structure_readiness==='ready'?'جاهز':site.structure_readiness==='not_ready'?'غير جاهز':site.structure_readiness==='partially_ready'?'جاهز جزئياً':'';
 fields.specialInstructions=string(site.project_notes);
 const related=[...new Set([site.sales_engineer_id,site.operations_manager_id,site.project_manager_id,site.project_engineer_id,site.follow_up_owner_id,actorId].filter((id):id is string=>!!id))];
 const profiles=related.length?await admin.from('profiles').select('id,full_name,username,role').in('id',related):{data:[],error:null};
 if(profiles.error)throw new Error('Unable to load contract employee names.');
 const name=(id:string|null|undefined)=>{const employee=profiles.data?.find(row=>row.id===id);return string(employee?.full_name)||string(employee?.username);};
 const generatingEmployee=profiles.data?.find(employee=>employee.id===actorId);
 const generatingSalesName=generatingEmployee&&['Indoor Sales','Sales Manager'].includes(generatingEmployee.role??'')?name(actorId):'';
 fields.salesEngineerName=name(site.sales_engineer_id)||generatingSalesName;
 fields.approvals.salesEngineer.name=fields.salesEngineerName;
 fields.approvals.operationsManager.name=name(site.operations_manager_id);
 fields.approvals.projectsManager.name=name(site.project_manager_id);
 fields.approvals.projectEngineer.name=name(site.project_engineer_id);
 const followUpOwner=profiles.data?.find(row=>row.id===site.follow_up_owner_id);
 if(followUpOwner?.role==='Sales Manager')fields.approvals.salesManager.name=name(followUpOwner.id);
 const sortedContacts=[...(contacts.data??[])].sort((a,b)=>Number(b.project_id===site.id)-Number(a.project_id===site.id)||Number(b.is_primary)-Number(a.is_primary));
 const contactName=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 const associatedContact=(type:'consultant'|'contractor',projectName:string|null)=>{
  const expected=string(projectName);
  return sortedContacts.find(contact=>contact.contact_type===type&&(!expected||contactName(contact.contact_name)===contactName(expected)));
 };
 const consultant=associatedContact('consultant',site.consultant_name);
 const contractor=associatedContact('contractor',site.contractor_name);
 fields.consultantName=string(site.consultant_name)||string(consultant?.contact_name);fields.consultantPhone=string(consultant?.mobile)||string(consultant?.whatsapp);
 fields.contractorName=string(site.contractor_name)||string(contractor?.contact_name);fields.contractorPhone=string(contractor?.mobile)||string(contractor?.whatsapp);
 const quotedIds=new Set(quotation.lines.map(line=>line.opening.id));
 const specifications:AgreementOpeningSpecification[]=(openings.data??[]).filter(opening=>quotedIds.has(opening.id)).map(opening=>{
  const quoted=quotation.lines.find(line=>line.opening.id===opening.id);
  const technicalDescription=quoted?productTechnicalDescription(alumexSystemLabel(quoted.system.name,quoted.systemModel)):undefined;
  return {openingId:opening.id,aluminumColor:string(opening.aluminum_color),glassColor:string(opening.glass_color),bottomFrame:string(opening.bottom_frame),notes:string(opening.notes),...(technicalDescription?{technicalDescription}:{})};
 });
 return buildAgreement2027Snapshot(quotation,kind,fields,specifications);
}
