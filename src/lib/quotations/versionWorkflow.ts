export const quotationVersionStatuses = [
  "draft",
  "ready_for_review",
  "approved",
  "presented",
  "sent",
  "rejected",
  "superseded",
  "expired",
] as const;

export type QuotationVersionStatus =
  (typeof quotationVersionStatuses)[number];

export type QuotationVersionAction =
  | "mark_ready"
  | "present"
  | "send"
  | "approve"
  | "record_print";

const actionsByStatus: Record<
  QuotationVersionStatus,
  readonly QuotationVersionAction[]
> = {
  draft: ["mark_ready", "approve", "record_print"],
  ready_for_review: ["present", "send", "approve", "record_print"],
  presented: ["send", "approve", "record_print"],
  sent: ["approve", "record_print"],
  approved: ["record_print"],
  rejected: ["record_print"],
  superseded: ["record_print"],
  expired: ["record_print"],
};

export function canRunQuotationVersionAction(
  status: QuotationVersionStatus,
  action: QuotationVersionAction,
) {
  return actionsByStatus[status].includes(action);
}

export function canCreateContractFromQuotationVersion(
  status: QuotationVersionStatus,
) {
  return status === "approved";
}
