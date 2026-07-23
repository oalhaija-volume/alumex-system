"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";
import { canViewSalesPrices } from "@/lib/auth/roles";
import {
  calculateLineTotal,
  calculateQuotationTotals,
  pricingUnitForLine,
  quotationStorageKey,
  type QuotationDraft,
} from "@/components/quotations/quotationTypes";

const totalPages = 3;

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo/AlumexLogo.svg"
      alt="Alumex Experts"
      className="h-auto w-[38mm] object-contain"
    />
  );
}

function PageHeader({
  quotationNumber,
  page,
}: {
  quotationNumber: string;
  page: number;
}) {
  const { t } = useI18n();

  return (
    <header className="shrink-0">
      <div className="flex items-start justify-between gap-8">
        <Logo />
        <div className="text-right text-[8px] font-bold uppercase tracking-wide text-slate-500">
          <p>{t("quotations.quotation")}</p>
          <p className="mt-1 text-[13px] tracking-normal text-slate-950">
            {quotationNumber}
          </p>
          <p className="mt-1 font-semibold normal-case tracking-normal">
            {t("common.page")} {page} / {totalPages}
          </p>
        </div>
      </div>
      <div className="mt-5 h-[1.5px] w-full bg-[var(--alumex-blue)]" />
    </header>
  );
}

function PageFooter({
  quotationNumber,
  page,
}: {
  quotationNumber: string;
  page: number;
}) {
  const { t } = useI18n();

  return (
    <footer className="mt-auto shrink-0 pt-5 text-[8px] font-semibold text-slate-500">
      <div className="h-px bg-slate-200" />
      <div className="mt-2 flex items-center justify-between gap-4">
        <span>{quotationNumber}</span>
        <span>{t("common.page")} {page} / {totalPages}</span>
      </div>
    </footer>
  );
}

function DocumentPage({
  children,
  quotationNumber,
  page,
  className = "",
}: {
  children: React.ReactNode;
  quotationNumber: string;
  page: number;
  className?: string;
}) {
  return (
    <section
      className={`a4-page quotation-pdf-page pdf-page print-page mx-auto mb-6 flex flex-col bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 print:mb-0 print:shadow-none print:ring-0 ${className}`}
    >
      <PageHeader quotationNumber={quotationNumber} page={page} />
      <div className="min-h-0 flex-1">{children}</div>
      <PageFooter quotationNumber={quotationNumber} page={page} />
    </section>
  );
}

function Field({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-md border px-4 py-3 ${
        dark
          ? "border-white/15 bg-white/10 text-white"
          : "border-slate-200 bg-slate-50 text-slate-950"
      }`}
    >
      <p
        className={`text-[8px] font-bold uppercase tracking-wide ${
          dark ? "text-white/65" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p className="mt-1.5 break-words text-[13px] font-bold leading-snug">
        {value}
      </p>
    </div>
  );
}

function formatIqd(value: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    maximumFractionDigits: 0,
  });
  const amount = formatter.format(Math.round(value));

  return locale === "ar" ? `${amount} د.ع` : `IQD ${amount}`;
}

function CoverPage({
  draft,
  grandTotal,
  showSalesPrices,
}: {
  draft: QuotationDraft;
  grandTotal: number;
  showSalesPrices: boolean;
}) {
  const { formatDate, locale, t, term } = useI18n();

  return (
    <section className="a4-page quotation-pdf-page pdf-page contract-cover-page relative mx-auto mb-6 overflow-hidden bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 print:mb-0 print:shadow-none print:ring-0">
      <div className="absolute inset-x-0 top-0 h-2 bg-[var(--alumex-red)]" />
      <div className="absolute bottom-0 left-0 h-[42mm] w-full bg-slate-950" />
      <div className="absolute bottom-[42mm] left-0 h-[2mm] w-full bg-[var(--alumex-blue)]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="flex items-start justify-between gap-8">
          <Logo />
          <div className="text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {t("quotations.quotationPackage")}
            </p>
            <p className="mt-2 text-[15px] font-black text-[var(--alumex-blue)]">
              {draft.quotationNumber}
            </p>
          </div>
        </header>

        <section className="mt-14 max-w-[138mm]">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--alumex-red)]">
            {t("quotations.quotation")}
          </p>
          <h1 className="mt-4 text-[34px] font-black leading-[1.08] text-slate-950">
            {t("quotations.commercialQuotation")}
          </h1>
          <div className="mt-5 h-[2px] w-[34mm] bg-[var(--alumex-blue)]" />
          <p className="mt-5 max-w-[124mm] text-[12px] leading-6 text-slate-600">
            {t("quotations.coverDescription")}
          </p>
        </section>

        <section className="mt-10 grid grid-cols-2 gap-3">
          <Field label={t("contracts.clientName")} value={term(draft.project.client)} />
          <Field label={t("projects.fields.projectName")} value={term(draft.project.projectName)} />
          <Field label={t("quotations.quotationNumber")} value={draft.quotationNumber} />
          <Field
            label={locale === "ar" ? "نوع التسعير" : "Pricing source"}
            value={
              draft.pricingSource === "project_costing"
                ? locale === "ar"
                  ? "عرض سعر مبني على التكلفة"
                  : "Costing-based quotation"
                : locale === "ar"
                  ? "عرض سعر من دليل الأسعار"
                  : "Catalog quotation"
            }
          />
          <Field label={t("common.date")} value={formatDate(new Date())} />
          {showSalesPrices ? (
            <Field label={t("contracts.totalAmount")} value={formatIqd(grandTotal, locale)} />
          ) : null}
          <Field
            label={t("contracts.preparedBy")}
            value={draft.preparedBy || t("quotations.defaultPreparedBy")}
          />
        </section>

        <section className="mt-auto grid grid-cols-2 gap-4 pb-1 text-white">
          <Field label={t("quotations.projectType")} value={term(draft.project.projectType)} dark />
          <Field label={t("contracts.salesEngineer")} value={term(draft.project.salesEngineer)} dark />
        </section>
      </div>
    </section>
  );
}

function DetailsPage({
  draft,
  totals,
  showSalesPrices,
}: {
  draft: QuotationDraft;
  totals: ReturnType<typeof calculateQuotationTotals>;
  showSalesPrices: boolean;
}) {
  const { locale, t, term } = useI18n();

  return (
    <DocumentPage quotationNumber={draft.quotationNumber} page={2}>
      <section className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-[9px] font-black uppercase tracking-wide text-[var(--alumex-blue)]">
            {t("quotations.clientInformation")}
          </h2>
          <p className="mt-2 text-[14px] font-black leading-snug text-slate-950">
            {term(draft.project.client)}
          </p>
          <p className="mt-1 text-[10px] leading-5 text-slate-600">
            {term(draft.project.address)}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-[9px] font-black uppercase tracking-wide text-[var(--alumex-blue)]">
            {t("quotations.projectInformation")}
          </h2>
          <p className="mt-2 text-[14px] font-black leading-snug text-slate-950">
            {term(draft.project.projectName)}
          </p>
          <p className="mt-1 text-[10px] leading-5 text-slate-600">
            {draft.project.projectNumber} - {term(draft.project.projectType)}
          </p>
          <p className="text-[10px] leading-5 text-slate-600">
            {t("contracts.salesEngineer")}: {term(draft.project.salesEngineer)}
          </p>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-[9px] font-black uppercase tracking-wide text-slate-500">
          {t("quotations.openings")}
        </h2>
        <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
          <table className="w-full table-fixed border-collapse text-left text-[6.7px] leading-tight">
            <caption className="sr-only">{t("quotations.openingTotalsCaption")}</caption>
            <thead className="bg-[var(--alumex-blue)] text-white">
              <tr>
                <th className="w-[8%] px-1 py-2">{t("common.code")}</th>
                <th className="w-[11%] px-1 py-2">{t("common.location")}</th>
                <th className="w-[12%] px-1 py-2">{t("common.system")}</th>
                <th className="w-[10%] px-1 py-2">{t("quotations.glass")}</th>
                <th className="w-[7%] px-1 py-2">{t("projects.openings.fields.width")}</th>
                <th className="w-[7%] px-1 py-2">{t("projects.openings.fields.height")}</th>
                <th className="w-[7%] px-1 py-2">{t("projects.openings.fields.solidPanelHeight")}</th>
                <th className="w-[5%] px-1 py-2">{t("projects.openings.fields.quantity")}</th>
                <th className="w-[8%] px-1 py-2">{t("quotations.billableBasis")}</th>
                {showSalesPrices ? (
                  <>
                    <th className="w-[11%] px-1 py-2">{t("quotations.unitPricePerSqm")}</th>
                    <th className="w-[8%] px-1 py-2">{t("common.discount")}</th>
                    <th className="w-[11%] px-1 py-2 text-right">{t("common.total")}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, index) => {
                const lineTotal = calculateLineTotal(line);
                const isBaseLine = (line.lineType ?? "base") === "base";
                const pricingUnit = pricingUnitForLine(line);

                return (
                  <tr
                    key={line.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  >
                    <td className="break-words border-t border-slate-200 px-1 py-1.5 font-bold">
                      {line.openingCode}
                    </td>
                    <td className="break-words border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {term(line.floor)} - {term(line.room)}
                    </td>
                    <td className="break-words border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {term(line.productSystem)}
                    </td>
                    <td className="break-words border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {term(line.glassType)}
                    </td>
                    <td className="border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {isBaseLine ? line.width : "—"}
                    </td>
                    <td className="border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {isBaseLine ? line.height : "—"}
                    </td>
                    <td className="border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {isBaseLine ? line.solidPanelHeight ?? 0 : "—"}
                    </td>
                    <td className="border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {pricingUnit ? lineTotal.area.toFixed(2) : line.quantity}
                    </td>
                    <td className="border-t border-slate-200 px-1 py-1.5 text-slate-700">
                      {lineTotal.area.toFixed(2)} {pricingUnit ?? "sqm"}
                    </td>
                    {showSalesPrices ? (
                      <>
                        <td className="border-t border-slate-200 px-1 py-1.5 text-slate-700">
                          {formatIqd(line.unitPrice, locale)}
                        </td>
                        <td className="border-t border-slate-200 px-1 py-1.5 text-slate-700">
                          {line.discountPercent}%
                        </td>
                        <td className="border-t border-slate-200 px-1 py-1.5 text-right font-bold text-slate-950">
                          {formatIqd(lineTotal.net, locale)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`mt-5 grid gap-4 ${showSalesPrices ? "grid-cols-[1fr_58mm]" : "grid-cols-1"}`}>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-[9px] font-black uppercase tracking-wide text-slate-500">
            {t("common.notes")}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-slate-700">
            {draft.notes || t("quotations.noNotes")}
          </p>
        </div>
        {showSalesPrices ? (
          <div className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-[9px] font-black uppercase tracking-wide text-[var(--alumex-blue)]">
            {t("quotations.totals")}
          </h2>
          <div className="mt-3 space-y-2 text-[9px]">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{t("common.subtotal")}</span>
              <span className="font-bold">{formatIqd(totals.subtotal, locale)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{t("common.lineDiscounts")}</span>
              <span className="font-bold text-red-700">
                -{formatIqd(totals.lineDiscountTotal, locale)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">
                {t("common.quotationDiscount")} ({draft.discountPercent}%)
              </span>
              <span className="font-bold text-red-700">
                -{formatIqd(totals.quotationDiscount, locale)}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-2">
              <div className="flex justify-between gap-3 text-[12px]">
                <span className="font-black">{t("common.grandTotal")}</span>
                <span className="font-black text-[var(--alumex-blue)]">
                  {formatIqd(totals.grandTotal, locale)}
                </span>
              </div>
            </div>
          </div>
          </div>
        ) : null}
      </section>
    </DocumentPage>
  );
}

function ApprovalPage({ draft }: { draft: QuotationDraft }) {
  const { t } = useI18n();

  return (
    <DocumentPage quotationNumber={draft.quotationNumber} page={3}>
      <section className="mt-12">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--alumex-red)]">
          {t("quotations.quotationApproval")}
        </p>
        <h2 className="mt-3 text-[24px] font-black leading-tight text-slate-950">
          {t("common.signatures")}
        </h2>
        <p className="mt-4 max-w-[130mm] text-[11px] leading-6 text-slate-600">
          {t("quotations.coverDescription")}
        </p>
      </section>

      <section className="mt-24 grid grid-cols-2 gap-12">
        <div className="min-h-[58mm] rounded-md border border-slate-200 bg-slate-50 p-5">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
            {t("quotations.alumexRepresentative")}
          </p>
          <div className="mt-20 border-t border-slate-400 pt-3">
            <p className="text-[12px] font-black text-slate-950">
              {draft.preparedBy || t("quotations.preparedBy")}
            </p>
          </div>
        </div>
        <div className="min-h-[58mm] rounded-md border border-slate-200 bg-slate-50 p-5">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
            {t("quotations.clientRepresentative")}
          </p>
          <div className="mt-20 border-t border-slate-400 pt-3">
            <p className="text-[12px] font-black text-slate-950">
              {draft.clientRepresentative || t("quotations.clientApproval")}
            </p>
          </div>
        </div>
      </section>
    </DocumentPage>
  );
}

export function QuotationPreview() {
  const { direction, t } = useI18n();
  const { role } = useCurrentRole();
  const showSalesPrices = canViewSalesPrices(role);
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
    <main className="min-h-screen max-w-[100vw] overflow-x-hidden bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:justify-between">
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

      <article
        id="quotation-pdf"
        dir={direction}
        className="mx-auto w-full max-w-full overflow-x-hidden print:max-w-none print:overflow-visible"
      >
        <CoverPage draft={draft} grandTotal={totals.grandTotal} showSalesPrices={showSalesPrices} />
        <DetailsPage draft={draft} totals={totals} showSalesPrices={showSalesPrices} />
        <ApprovalPage draft={draft} />
      </article>
    </main>
  );
}
