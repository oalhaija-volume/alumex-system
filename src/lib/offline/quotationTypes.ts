import type { BuildingType } from '@/lib/intake/buildingType';
import type { ProjectBranch, ProjectGovernorate } from '@/lib/intake/projectBranch';
import type { CatalogItem, MeasuredOpening } from '@/lib/workflow/pricing';
import type { OpeningSizeHistory } from '@/lib/workflow/openingSizeChanges';
import type { QuotationRevision, SalesFlow } from '@/lib/workflow/types';

export type OfflineQuotationData = {
  quotationAccess?: 'full' | 'prices';
  project: {
    id?: string;
    project_name: string;
    updated_at?: string;
    project_number: string;
    address: string | null;
    building_type?: BuildingType | null;
    branch?: ProjectBranch | null;
    governorate?: ProjectGovernorate | null;
    governorate_office?: 'Karkh' | null;
    created_by?: string | null;
    assigned_outdoor_sales_id?: string | null;
    sales_status: string;
    additional_openings_state?: 'requested' | 'submitted' | null;
  };
  client: { name: string; mobile: string | null; client_type?: string | null };
  openings: MeasuredOpening[];
  catalog: CatalogItem[];
  flow: SalesFlow | null;
  history: QuotationRevision[];
  sizeHistory?: OpeningSizeHistory[];
  offlineQuotation?: { pending: boolean; recordedAt: string; error?: string };
};

export type OfflineQuotationEntry = {
  projectId: string;
  data: OfflineQuotationData;
  available: boolean;
  downloadedAt: string;
};

export type OfflineQuotationOperation = {
  id: string;
  userId: string;
  projectId: string;
  recordedAt: string;
  body: Record<string, unknown>;
  base: OfflineQuotationData;
  draft: OfflineQuotationData;
  attemptedAt?: string;
  error?: string;
  status?: number;
  conflict?: boolean;
  successor?: { body: Record<string, unknown>; draft: OfflineQuotationData; recordedAt: string };
};

export type OfflineQuotationArchive = {
  operation: OfflineQuotationOperation;
  archivedAt: string;
  reason: string;
};

export type OfflineQuotationState = {
  entries: OfflineQuotationEntry[];
  queue: OfflineQuotationOperation[];
  archived: OfflineQuotationArchive[];
  downloadedAt: string | null;
};

export type OfflineQuotationReview = {
  projectId: string;
  operationId: string;
  latest: OfflineQuotationData;
  localTotal: number;
  canRebase: boolean;
};
