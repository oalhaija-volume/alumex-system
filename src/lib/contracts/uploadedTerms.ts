import terms from './uploadedTerms.json';

// Base terms transcribed from Residence_Contract.docx and Commertial_Contract.docx,
// with the supplied additional-product pricing clause included in both templates.
// The opening schedule supplies actual specifications and prices. Document
// metadata and signature fields replace the source's blank dates, fixed page
// count, sample names, and zero-price placeholders. Saved snapshots are immutable.
export type ContractTemplateKind = 'residential' | 'commercial';
export function uploadedContractTerms(kind: ContractTemplateKind) {
 return terms[kind].map(section => ({ ...section }));
}
