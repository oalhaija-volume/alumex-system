import type { QuoteSnapshot } from './pricing';
export type ContractSnapshot = {template?:'residential'|'commercial';number:string;createdAt:string;quotation:QuoteSnapshot;client:{name:string;mobile:string|null;client_type:string|null};project:{name:string;number:string;address:string|null};terms:{title:string;text:string}[]};
export type SignedEvidence = {method:'digital'|'upload';signer:string;signature?:string;path?:string;fileName?:string};
export type SalesFlow = {project_id:string;revision:number;stage:string;quotation:QuoteSnapshot;contract:ContractSnapshot|null;evidence:SignedEvidence|null;signed_at:string|null};
