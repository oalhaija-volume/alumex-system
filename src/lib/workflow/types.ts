import type { ProjectBranch, ProjectGovernorate } from '@/lib/intake/projectBranch';
import type { QuoteSnapshot } from './pricing';
export type ContractSnapshot = {branch?:ProjectBranch|null;createdBy?:string;template?:'residential'|'commercial';number:string;createdAt:string;quotation:QuoteSnapshot;client:{name:string;mobile:string|null;client_type:string|null};project:{branch?:ProjectBranch|null;governorate?:ProjectGovernorate|null;name:string;number:string;address:string|null};terms:{title:string;text:string}[]};
export type SignedEvidence = {method:'digital'|'upload';signer:string;signature?:string;path?:string;fileName?:string};
export type SalesFlow = {project_id:string;revision:number;stage:string;quotation:QuoteSnapshot;contract:ContractSnapshot|null;evidence:SignedEvidence|null;signed_at:string|null};
export type QuotationRevision = {version:number;quotation:QuoteSnapshot;contract:ContractSnapshot|null;previous_stage:string;superseded_at:string};
