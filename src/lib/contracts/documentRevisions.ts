import type { ContractSnapshot, SignedEvidence } from '@/lib/workflow/types';

export const CONTRACT_DOCUMENT_FORMAT = 'billable-opening-schedule-v1' as const;
export type ContractDocumentRevisionStatus = 'pending_approval' | 'approved' | 'signed';

export type ContractDocumentRevision = {
 id: string;
 project_id: string;
 document_revision: number;
 source_workflow_revision: number;
 source_signed_at: string | null;
 format_version: typeof CONTRACT_DOCUMENT_FORMAT;
 revision_reason?: 'opening_schedule' | 'client_name_correction';
 superseded_at?: string | null;
 status: ContractDocumentRevisionStatus;
 revision: number;
 contract: ContractSnapshot;
 created_by: string;
 created_at: string;
 approved_by: string | null;
 approved_at: string | null;
 signed_at: string | null;
 evidence: SignedEvidence | null;
};
