import { canAccessProjectRow, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';
import { projectBranches, type ProjectBranch } from '@/lib/intake/projectBranch';
import type { FieldActor, FieldProject } from '@/lib/offline/types';
import type { SignedEvidence } from '@/lib/workflow/types';

export type SignedContractRecord = {
  project: FieldProject;
  contractNumber: string;
  signedAt: string;
  signer: string | null;
  method: SignedEvidence['method'] | null;
  revision: number;
  total: number | null;
  currency: string | null;
};

export type SignedContractsData = {
  actor: FieldActor;
  branches: ProjectBranch[];
  records: SignedContractRecord[];
};

// Only these summary fields are read from commercial JSON. Signing evidence,
// storage paths and the saved contract itself stay behind the contract route.
export type SignedContractRow = {
  project_id: string;
  revision: number;
  signed_at: string | null;
  contract_number: unknown;
  contract_total: unknown;
  contract_currency: unknown;
  signer: unknown;
  method: unknown;
  project: Omit<FieldProject, 'phone' | 'registeredBy' | 'client_name'>;
};

export function signedContractBranches(actor: FieldActor): ProjectBranch[] {
  const allowed = projectBranchesForActor(actor);
  return projectBranches.filter(branch => allowed === null || allowed.includes(branch));
}

export function signedContractRecord(
  row: SignedContractRow,
  actor: FieldActor,
  client: { client_name: string; mobile: string | null } | undefined,
): SignedContractRecord | null {
  if (!row.signed_at || !row.project || !canAccessProjectRow(actor, row.project) || !client) return null;
  const numericTotal = typeof row.contract_total === 'number' || typeof row.contract_total === 'string' && row.contract_total.trim() !== ''
    ? Number(row.contract_total) : NaN;
  const method = row.method === 'digital' || row.method === 'upload' || row.method === 'hard_copy' ? row.method : null;
  // An explicit allowlist also keeps future query additions out of responses.
  const project = row.project;
  return {
    project: {
      id: project.id,
      client_id: project.client_id,
      client_name: client.client_name,
      branch: project.branch,
      governorate: project.governorate,
      project_name: project.project_name,
      project_number: project.project_number,
      address: project.address,
      phone: client.mobile,
      structure_readiness: project.structure_readiness,
      sales_status: project.sales_status,
      status: project.status,
      next_follow_up_at: project.next_follow_up_at,
      project_notes: project.project_notes,
      created_at: project.created_at,
      created_by: project.created_by,
      updated_at: project.updated_at,
      registeredBy: 'Employee',
    },
    contractNumber: typeof row.contract_number === 'string' ? row.contract_number : '',
    signedAt: row.signed_at,
    signer: typeof row.signer === 'string' ? row.signer : null,
    method,
    revision: row.revision,
    total: Number.isFinite(numericTotal) && numericTotal >= 0 ? numericTotal : null,
    currency: typeof row.contract_currency === 'string' ? row.contract_currency : null,
  };
}
