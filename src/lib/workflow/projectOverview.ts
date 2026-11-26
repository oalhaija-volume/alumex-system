import type { Database } from '@/lib/supabase/database.types';
import type { FieldProject } from '@/lib/offline/types';
import type { MeasurementReport } from '@/lib/measurements/completion';
import type { FollowUpHistory } from './followUps';
import type { OpeningSizeHistory } from './openingSizeChanges';
import type { QuotationRevision, SalesFlow } from './types';
import type { ContractDocumentRevision } from '@/lib/contracts/documentRevisions';

export const overviewUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const overviewHeaders = { 'Cache-Control': 'private, no-store' };

type Tables = Database['public']['Tables'];

export type ProjectOverviewClient = Pick<Tables['clients']['Row'],
 'id' | 'mobile' | 'alternate_mobile' | 'address' | 'province' | 'city' | 'email' |
 'notes' | 'client_type' | 'company_name' | 'whatsapp' | 'preferred_language'> & { name: string };

export type ProjectOverviewContact = Tables['client_contacts']['Row'];
export type ProjectOverviewOpening = Tables['openings']['Row'] & { recordedBy: string };

export type ProjectOverviewData = {
 actor: { id: string; role: string; name?: string; branch?: string | null };
 project: FieldProject;
 client: ProjectOverviewClient | null;
 contacts: ProjectOverviewContact[];
 openings: ProjectOverviewOpening[];
 flow: SalesFlow | null;
 history: QuotationRevision[];
 followUps: FollowUpHistory;
 measurementReports: MeasurementReport[];
 sizeHistory: OpeningSizeHistory[];
 warnings: string[];
 signedCopyAvailable: boolean;
 documentRevisions: ContractDocumentRevision[];
};
