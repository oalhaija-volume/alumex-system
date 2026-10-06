export type ProjectProgress={structure_readiness:string;sales_status:string;status?:string|null};
export const projectStages=[
 {id:'site',label:'Awaiting site readiness',action:'Follow up on site readiness'},
 {id:'measurements',label:'Initial measurements',action:'Complete initial measurements'},
 {id:'quotation-preparation',label:'Ready for quotation',action:'Prepare the quotation'},
 {id:'quotation-response',label:'Quotation awaiting response',action:'Follow up on the quotation'},
 {id:'contract-preparation',label:'Quotation approved',action:'Prepare the contract'},
 {id:'contract-signature',label:'Contract awaiting signature',action:'Follow up on the signature'},
 {id:'handoff',label:'Signed · Operations handoff',action:'Await Operations acceptance'},
 {id:'operations',label:'Operations started',action:'Project is with Operations'},
 {id:'closed',label:'Closed',action:'Review the project record'},
] as const;
export type ProjectStage=typeof projectStages[number]['id'];
export function projectStage(p:ProjectProgress):ProjectStage{
 if(['cancelled','lost','closed'].includes(p.sales_status))return 'closed';
 if(p.sales_status==='transferred_to_operations'&&p.status==='Production')return 'operations';
 if(['contract_signed','transferred_to_operations'].includes(p.sales_status))return 'handoff';
 if(p.sales_status==='contract_generated')return 'contract-signature';
 if(p.sales_status==='quotation_approved')return 'contract-preparation';
 if(p.sales_status==='quotation_in_progress')return 'quotation-response';
 if(p.sales_status==='ready_for_quotation')return 'quotation-preparation';
 return p.structure_readiness==='ready'?'measurements':'site';
}
export function stageDetails(p:ProjectProgress){return projectStages.find(s=>s.id===projectStage(p))!;}
export function needsSalesFollowUp(p:ProjectProgress){return !['handoff','operations','closed'].includes(projectStage(p));}
export function projectLink(p:ProjectProgress&{id:string}){
 const stage=projectStage(p);
 if(stage==='site')return '/mini-crm';
 if(stage==='measurements')return `/initial-measurements/${p.id}`;
 if(['contract-signature','handoff','operations'].includes(stage))return `/contract/${p.id}`;
 return `/quotation/${p.id}`;
}
