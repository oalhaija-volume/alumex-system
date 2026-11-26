import { fixture, projectId, timestamp } from './project-overview-fixture.mjs';

// Synthetic repeated records keep before/after measurements deterministic.
// No production data, uploads or credentials are used.
export function performanceFixture() {
 const x=fixture();
 const original=x.tables.openings[0];
 x.tables.openings=Array.from({length:30},(_,index)=>({...structuredClone(original),
  id:'cccccccc-cccc-4ccc-8ccc-'+String(index+1).padStart(12,'0'),
  has_curtain_wall_capture:true,has_skylight_capture:true,
  curtain_wall_capture:{note:'Synthetic capture note',photo:'data:image/png;base64,'+'A'.repeat(65536)},
  skylight_capture:{version:1,sections:[{label:'A',width:117,length:303}],photo:'data:image/png;base64,'+'B'.repeat(65536),drawing:null},
 }));
 const quotation={lines:x.tables.openings.map(opening=>({
  opening:{id:opening.id,floor:'GF',room:'Office',width:opening.width,height:opening.height,quantity:1,opening_type:'Window',opening_direction:'Hinged'},
  area:0.2613,system:{id:'hinged',name:'Hinged',unit:'sqm',quantity:1,rate:300000,total:300000},extras:[],total:300000,
 })),total:9000000,currency:'IQD',createdAt:timestamp,preparedBy:'synthetic-actor',version:4};
 x.tables.sales_workflows[0].quotation=structuredClone(quotation);
 x.tables.sales_workflows[0].contract.quotation=structuredClone({...quotation,total:8700000});
 x.tables.quotation_revisions=Array.from({length:12},(_,index)=>({
  project_id:projectId,version:index+1,quotation:structuredClone({...quotation,version:index+1}),
  contract:structuredClone(x.tables.sales_workflows[0].contract),previous_stage:'quotation',superseded_at:timestamp,
 }));
 x.tables.contract_document_revisions=Array.from({length:3},(_,index)=>({
  id:'dddddddd-dddd-4ddd-8ddd-'+String(index+1).padStart(12,'0'),project_id:projectId,document_revision:index+1,
  source_workflow_revision:8,source_signed_at:timestamp,source_contract:structuredClone(x.tables.sales_workflows[0].contract),
  contract:structuredClone(x.tables.sales_workflows[0].contract),format_version:'billable-opening-schedule-v1',revision_reason:'opening_schedule',
  superseded_at:null,status:'pending_approval',revision:1,created_by:'synthetic-actor',created_at:timestamp,approved_by:null,approved_at:null,signed_at:null,evidence:null,
 }));
 return x;
}

