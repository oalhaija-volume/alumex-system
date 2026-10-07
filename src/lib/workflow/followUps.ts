export const followUpTypes = [
 {value:'call',label:'Call'},
 {value:'whatsapp',label:'WhatsApp'},
 {value:'site_visit',label:'Site visit'},
 {value:'showroom_visit',label:'Showroom visit'},
 {value:'other',label:'Other'},
] as const;
export type FollowUpType=typeof followUpTypes[number]['value'];
export type FollowUpInput={nextFollowUp:string;note:string;followUpType:FollowUpType;followUpDetail:string;followUpOwnerId:string};

export function normalizeFollowUp(input:Record<string,unknown>):FollowUpInput {
 const next=typeof input.nextFollowUp==='string'?new Date(input.nextFollowUp):null;
 if(!next||!Number.isFinite(next.getTime()))throw new Error('Choose the next follow-up date.');
 if(!followUpTypes.some(t=>t.value===input.followUpType))throw new Error('Choose a follow-up type.');
 const detail=typeof input.followUpDetail==='string'?input.followUpDetail.trim():'';
 if(input.followUpType==='other'&&(!detail||detail.length>120))throw new Error('Describe the other follow-up type in 120 characters or fewer.');
 if(typeof input.followUpOwnerId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.followUpOwnerId))throw new Error('Choose the responsible Indoor Sales employee.');
 const note=typeof input.note==='string'?input.note.trim():'';
 if(note.length>2000)throw new Error('Keep the follow-up note under 2,000 characters.');
 return {nextFollowUp:next.toISOString(),note,followUpType:input.followUpType as FollowUpType,followUpDetail:input.followUpType==='other'?detail:'',followUpOwnerId:input.followUpOwnerId};
}
export function followUpTypeLabel(type?:string|null){return followUpTypes.find(t=>t.value===type)?.label??'Type not recorded';}
export type FollowUpEntry={id:string;action:'follow-up'|'ready'|'snapshot';note:string;nextFollowUp:string|null;recordedAt:string|null;recordedBy:string;followUpType?:string|null;followUpDetail?:string|null;followUpOwner?:string|null;pending?:boolean};
export type FollowUpHistory={project:{id:string;project_name:string;project_number:string;structure_readiness:string;next_follow_up_at:string|null};entries:FollowUpEntry[]};
