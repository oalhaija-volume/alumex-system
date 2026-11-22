"use client";
import type { ContractSnapshot, SignedEvidence } from '@/lib/workflow/types';
import { LegacyAgreement2027Document } from './LegacyAgreement2027Document';
import { SourceAgreement2027Document } from './SourceAgreement2027Document';

export function Agreement2027Document({ contract, signedAt, evidence }: { contract: ContractSnapshot; signedAt?: string | null; evidence?: SignedEvidence | null }) {
 if (contract.agreement2027?.documentLayout === 'source-pdf-2027' && (contract.template === 'residential' || contract.template === 'commercial')) return <SourceAgreement2027Document contract={contract} signedAt={signedAt} evidence={evidence} />;
 // A saved contract predating the source layout keeps its original rendering.
 return <LegacyAgreement2027Document contract={contract} signedAt={signedAt} />;
}
