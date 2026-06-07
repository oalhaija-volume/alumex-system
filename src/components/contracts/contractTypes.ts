import type { Project } from "@/data/ui";
import type { QuotationLine } from "@/components/quotations/quotationTypes";
import { calculateArea, formatCurrency } from "@/components/quotations/quotationTypes";

export type ContractLanguage = "en" | "ar";

export type ContractDraft = {
  id?: string;
  contractNumber: string;
  contractDate: string;
  quotationNumber: string;
  project: Project;
  openingSchedule?: QuotationLine[];
  clientPhone: string;
  clientAddress: string;
  totalAmount: number;
  paymentTerms: string;
  warrantyTerms: string;
  executionTerms: string;
  contractTerms: string;
  firstPartyObligations: string;
  secondPartyObligations: string;
  notes: string;
  salesEngineer: string;
  preparedBy: string;
  language: ContractLanguage;
};

export type ContractTemplate = {
  paymentTerms: string;
  warrantyTerms: string;
  executionTerms: string;
  contractTerms: string;
  firstPartyObligations: string;
  secondPartyObligations: string;
};

export const contractStorageKey = "alumex-current-contract";

export function getProductSystems(project: Project) {
  const systems = new Set(
    project.structuralOpenings
      .map((opening) => opening.productSystem)
      .filter(Boolean),
  );

  return Array.from(systems);
}

export function estimateContractTotal(project: Project) {
  return project.structuralOpenings.reduce((sum, opening) => {
    const system = opening.productSystem.toLowerCase();
    const unitPrice = system.includes("curtain")
      ? 165
      : system.includes("sliding")
        ? 95
        : 120;

    return sum + calculateArea(opening) * unitPrice;
  }, 0);
}

export function money(value: number) {
  return formatCurrency(value);
}
