import terms from './uploadedTerms.json';

// Transcribed from Residence_Contract.docx and Commertial_Contract.docx.
// The opening schedule supplies actual specifications and prices. Document
// metadata and signature fields replace the source's blank dates, fixed page
// count, sample names, and zero-price placeholders. Saved snapshots are immutable.
export type ContractTemplateKind = 'residential' | 'commercial';
export function uploadedContractTerms(kind: ContractTemplateKind) {
 return terms[kind].map(section => ({ ...section }));
}
