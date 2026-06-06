"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/components/clients/ClientsProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import {
  contractStorageKey,
  getProductSystems,
  type ContractDraft,
  type ContractLanguage,
} from "@/components/contracts/contractTypes";
import {
  calculateQuotationTotals,
  savedQuotationsStorageKey,
  type QuotationDraft,
} from "@/components/quotations/quotationTypes";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ContractGenerator() {
  const router = useRouter();
  const { formatCurrency, t, term } = useI18n();
  const { clients } = useClients();
  const [savedQuotations, setSavedQuotations] = useState<QuotationDraft[]>([]);
  const [quotationNumber, setQuotationNumber] = useState("");
  const [contractNumber, setContractNumber] = useState("CT-2026-0090");
  const [contractDate, setContractDate] = useState(today());
  const [language, setLanguage] = useState<ContractLanguage>("ar");
  const [paymentTerms, setPaymentTerms] = useState(() =>
    t("contracts.defaultPaymentTerms"),
  );
  const [warrantyTerms, setWarrantyTerms] = useState(() =>
    t("contracts.defaultWarrantyTerms"),
  );
  const [executionTerms, setExecutionTerms] = useState(() =>
    t("contracts.defaultExecutionTerms"),
  );
  const [notes, setNotes] = useState(() => t("contracts.defaultNotes"));
  const [preparedBy, setPreparedBy] = useState(() =>
    t("contracts.defaultPreparedBy"),
  );
  const selectedQuotation = savedQuotations.find(
    (quotation) => quotation.quotationNumber === quotationNumber,
  );
  const selectedProject = selectedQuotation?.project;
  const selectedClient = selectedProject
    ? clients.find((client) => client.clientName === selectedProject.client)
    : undefined;
  const clientPhone = selectedClient?.mobile ?? "";
  const clientAddress = selectedClient?.address ?? selectedProject?.address ?? "";
  const productSystems = selectedProject ? getProductSystems(selectedProject) : [];
  const totalAmount = selectedQuotation
    ? calculateQuotationTotals(
        selectedQuotation.lines,
        selectedQuotation.discountPercent,
      ).grandTotal
    : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedQuotations = window.localStorage.getItem(
        savedQuotationsStorageKey,
      );
      const nextQuotations = storedQuotations
        ? (JSON.parse(storedQuotations) as QuotationDraft[])
        : [];

      setSavedQuotations(nextQuotations);
      setQuotationNumber(nextQuotations[0]?.quotationNumber ?? "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function openPreview() {
    if (!selectedProject || !selectedQuotation) {
      return;
    }

    const draft: ContractDraft = {
      contractNumber,
      contractDate,
      quotationNumber: selectedQuotation.quotationNumber,
      project: selectedProject,
      clientPhone,
      clientAddress,
      totalAmount,
      paymentTerms,
      warrantyTerms,
      executionTerms,
      notes,
      salesEngineer: selectedProject.salesEngineer,
      preparedBy,
      language,
    };

    window.localStorage.setItem(contractStorageKey, JSON.stringify(draft));
    router.push("/contracts/preview");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("contracts.eyebrow")}
        title={t("contracts.generator")}
        description={t("contracts.generatorDescription")}
      />

      <SectionCard title={t("contracts.contractSource")}>
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_220px_180px] lg:items-end">
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("contracts.selectQuotation")}
            </span>
            <select
              value={quotationNumber}
              onChange={(event) => setQuotationNumber(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            >
              {savedQuotations.map((quotation) => (
                <option key={quotation.quotationNumber} value={quotation.quotationNumber}>
                  {quotation.quotationNumber} - {term(quotation.project.projectName)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("contracts.contractNumber")}
            </span>
            <input
              value={contractNumber}
              onChange={(event) => setContractNumber(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">{t("common.date")}</span>
            <input
              type="date"
              value={contractDate}
              onChange={(event) => setContractDate(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">{t("contracts.language")}</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as ContractLanguage)
              }
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            >
              <option value="ar">{t("contracts.arabicRtl")}</option>
              <option value="en">{t("contracts.english")}</option>
            </select>
          </label>
        </div>
      </SectionCard>

      {savedQuotations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-bold text-slate-950">
            {t("contracts.noSavedQuotations")}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {t("contracts.noSavedQuotationsDescription")}
          </p>
        </div>
      ) : null}

      {selectedProject ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("contracts.clientName")}
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {term(selectedProject.client)}
            </p>
            <p className="mt-1 text-sm text-slate-500">{clientPhone}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("contracts.project")}
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {term(selectedProject.projectName)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {term(selectedProject.address)}
            </p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              {t("contracts.totalAmount")}
            </p>
            <p className="mt-2 text-2xl font-bold text-[var(--alumex-blue)]">
              {formatCurrency(totalAmount)}
            </p>
            <p className="mt-1 text-sm text-blue-700">
              {t("contracts.salesEngineer")}: {term(selectedProject.salesEngineer)}
            </p>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <SectionCard title={t("contracts.autoFilledDetails")}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("contracts.productSystems")}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-950">
                {productSystems.length > 0
                  ? productSystems.map((system) => term(system)).join(", ")
                  : t("contracts.noSystemsAdded")}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("quotations.openings")}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-950">
                {t("contracts.structuralOpeningsCount", {
                  count: selectedProject?.structuralOpenings.length ?? 0,
                })}
              </p>
            </div>
            <label className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("contracts.preparedBy")}
              </span>
              <input
                value={preparedBy}
                onChange={(event) => setPreparedBy(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title={t("contracts.preview")}>
          <button
            type="button"
            onClick={openPreview}
            disabled={!selectedProject}
            className="h-11 w-full rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--alumex-blue-dark)] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t("contracts.generateContract")}
          </button>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {t("contracts.previewDescription")}
          </p>
        </SectionCard>
      </section>

      <SectionCard title={t("contracts.contractTerms")}>
        <div className="grid gap-4">
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("contracts.paymentTerms")}
            </span>
            <textarea
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("contracts.warrantyTerms")}
            </span>
            <textarea
              value={warrantyTerms}
              onChange={(event) => setWarrantyTerms(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("contracts.executionTerms")}
            </span>
            <textarea
              value={executionTerms}
              onChange={(event) => setExecutionTerms(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("common.notes")}
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </div>
      </SectionCard>
    </div>
  );
}
