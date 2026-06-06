"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
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
  type QuotationDraft,
} from "@/components/quotations/quotationTypes";
import { loadSupabaseQuotations } from "@/components/quotations/supabaseQuotations";
import { useProjects } from "@/components/projects/ProjectsProvider";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ContractRow = {
  id: string;
  contract_number: string;
  project_id: string;
  quotation_id: string | null;
  contract_value: number | string;
  contract_date: string | null;
  payment_terms: string | null;
  warranty_terms: string | null;
  execution_terms: string | null;
  prepared_by_text: string | null;
  language: ContractLanguage | null;
  notes: string | null;
};

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

export function ContractGenerator() {
  const router = useRouter();
  const { formatCurrency, t, term } = useI18n();
  const { isAdmin } = useCurrentRole();
  const { clients } = useClients();
  const { projects } = useProjects();
  const [savedQuotations, setSavedQuotations] = useState<QuotationDraft[]>([]);
  const [savedContracts, setSavedContracts] = useState<ContractDraft[]>([]);
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
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ContractDraft | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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
    const timer = window.setTimeout(async () => {
      try {
        const nextQuotations = await loadSupabaseQuotations(projects);
        setSavedQuotations(nextQuotations);
        setQuotationNumber(nextQuotations[0]?.quotationNumber ?? "");

        const contractsResponse = await fetch("/api/contracts", {
          cache: "no-store",
        });

        if (!contractsResponse.ok) {
          throw new Error(
            await readApiError(contractsResponse, t("contracts.loadError")),
          );
        }

        const contractsBody = (await contractsResponse.json()) as {
          contracts?: ContractRow[];
        };
        const nextContracts = (contractsBody.contracts ?? []).reduce<ContractDraft[]>((contracts, contract) => {
          const project = projects.find((item) => item.id === contract.project_id);

          if (!project) {
            return contracts;
          }

          contracts.push({
            id: contract.id,
            contractNumber: contract.contract_number,
            contractDate: contract.contract_date ?? today(),
            quotationNumber:
              nextQuotations.find((quotation) => quotation.id === contract.quotation_id)
                ?.quotationNumber ?? "",
            project,
            clientPhone:
              clients.find((client) => client.id === project.clientId)?.mobile ?? "",
            clientAddress: project.address,
            totalAmount: Number(contract.contract_value ?? 0),
            paymentTerms: contract.payment_terms ?? "",
            warrantyTerms: contract.warranty_terms ?? "",
            executionTerms: contract.execution_terms ?? "",
            notes: contract.notes ?? "",
            salesEngineer: project.salesEngineer,
            preparedBy: contract.prepared_by_text ?? "",
            language: contract.language ?? language,
          });

          return contracts;
        }, []);

        setSavedContracts(nextContracts);
      } catch (loadError) {
        setSavedQuotations([]);
        setSavedContracts([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("contracts.loadError"),
        );
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [clients, language, projects, t]);

  async function openPreview() {
    if (!selectedProject || !selectedQuotation) {
      return;
    }

    if (!selectedProject.clientId || !selectedQuotation.id) {
      setError(t("contracts.saveError"));
      return;
    }

    setError("");
    const response = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contract_number: contractNumber,
        project_id: selectedProject.id,
        quotation_id: selectedQuotation.id,
        client_id: selectedProject.clientId,
        status: "Draft",
        contract_value: totalAmount,
        contract_date: contractDate,
        payment_terms: paymentTerms,
        warranty_terms: warrantyTerms,
        execution_terms: executionTerms,
        prepared_by_text: preparedBy || null,
        language,
        notes,
      }),
    });

    if (!response.ok) {
      setError(await readApiError(response, t("contracts.saveError")));
      return;
    }

    const body = (await response.json()) as { contract?: { id: string } };

    if (!body.contract) {
      setError(t("contracts.saveError"));
      return;
    }

    const draft: ContractDraft = {
      id: body.contract.id,
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

  async function confirmDeleteContract() {
    if (!deleteTarget?.id) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/contracts/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, t("contracts.deleteError")));
      }

      setSavedContracts((contracts) =>
        contracts.filter((contract) => contract.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("contracts.deleteError"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("contracts.eyebrow")}
        title={t("contracts.generator")}
        description={t("contracts.generatorDescription")}
      />

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      <SectionCard title={t("contracts.savedContracts")}>
        {savedContracts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
            {t("contracts.noSavedContracts")}
          </p>
        ) : (
          <div className="grid gap-3">
            {savedContracts.map((contract) => (
              <div
                key={contract.id ?? contract.contractNumber}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {contract.contractNumber}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {term(contract.project.projectName)} -{" "}
                    {formatCurrency(contract.totalAmount)}
                  </p>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(contract)}
                    className="h-10 rounded-md border border-danger-text bg-transparent px-3 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
                  >
                    {t("common.delete")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

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

      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-contract-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h2 id="delete-contract-title" className="text-lg font-bold text-foreground">
              {t("contracts.deleteContract")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-strong">
              {t("contracts.deleteConfirm")}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteContract}
                className="h-11 rounded-md bg-danger-text px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              >
                {isDeleting ? t("common.loading") : t("contracts.deleteContract")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
