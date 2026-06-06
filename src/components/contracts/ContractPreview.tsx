"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";
import {
  contractStorageKey,
  getProductSystems,
  type ContractDraft,
} from "@/components/contracts/contractTypes";

function ContractCoverPage({
  draft,
  isArabic,
}: {
  draft: ContractDraft;
  isArabic: boolean;
}) {
  const { formatCurrency, formatDate, t, term } = useI18n();

  return (
    <section
      dir={isArabic ? "rtl" : "ltr"}
      className="pdf-page contract-cover-page relative mx-auto mb-6 min-h-[1050px] max-w-5xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200 print:mb-0 print:max-w-none print:shadow-none print:ring-0"
    >
      <div className="absolute inset-x-0 top-0 h-3 bg-[var(--alumex-red)]" />
      <div className="absolute inset-y-0 end-0 w-7 bg-[var(--alumex-blue)]" />
      <div className="absolute end-7 top-0 h-72 w-36 bg-slate-900" />
      <div className="absolute bottom-0 start-0 h-32 w-full bg-slate-950" />

      <div className="relative z-10 flex min-h-[1050px] flex-col p-10 sm:p-14">
        <header className="flex items-start justify-between gap-8">
          <BrandMark />
          <div className={isArabic ? "text-left" : "text-right"}>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              {t("contracts.contractPackage")}
            </p>
            <p className="mt-2 text-sm font-bold text-[var(--alumex-blue)]">
              {draft.contractNumber}
            </p>
          </div>
        </header>

        <div className="mt-28 max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-[var(--alumex-red)]">
            {t("app.name")}
          </p>
          <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight text-slate-950 sm:text-6xl">
            {t("contracts.supplyInstallationContract")}
          </h1>
          <div className="mt-8 h-1.5 w-28 bg-[var(--alumex-blue)]" />
          <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-600">
            {t("contracts.coverDescription")}
          </p>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-2">
          {[
            [
              t("contracts.clientName"),
              term(draft.project.client),
            ],
            [
              t("projects.fields.projectName"),
              term(draft.project.projectName),
            ],
            [
              t("contracts.contractNumber"),
              draft.contractNumber,
            ],
            [t("quotations.quotationNumber"), draft.quotationNumber],
            [t("common.date"), formatDate(draft.contractDate)],
            [
              t("contracts.totalAmount"),
              formatCurrency(draft.totalAmount),
            ],
            [
              t("contracts.preparedBy"),
              draft.preparedBy,
            ],
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
              {t("contracts.productSystems")}
            </p>
            <p className="mt-3 text-xl font-bold">
              {getProductSystems(draft.project).map((system) => term(system)).join(" | ") ||
                t("common.notSpecified")}
            </p>
          </div>
          <div className={isArabic ? "text-left" : "text-right"}>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-300">
              {t("contracts.salesEngineer")}
            </p>
            <p className="mt-3 text-xl font-bold">{term(draft.salesEngineer)}</p>
          </div>
        </footer>
      </div>
    </section>
  );
}

export function ContractPreview() {
  const { formatCurrency, formatDate, t, term } = useI18n();
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedDraft = window.localStorage.getItem(contractStorageKey);

      if (storedDraft) {
        setDraft(JSON.parse(storedDraft) as ContractDraft);
      }
      setIsLoading(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const productSystems = useMemo(
    () => (draft ? getProductSystems(draft.project) : []),
    [draft],
  );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">
            {t("contracts.loadingPreview")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("contracts.loadingPreviewDescription")}
          </p>
        </div>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">
            {t("contracts.noPreview")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("contracts.noPreviewDescription")}
          </p>
          <Link
            href="/contracts"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white"
          >
            {t("contracts.backToGenerator")}
          </Link>
        </div>
      </main>
    );
  }

  const isArabic = draft.language === "ar";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-col gap-3 sm:flex-row sm:justify-between">
        <Link
          href="/contracts"
          className="flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
        >
          {t("contracts.backToGenerator")}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.print()}
            className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
          >
            {t("contracts.printContract")}
          </button>
          <PdfDownloadButton
            elementId="contract-pdf"
            fileName={`${draft.contractNumber}.pdf`}
            label={t("contracts.generateContractPdf")}
          />
        </div>
      </div>

      <article
        id="contract-pdf"
        dir={isArabic ? "rtl" : "ltr"}
        className="mx-auto max-w-5xl print:max-w-none"
      >
        <ContractCoverPage draft={draft} isArabic={isArabic} />

        <section className="pdf-page print-page bg-white p-6 shadow-sm ring-1 ring-slate-200 print:p-8 print:shadow-none print:ring-0 sm:p-10">
          <header className="flex flex-col gap-6 border-b-4 border-[var(--alumex-blue)] pb-6 sm:flex-row sm:items-start sm:justify-between">
            <BrandMark />
            <div className={isArabic ? "text-right" : "text-left sm:text-right"}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--alumex-red)]">
              {t("contracts.contract")}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">
              {t("contracts.aluminumGlassWorksContract")}
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {t("contracts.contractNumber")}:{" "}
              {draft.contractNumber}
            </p>
            <p className="text-sm text-slate-500">
              {t("common.date")}: {formatDate(draft.contractDate)}
            </p>
            </div>
          </header>

          <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.clientInformation")}
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="font-bold text-slate-500">
                  {t("contracts.clientName")}
                </dt>
                <dd className="mt-1 font-bold text-slate-950">
                  {term(draft.project.client)}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">
                  {t("contracts.phone")}
                </dt>
                <dd className="mt-1 text-slate-700">
                  {draft.clientPhone || t("common.notAvailable")}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">
                  {t("clients.fields.address")}
                </dt>
                <dd className="mt-1 text-slate-700">{term(draft.clientAddress)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.projectInformation")}
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="font-bold text-slate-500">
                  {t("contracts.project")}
                </dt>
                <dd className="mt-1 font-bold text-slate-950">
                  {term(draft.project.projectName)}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">
                  {t("contracts.salesEngineer")}
                </dt>
                <dd className="mt-1 text-slate-700">{term(draft.salesEngineer)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">
                  {t("contracts.totalAmount")}
                </dt>
                <dd className="mt-1 text-lg font-bold text-[var(--alumex-blue)]">
                  {formatCurrency(draft.totalAmount)}
                </dd>
              </div>
            </dl>
          </div>
          </section>

          <section className="mt-8 rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("contracts.scopeOfWork")}
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-700">
            {t("contracts.scopeDescription")}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("contracts.productSystems")}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-950">
                {productSystems.length > 0
                  ? productSystems.map((system) => term(system)).join(", ")
                  : t("contracts.noSystemsAdded")}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("quotations.openings")}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-950">
                {draft.project.structuralOpenings.length}
              </p>
            </div>
          </div>
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            [
              t("contracts.paymentTerms"),
              draft.paymentTerms,
              t("contracts.defaultPaymentTerms"),
            ],
            [
              t("contracts.warrantyTerms"),
              draft.warrantyTerms,
              t("contracts.defaultWarrantyTerms"),
            ],
            [
              t("contracts.executionTerms"),
              draft.executionTerms,
              t("contracts.defaultExecutionTerms"),
            ],
            [
              t("common.notes"),
              draft.notes,
              t("contracts.defaultNotes"),
            ],
          ].map(([title, englishText, arabicText]) => (
            <div key={title} className="rounded-lg border border-slate-200 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                {title}
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {englishText || arabicText}
              </p>
            </div>
          ))}
          </section>

        </section>

        <section className="pdf-page print-page mt-6 bg-white p-6 shadow-sm ring-1 ring-slate-200 print:mt-0 print:p-8 print:shadow-none print:ring-0 sm:p-10">
          <div className="flex min-h-[900px] flex-col">
            <header className="border-b-4 border-[var(--alumex-blue)] pb-6">
              <BrandMark />
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--alumex-red)]">
                {t("quotations.clientApproval")}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-950">
                {t("common.signatures")}
              </h2>
            </header>
            <div className="mt-auto grid gap-10 sm:grid-cols-2">
              <div>
                <div className="border-t border-slate-400 pt-3">
                  <p className="text-sm font-bold text-slate-950">
                    {t("quotations.alumexRepresentative")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {term(draft.salesEngineer)}
                  </p>
                </div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-3">
                  <p className="text-sm font-bold text-slate-950">
                    {t("quotations.clientRepresentative")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {term(draft.project.client)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
