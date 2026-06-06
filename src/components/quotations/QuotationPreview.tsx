"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";
import {
  calculateLineTotal,
  calculateQuotationTotals,
  quotationStorageKey,
  type QuotationDraft,
} from "@/components/quotations/quotationTypes";

function QuotationCoverPage({
  draft,
  grandTotal,
}: {
  draft: QuotationDraft;
  grandTotal: number;
}) {
  const { formatCurrency, formatDate, t, term } = useI18n();

  return (
    <section className="a4-page pdf-page contract-cover-page relative mx-auto mb-6 overflow-hidden bg-white shadow-sm ring-1 ring-slate-200 print:mb-0 print:shadow-none print:ring-0">
      <div className="absolute inset-x-0 top-0 h-3 bg-[var(--alumex-red)]" />
      <div className="absolute inset-y-0 end-0 w-7 bg-[var(--alumex-blue)]" />
      <div className="absolute end-7 top-0 h-72 w-36 bg-slate-900" />
      <div className="absolute bottom-0 start-0 h-32 w-full bg-slate-950" />

      <div className="relative z-10 flex min-h-full flex-col">
        <header className="flex items-start justify-between gap-8">
          <BrandMark />
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              {t("quotations.quotationPackage")}
            </p>
            <p className="mt-2 text-sm font-bold text-[var(--alumex-blue)]">
              {draft.quotationNumber}
            </p>
          </div>
        </header>

        <div className="mt-28 max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-[var(--alumex-red)]">
            {t("app.name")}
          </p>
          <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight text-slate-950 sm:text-6xl">
            {t("quotations.commercialQuotation")}
          </h1>
          <div className="mt-8 h-1.5 w-28 bg-[var(--alumex-blue)]" />
          <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-600">
            {t("quotations.coverDescription")}
          </p>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-2">
          {[
            [t("contracts.clientName"), term(draft.project.client)],
            [t("projects.fields.projectName"), term(draft.project.projectName)],
            [t("quotations.quotationNumber"), draft.quotationNumber],
            [t("common.date"), formatDate(new Date())],
            [t("contracts.totalAmount"), formatCurrency(grandTotal)],
            [t("contracts.preparedBy"), draft.preparedBy || t("quotations.defaultPreparedBy")],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-s-4 border-[var(--alumex-blue)] bg-slate-50 px-5 py-4"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <footer className="relative z-10 mt-auto grid gap-6 pt-16 text-white md:grid-cols-[1fr_280px] md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-300">
              {t("quotations.projectType")}
            </p>
            <p className="mt-3 text-xl font-bold">{term(draft.project.projectType)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-300">
              {t("contracts.salesEngineer")}
            </p>
            <p className="mt-3 text-xl font-bold">
              {term(draft.project.salesEngineer)}
            </p>
          </div>
        </footer>
      </div>
    </section>
  );
}

export function QuotationPreview() {
  const { formatCurrency, formatDate, t, term } = useI18n();
  const [draft, setDraft] = useState<QuotationDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedDraft = window.localStorage.getItem(quotationStorageKey);

      if (storedDraft) {
        setDraft(JSON.parse(storedDraft) as QuotationDraft);
      }
      setIsLoading(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const totals = useMemo(
    () =>
      draft
        ? calculateQuotationTotals(draft.lines, draft.discountPercent)
        : null,
    [draft],
  );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">
            {t("quotations.loadingPreview")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("quotations.loadingPreviewDescription")}
          </p>
        </div>
      </main>
    );
  }

  if (!draft || !totals) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">
            {t("quotations.noPreview")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("quotations.noPreviewDescription")}
          </p>
          <Link
            href="/quotations"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white"
          >
            {t("quotations.backToBuilder")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-col gap-3 sm:flex-row sm:justify-between">
        <Link
          href="/quotations"
          className="flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
        >
          {t("quotations.backToBuilder")}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row">
          <p className="flex min-h-11 items-center rounded-md border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700">
            {t("quotations.savedQuotation")}
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
          >
            {t("quotations.printQuotation")}
          </button>
          <PdfDownloadButton
            elementId="quotation-pdf"
            fileName={`${draft.quotationNumber}.pdf`}
            label={t("quotations.generateQuotationPdf")}
          />
        </div>
      </div>

      <article id="quotation-pdf" className="mx-auto print:max-w-none">
        <QuotationCoverPage draft={draft} grandTotal={totals.grandTotal} />

        <section className="a4-page pdf-page print-page bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
          <header className="flex flex-col gap-6 border-b-4 border-[var(--alumex-blue)] pb-6 sm:flex-row sm:items-start sm:justify-between">
          <BrandMark />
          <div className="text-left sm:text-right">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--alumex-red)]">
              {t("quotations.quotation")}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">
              {draft.quotationNumber}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("common.issued")}: {formatDate(new Date())}
            </p>
          </div>
          </header>

          <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.clientInformation")}
            </h2>
            <p className="mt-3 text-lg font-bold text-slate-950">
              {term(draft.project.client)}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {term(draft.project.address)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.projectInformation")}
            </h2>
            <p className="mt-3 text-lg font-bold text-slate-950">
              {term(draft.project.projectName)}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {draft.project.projectNumber} - {term(draft.project.projectType)}
            </p>
            <p className="text-sm leading-6 text-slate-600">
              {t("contracts.salesEngineer")}: {term(draft.project.salesEngineer)}
            </p>
          </div>
          </section>

          <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("quotations.openings")}
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-[10px]">
              <caption className="sr-only">{t("quotations.openingTotalsCaption")}</caption>
              <thead className="bg-slate-50 font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">{t("common.code")}</th>
                  <th className="px-3 py-3">{t("common.location")}</th>
                  <th className="px-3 py-3">{t("common.system")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.width")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.height")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.quantity")}</th>
                  <th className="px-3 py-3">{t("common.areaSqm")}</th>
                  <th className="px-3 py-3">{t("quotations.unitPricePerSqm")}</th>
                  <th className="px-3 py-3 text-right">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draft.lines.map((line) => {
                  const lineTotal = calculateLineTotal(line);

                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-3 font-bold text-slate-950">
                        {line.openingCode}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {term(line.floor)} - {term(line.room)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {term(line.productSystem)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {t("common.cmValue", { value: line.width })}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {t("common.cmValue", { value: line.height })}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {line.quantity}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {t("common.areaValue", { value: lineTotal.area.toFixed(2) })}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-950">
                        {formatCurrency(lineTotal.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("common.notes")}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {draft.notes || t("quotations.noNotes")}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.totals")}
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t("common.subtotal")}</span>
                <span className="font-bold text-slate-950">
                  {formatCurrency(totals.subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t("common.lineDiscounts")}</span>
                <span className="font-bold text-red-700">
                  -{formatCurrency(totals.lineDiscountTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {t("common.quotationDiscount")} ({draft.discountPercent}%)
                </span>
                <span className="font-bold text-red-700">
                  -{formatCurrency(totals.quotationDiscount)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between text-lg">
                  <span className="font-bold text-slate-950">
                    {t("common.grandTotal")}
                  </span>
                  <span className="font-bold text-[var(--alumex-blue)]">
                    {formatCurrency(totals.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          </section>
        </section>

        <section className="a4-page pdf-page print-page bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
          <div className="flex min-h-full flex-col">
            <header className="border-b-4 border-[var(--alumex-blue)] pb-6">
              <BrandMark />
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--alumex-red)]">
                {t("quotations.quotationApproval")}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-950">
                {t("common.signatures")}
              </h2>
            </header>
            <div className="mt-auto">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("common.signatures")}
          </h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-2">
            <div>
              <div className="border-t border-slate-400 pt-3">
                <p className="text-sm font-bold text-slate-950">
                  {draft.preparedBy || t("quotations.preparedBy")}
                </p>
                <p className="text-xs text-slate-500">
                  {t("quotations.alumexRepresentative")}
                </p>
              </div>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-3">
                <p className="text-sm font-bold text-slate-950">
                  {draft.clientRepresentative || t("quotations.clientRepresentative")}
                </p>
                <p className="text-xs text-slate-500">
                  {t("quotations.clientApproval")}
                </p>
              </div>
            </div>
          </div>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
