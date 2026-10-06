import type { RegistrationOpening } from '@/lib/measurements/registrationOpening';
export type FieldActor={id:string;name:string;role:string};
export type FieldProject={id:string;project_name:string;project_number:string;address:string|null;phone:string|null;structure_readiness:string;sales_status:string;status?:string;next_follow_up_at:string|null;project_notes:string|null;created_at:string;created_by:string;registeredBy:string;updated_at:string;assigned_outdoor_sales_id?:string|null;assignedOutdoorSales?:string|null;assignedToYou?:boolean;original_creator_role?:string|null;serverUpdatedAt?:string;pending?:boolean};
export type FieldOpening=RegistrationOpening & {projectId:string};
export type FieldChange={id:string;userId:string;projectId:string;action:'register'|'opening'|'finish'|'reopen'|'follow-up'|'ready';payload:Record<string,unknown>;recordedAt:string;error?:string};
export type FieldState={actor:FieldActor;outdoorSales?:{id:string;name:string}[];projects:FieldProject[];openings:FieldOpening[];queue:FieldChange[];followUpHistories?:Record<string,import('@/lib/workflow/followUps').FollowUpHistory>;syncedAt:string|null};
