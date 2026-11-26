"use client";
import type { ContractSnapshot, SignedEvidence } from '@/lib/workflow/types';
import { LegacyAgreement2027Document } from './LegacyAgreement2027Document';
import { SourceAgreement2027Document } from './SourceAgreement2027Document';
import { DocumentFooter, DocumentParties, OpeningSchedule } from '@/components/workflow/CommercialDocument';
import styles from './SourceAgreement2027Document.module.css';

export function Agreement2027Document({ contract, signedAt, evidence }: { contract: ContractSnapshot; signedAt?: string | null; evidence?: SignedEvidence | null }) {
 if (contract.agreement2027?.documentLayout === 'source-pdf-2027' && (contract.template === 'residential' || contract.template === 'commercial')) return <>
  <SourceAgreement2027Document contract={contract} signedAt={signedAt} evidence={evidence} />
  <section data-agreement-section="opening-schedule" data-contract-opening-schedule className={styles.openingSchedule}>
   <DocumentParties client={contract.client} project={{ ...contract.project, branch: contract.branch ?? contract.project.branch }} />
   <OpeningSchedule quote={contract.quotation} areaBasis="billable" />
   <DocumentFooter reference={contract.number} />
  </section>
 </>;
 // A saved contract predating the source layout keeps its original rendering.
 return <LegacyAgreement2027Document contract={contract} signedAt={signedAt} />;
}
