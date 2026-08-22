import type { AppRole } from "@/lib/auth/roles";

export const quotationCreatorRoles = ["Admin", "Indoor Sales"] as const;

export function canCreateQuotationForRole(role: AppRole | null) {
  return role !== null && quotationCreatorRoles.some((item) => item === role);
}

export function isProjectReadyForQuotation(project: {
  salesStatus?: string;
  structureReadiness?: string;
  openingCount: number;
}) {
  return (
    project.salesStatus === "ready_for_quotation" &&
    project.structureReadiness === "ready" &&
    project.openingCount > 0
  );
}
