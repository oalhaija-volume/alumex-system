"use client";

import { useEffect, useMemo, useState } from "react";
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
  type ContractTemplate,
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
  contract_terms: string | null;
  first_party_obligations: string | null;
  second_party_obligations: string | null;
  prepared_by_text: string | null;
  language: ContractLanguage | null;
  notes: string | null;
};

type ContractTemplateRow = {
  payment_terms: string | null;
  warranty_terms: string | null;
  execution_terms: string | null;
  contract_terms: string | null;
  first_party_obligations: string | null;
  second_party_obligations: string | null;
};

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

async function fetchNextContractNumber(fallback: string) {
  const response = await fetch("/api/contracts/next-number", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, fallback));
  }

  const body = (await response.json()) as { contractNumber?: string };
  return body.contractNumber ?? "";
}

function templateFromRow(row: ContractTemplateRow | null | undefined) {
  return {
    paymentTerms: row?.payment_terms ?? "",
    warrantyTerms: row?.warranty_terms ?? "",
    executionTerms: row?.execution_terms ?? "",
    contractTerms: row?.contract_terms ?? "",
    firstPartyObligations: row?.first_party_obligations ?? "",
    secondPartyObligations: row?.second_party_obligations ?? "",
  };
}

function payloadFromTemplate(template: ContractTemplate) {
  return {
    payment_terms: template.paymentTerms,
    warranty_terms: template.warrantyTerms,
    execution_terms: template.executionTerms,
    contract_terms: template.contractTerms,
    first_party_obligations: template.firstPartyObligations,
    second_party_obligations: template.secondPartyObligations,
  };
}

export function ContractGenerator() {
  const router = useRouter();
  const { formatCurrency, t, term } = useI18n();
  const { isAdmin } = useCurrentRole();
  const { clients } = useClients();
  const { projects } = useProjects();
  const defaultTemplate: ContractTemplate = useMemo(
    () => ({
      paymentTerms: t("contracts.defaultPaymentTerms"),
      warrantyTerms: t("contracts.defaultWarrantyTerms"),
      executionTerms: t("contracts.defaultExecutionTerms"),
      contractTerms: t("contracts.defaultGeneralTerms"),
      firstPartyObligations: t("contracts.defaultFirstPartyObligations"),
      secondPartyObligations: t("contracts.defaultSecondPartyObligations"),
    }),
    [t],
  );
  const [savedQuotations, setSavedQuotations] = useState<QuotationDraft[]>([]);
  const [savedContracts, setSavedContracts] = useState<ContractDraft[]>([]);
  const [quotationNumber, setQuotationNumber] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState(today());
  const [language, setLanguage] = useState<ContractLanguage>("ar");
  const [contractTemplate, setContractTemplate] =
    useState<ContractTemplate>(defaultTemplate);
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
        setQuotationNumber((current) => current || nextQuotations[0]?.quotationNumber || "");

        const [contractsResponse, templateResponse, nextNumber] = await Promise.all([
          fetch("/api/contracts", { cache: "no-store" }),
          fetch("/api/contracts/template", { cache: "no-store" }),
          fetchNextContractNumber(t("contracts.nextNumberError")),
        ]);

        if (!contractsResponse.ok) {
          throw new Error(
            await readApiError(contractsResponse, t("contracts.loadError")),
          );
        }

        if (templateResponse.ok) {
          const templateBody = (await templateResponse.json()) as {
            template?: ContractTemplateRow | null;
          };
          const nextTemplate = {
            ...defaultTemplate,
            ...templateFromRow(templateBody.template),
          };
          setContractTemplate(nextTemplate);
        }

        setContractNumber(nextNumber);

        const contractsBody = (await contractsResponse.json()) as {
          contracts?: ContractRow[];
        };
        const nextContracts = (contractsBody.contracts ?? []).reduce<ContractDraft[]>((contracts, contract) => {
          const project = projects.find((item) => item.id === contract.project_id);

          if (!project) {
            return contracts;
          }

          const nextTemplate = {
            ...defaultTemplate,
            ...templateFromRow(contract),
          };

          contracts.push({
            id: contract.id,
            contractNumber: contract.contract_number,
            contractDate: contract.contract_date ?? today(),
            quotationNumber:
              nextQuotations.find((quotation) => quotation.id === contract.quotation_id)
                ?.quotationNumber ?? "",
            project,
            openingSchedule:
              nextQuotations.find((quotation) => quotation.id === contract.quotation_id)
                ?.lines ?? project.structuralOpenings.map((opening) => ({
                  ...opening,
                  unitPrice: 0,
                  discountPercent: 0,
                })),
            clientPhone:
              clients.find((client) => client.id === project.clientId)?.mobile ?? "",
            clientAddress: project.address,
            totalAmount: Number(contract.contract_value ?? 0),
            paymentTerms: nextTemplate.paymentTerms,
            warrantyTerms: nextTemplate.warrantyTerms,
            executionTerms: nextTemplate.executionTerms,
            contractTerms: nextTemplate.contractTerms,
            firstPartyObligations: nextTemplate.firstPartyObligations,
            secondPartyObligations: nextTemplate.secondPartyObligations,
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
  }, [clients, defaultTemplate, language, projects, t]);

  async function openPreview() {
    if (!selectedProject || !selectedQuotation) {
      return;
    }

    if (!selectedProject.clientId || !selectedQuotation.id) {
      setError(t("contracts.saveError"));
      return;
    }

    setError("");
    let nextContractNumber = contractNumber;

    try {
      nextContractNumber = await fetchNextContractNumber(
        t("contracts.nextNumberError"),
      );
      setContractNumber(nextContractNumber);
    } catch (numberError) {
      setError(
        numberError instanceof Error
          ? numberError.message
          : t("contracts.nextNumberError"),
      );
      return;
    }

    const response = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contract_number: nextContractNumber,
        project_id: selectedProject.id,
        quotation_id: selectedQuotation.id,
        client_id: selectedProject.clientId,
        status: "Draft",
        contract_value: totalAmount,
        contract_date: contractDate,
        ...payloadFromTemplate(contractTemplate),
        prepared_by_text: preparedBy || null,
        language,
        notes,
      }),
    });

    if (!response.ok) {
      setError(await readApiError(response, t("contracts.saveError")));
      return;
    }

    const body = (await response.json()) as {
      contract?: { id: string; contract_number?: string | null };
    };

    if (!body.contract) {
      setError(t("contracts.saveError"));
      return;
    }

    const savedContractNumber =
      body.contract.contract_number ?? nextContractNumber;
    setContractNumber(savedContractNumber);

    const draft: ContractDraft = {
      id: body.contract.id,
      contractNumber: savedContractNumber,
      contractDate,
      quotationNumber: selectedQuotation.quotationNumber,
      project: selectedProject,
      openingSchedule: selectedQuotation.lines,
      clientPhone,
      clientAddress,
      totalAmount,
      paymentTerms: contractTemplate.paymentTerms,
      warrantyTerms: contractTemplate.warrantyTerms,
      executionTerms: contractTemplate.executionTerms,
      contractTerms: contractTemplate.contractTerms,
      firstPartyObligations: contractTemplate.firstPartyObligations,
      secondPartyObligations: contractTemplate.secondPartyObligations,
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

  function updateTemplate(field: keyof ContractTemplate, value: string) {
    setContractTemplate((current) => ({ ...current, [field]: value }));
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
            <span className="text-sm font-bold text-muted-strong">
              {t("contracts.selectQuotation")}
            </span>
            <select
              value={quotationNumber}
              onChange={(event) => setQuotationNumber(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
            >
              {savedQuotations.map((quotation) => (
                <option key={quotation.quotationNumber} value={quotation.quotationNumber}>
                  {quotation.quotationNumber} - {term(quotation.project.projectName)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-bold text-muted-strong">
              {t("contracts.contractNumber")}
            </span>
            <input
              value={contractNumber}
              readOnly
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface-muted px-3 text-sm font-bold text-foreground outline-none"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-muted-strong">{t("common.date")}</span>
            <input
              type="date"
              value={contractDate}
              onChange={(event) => setContractDate(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-muted-strong">{t("contracts.language")}</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as ContractLanguage)
              }
              className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
            >
              <option value="ar">{t("contracts.arabicRtl")}</option>
              <option value="en">{t("contracts.english")}</option>
            </select>
          </label>
        </div>
      </SectionCard>

      {savedQuotations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-bold text-foreground">
            {t("contracts.noSavedQuotations")}
          </p>
          <p className="mt-2 text-sm text-muted">
            {t("contracts.noSavedQuotationsDescription")}
          </p>
        </div>
      ) : null}

      {selectedProject ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("contracts.clientName")}
            </p>
            <p className="mt-2 text-lg font-bold text-foreground">
              {term(selectedProject.client)}
            </p>
            <p className="mt-1 text-sm text-muted">{clientPhone}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("contracts.project")}
            </p>
            <p className="mt-2 text-lg font-bold text-foreground">
              {term(selectedProject.projectName)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {term(selectedProject.address)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-info-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-info-text">
              {t("contracts.totalAmount")}
            </p>
            <p className="mt-2 text-2xl font-bold text-primary">
              {formatCurrency(totalAmount)}
            </p>
            <p className="mt-1 text-sm text-info-text">
              {t("contracts.salesEngineer")}: {term(selectedProject.salesEngineer)}
            </p>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <SectionCard title={t("contracts.autoFilledDetails")}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-muted p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {t("contracts.productSystems")}
              </p>
              <p className="mt-2 text-sm font-bold text-foreground">
                {productSystems.length > 0
                  ? productSystems.map((system) => term(system)).join(", ")
                  : t("contracts.noSystemsAdded")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-muted p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {t("quotations.openings")}
              </p>
              <p className="mt-2 text-sm font-bold text-foreground">
                {t("contracts.structuralOpeningsCount", {
                  count: selectedProject?.structuralOpenings.length ?? 0,
                })}
              </p>
            </div>
            <label className="rounded-lg border border-border bg-surface-muted p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                {t("contracts.preparedBy")}
              </span>
              <input
                value={preparedBy}
                onChange={(event) => setPreparedBy(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title={t("contracts.preview")}>
          <button
            type="button"
            onClick={openPreview}
            disabled={!selectedProject}
            className="h-11 w-full rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
          >
            {t("contracts.generateContract")}
          </button>
          <p className="mt-3 text-sm leading-6 text-muted">
            {t("contracts.previewDescription")}
          </p>
        </SectionCard>
      </section>

      <SectionCard title={t("contracts.contractTerms")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ContractTextField
            label={t("contracts.paymentTerms")}
            value={contractTemplate.paymentTerms}
            onChange={(value) => updateTemplate("paymentTerms", value)}
          />
          <ContractTextField
            label={t("contracts.warrantyTerms")}
            value={contractTemplate.warrantyTerms}
            onChange={(value) => updateTemplate("warrantyTerms", value)}
          />
          <ContractTextField
            label={t("contracts.executionTerms")}
            value={contractTemplate.executionTerms}
            onChange={(value) => updateTemplate("executionTerms", value)}
          />
          <ContractTextField
            label={t("contracts.generalTerms")}
            value={contractTemplate.contractTerms}
            onChange={(value) => updateTemplate("contractTerms", value)}
          />
          <ContractTextField
            label={t("contracts.firstPartyObligations")}
            value={contractTemplate.firstPartyObligations}
            onChange={(value) => updateTemplate("firstPartyObligations", value)}
          />
          <ContractTextField
            label={t("contracts.secondPartyObligations")}
            value={contractTemplate.secondPartyObligations}
            onChange={(value) => updateTemplate("secondPartyObligations", value)}
          />
          <ContractTextField
            label={t("common.notes")}
            value={notes}
            onChange={setNotes}
          />
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

function ContractTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-bold text-muted-strong">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
      />
    </label>
  );
}
