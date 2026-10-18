import { canAccessCRM } from '@/lib/auth/permissions';
import type { FieldActor,FieldProject } from '@/lib/offline/types';
import { needsSalesFollowUp,projectStage } from './stages';

export function measurementTasks(projects:FieldProject[],actor?:FieldActor) {
 if(!actor)return [];
 return projects.filter(p=>['measurements','measurement-delayed'].includes(projectStage(p)) && (
  ['Admin','Sales Director','CEO','Company Owner'].includes(actor.role) || (actor.role==='Outdoor Sales' &&
   (p.assigned_outdoor_sales_id===actor.id || (!p.assigned_outdoor_sales_id&&p.created_by===actor.id)))
 ));
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
