import type { ProjectSalesStatus } from "@/lib/workflow/salesStatuses";

export const defaultQuotationFollowUpIntervalDays = 5;

export function addCalendarDays(date: Date, days: number) {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError("Follow-up interval must be a positive whole number.");
  }

  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export function quotationFollowUpDueAt(
  sharedAt: Date,
  intervalDays = defaultQuotationFollowUpIntervalDays,
) {
  return addCalendarDays(sharedAt, intervalDays);
}

export function followUpDeduplicationKey({
  taskType,
  projectId,
  quotationId,
  status,
}: {
  taskType: "structure_readiness" | "quotation";
  projectId: string;
  quotationId?: string | null;
  status?: ProjectSalesStatus;
}) {
  return [
    taskType,
    projectId,
    quotationId ?? "project",
    status ?? "open",
  ].join(":");
}
