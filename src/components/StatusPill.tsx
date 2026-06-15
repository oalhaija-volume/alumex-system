"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

const statusStyles: Record<string, string> = {
  Active: "bg-success-surface text-success-text ring-border",
  Approved: "bg-success-surface text-success-text ring-border",
  Sent: "bg-info-surface text-info-text ring-border",
  Draft: "bg-surface-muted text-muted-strong ring-border",
  Measuring: "bg-info-surface text-info-text ring-border",
  Quotation: "bg-info-surface text-info-text ring-border",
  Contract: "bg-info-surface text-info-text ring-border",
  Production: "bg-info-surface text-info-text ring-border",
  Completed: "bg-success-surface text-success-text ring-border",
  Review: "bg-warning-surface text-warning-text ring-border",
  Proposal: "bg-info-surface text-info-text ring-border",
};

export function StatusPill({ status }: { status: string }) {
  const { term } = useI18n();

  return (
    <span
      className={`inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold ring-1 ring-inset ${
        statusStyles[status] ?? "bg-surface-muted text-muted-strong ring-border"
      }`}
    >
      {term(status)}
    </span>
  );
}
