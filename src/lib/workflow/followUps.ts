export type FollowUpEntry={id:string;action:'follow-up'|'ready'|'snapshot';note:string;nextFollowUp:string|null;recordedAt:string|null;recordedBy:string;pending?:boolean};
export type FollowUpHistory={project:{id:string;project_name:string;project_number:string;structure_readiness:string;next_follow_up_at:string|null};entries:FollowUpEntry[]};
