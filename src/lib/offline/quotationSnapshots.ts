import type { Database } from '@/lib/supabase/database.types';

export const offlineQuotationProjectColumns = 'id,additional_openings_state,additional_openings_original_ids,building_type,branch,governorate,governorate_office,project_number,project_name,client_id,address,location_latitude,location_longitude,created_by,structure_readiness,sales_status,next_follow_up_at,follow_up_type,follow_up_detail,follow_up_owner_id,project_notes,updated_at,assigned_outdoor_sales_id' as const;
export const offlineQuotationOpeningColumns = 'id,project_id,floor,room,width,height,quantity,work_area,facade_number,has_arch,has_roller_shutter,opening_type,opening_direction' as const;
export type OfflineQuotationProject = Pick<Database['public']['Tables']['projects']['Row'],
  'id' | 'additional_openings_state' | 'additional_openings_original_ids' | 'building_type' | 'branch' | 'governorate'
  | 'governorate_office' | 'project_number' | 'project_name' | 'client_id' | 'address' | 'location_latitude'
  | 'location_longitude' | 'created_by' | 'structure_readiness' | 'sales_status' | 'next_follow_up_at'
  | 'follow_up_type' | 'follow_up_detail' | 'follow_up_owner_id' | 'project_notes' | 'updated_at' | 'assigned_outdoor_sales_id'>;
type FlowRow = Database['public']['Tables']['sales_workflows']['Row'];

// Offline quotation drafts need their saved pricing snapshot and lock state.
// Signed evidence and contract documents are never copied into this download.
export function offlineQuotationFlow(flow: FlowRow | null) {
  if (!flow) return null;
  return {
    project_id: flow.project_id, revision: flow.revision, stage: flow.stage, quotation: flow.quotation,
    contract: null, evidence: flow.evidence ? { recorded: true } : null, signed_at: flow.signed_at,
    accepted_at: flow.accepted_at, accepted_by: flow.accepted_by,
    approved_at: flow.approved_at, approved_by: flow.approved_by, updated_at: flow.updated_at,
  };
}

export function offlineQuotationProject(project: OfflineQuotationProject, access: 'full' | 'prices') {
  if (access === 'full') return project;
  const { id, project_number, project_name, address, building_type, branch, governorate,
    sales_status, additional_openings_state } = project;
  return { id, project_number, project_name, address, building_type, branch, governorate,
    sales_status, additional_openings_state };
}
