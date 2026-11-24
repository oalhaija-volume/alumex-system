import { canAccessCRM } from '@/lib/auth/permissions';
import { isOutdoorAssignmentMember } from '@/lib/auth/outdoorTeams';
import { canAccessProjectRow, effectiveMeasurementBranch } from '@/lib/auth/projectBranchAccess';
import { outdoorSalesBranch, type OutdoorRotationStartBranch } from '@/lib/intake/outdoorRotationSchedule';
import type { FieldActor,FieldProject } from '@/lib/offline/types';
import { needsSalesFollowUp,projectStage } from './stages';

export function measurementAreaForActor(actor?:FieldActor,date:Date=new Date()):OutdoorRotationStartBranch|'Najaf'|null {
 if(actor?.role!=='Outdoor Sales')return null;
 if(actor.branch==='Najaf')return 'Najaf';
 if((actor.branch!=='Karkh'&&actor.branch!=='Rasafa')
  ||(actor.outdoorRotationStartBranch!=='Karkh'&&actor.outdoorRotationStartBranch!=='Rasafa'&&actor.outdoorRotationStartBranch!==null))return null;
 return outdoorSalesBranch(actor,date);
}

export function measurementTasks(projects:FieldProject[],actor?:FieldActor,date:Date=new Date()) {
 if(!actor)return [];
 const area=measurementAreaForActor(actor,date);
 // Creating a project is not a measurement assignment. Only an explicitly
 // assigned, ready site in the current area belongs in the task list or badge.
 // Old snapshots without a verified seed cannot select a Baghdad task area.
 return projects.filter(p=>{
  if(actor.role==='Outdoor Sales'){
   const branch=effectiveMeasurementBranch(p);
   if(!canAccessProjectRow(actor,p,date)||((branch==='Karkh'||branch==='Rasafa')&&branch!==area))return false;
  }
  return !p.project_log_only && p.structure_readiness==='ready' && p.sales_status==='new_lead' &&
  !!p.assigned_outdoor_sales_id && projectStage(p)==='measurements' && (
  ['Admin','Sales Director','CEO','Company Owner'].includes(actor.role) || isOutdoorAssignmentMember(p, actor)
  );
 });
}
export function assignedFollowUps(projects:FieldProject[],actor?:FieldActor) {
 if(!actor||!canAccessCRM(actor.role))return [];
 return projects.filter(p=>needsSalesFollowUp(p)&&p.next_follow_up_at && (
  ['Admin','Sales Director','CEO','Company Owner'].includes(actor.role)||p.follow_up_owner_id===actor.id||(!p.follow_up_owner_id&&p.created_by===actor.id)
 )).sort((a,b)=>Date.parse(a.next_follow_up_at!)-Date.parse(b.next_follow_up_at!));
}
export function dueFollowUps(projects:FieldProject[],actor:FieldActor|undefined,now:number) {
 return assignedFollowUps(projects,actor).filter(p=>Date.parse(p.next_follow_up_at!)<=now);
}
