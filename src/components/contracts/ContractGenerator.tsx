"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
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
import { canViewSalesPrices } from "@/lib/auth/roles";
import {
  arabicContractDefaultNotes,
  arabicContractDefaultPreparedBy,
  arabicContractTemplateDefaults,
  replaceLegacyEnglishContractTemplate,
} from "@/lib/contracts/templateDefaults";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import {
  clampDiscount,
  defaultDiscountLimitForRole,
  discountLimitFromPolicies,
  loadDiscountPolicies,
} from "@/lib/pricing/discountPolicy";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ContractRow = {
  id: string;
  contract_number: string;
  project_id: string;
  quotation_id: string | null;
  contract_value: number | string;
  source_contract_value?: number | string | null;
  contract_discount_percent?: number | string | null;
  contract_discount_total?: number | string | null;
  contract_date: string | null;
  payment_terms: string | null;
  warranty_terms: string | null;
  execution_terms: string | null;
  contract_terms: string | null;
  first_party_obligations: string | null;
  second_party_obligations: string | null;
  prepared_by_text: string | null;
  client_signature_data_url: string | null;
  client_signed_name: string | null;
  client_signed_at: string | null;
  sales_signature_data_url: string | null;
  sales_signed_name: string | null;
  sales_signed_at: string | null;
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

type ContractSourceDraft = QuotationDraft & {
  contractTotal?: number;
  quotationStatus?: string;
};

type ContractSourceRow = {
  id: string;
  quotationNumber: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  contractTotal: number;
  status?: string | null;
};

async function readApiError(
  response: Response,
  fallback: string,
  duplicateFallback = fallback,
) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  const error = body?.error ?? fallback;

  if (
    error ===
      "This contract number already exists. A new contract number has been generated." ||
    error.includes("contracts_contract_number_key") ||
    error.toLowerCase().includes("duplicate key")
  ) {
    return duplicateFallback;
  }

  return error === fallback ? fallback : error;
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

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {step}
        </span>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-2 text-sm font-bold leading-6 text-foreground">
        {value || "Not added"}
      </p>
    </div>
  );
}

async function loadContractSourceQuotations(
  projects: ReturnType<typeof useProjects>["projects"],
): Promise<ContractSourceDraft[]> {
  const response = await fetch("/api/quotations/contract-source", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    quotations?: ContractSourceRow[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load contract sources.");
  }

  return (body?.quotations ?? []).reduce<ContractSourceDraft[]>(
    (sources, source) => {
      const project = projects.find((item) => item.id === source.projectId);

      if (!project) {
        return sources;
      }

      sources.push({
        id: source.id,
        quotationNumber: source.quotationNumber,
        project,
        lines: project.structuralOpenings.map((opening) => ({
          ...opening,
          unitPrice: 0,
          discountPercent: 0,
        })),
        discountPercent: 0,
        notes: "",
        preparedBy: project.salesEngineer,
        clientRepresentative: source.clientName,
        contractTotal: source.contractTotal,
        quotationStatus: source.status ?? "Saved",
      });

      return sources;
    },
    [],
  );
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
  const { isAdmin, isLoaded: isRoleLoaded, role } = useCurrentRole();
  const { clients } = useClients();
  const { projects } = useProjects();
  const defaultTemplate: ContractTemplate = useMemo(
    () => arabicContractTemplateDefaults,
    [],
  );
  const [savedQuotations, setSavedQuotations] = useState<ContractSourceDraft[]>([]);
  const [savedContracts, setSavedContracts] = useState<ContractDraft[]>([]);
  const [quotationNumber, setQuotationNumber] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState(today());
  const language: ContractLanguage = "ar";
  const [contractTemplate, setContractTemplate] =
    useState<ContractTemplate>(defaultTemplate);
  const [notes, setNotes] = useState(arabicContractDefaultNotes);
  const [preparedBy, setPreparedBy] = useState(arabicContractDefaultPreparedBy);
  const [contractDiscountPercent, setContractDiscountPercent] = useState(0);
  const [discountLimit, setDiscountLimit] = useState(() =>
    defaultDiscountLimitForRole(role),
  );
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ContractDraft | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const selectedQuotation = savedQuotations.find(
    (quotation) => quotation.quotationNumber === quotationNumber,
  );
  const selectedProject = selectedQuotation?.project;
  const selectedExistingContract = selectedQuotation
    ? savedContracts.find(
        (contract) =>
          contract.quotationNumber === selectedQuotation.quotationNumber,
      )
    : undefined;
  const selectedClient = selectedProject
    ? clients.find((client) => client.clientName === selectedProject.client)
    : undefined;
  const clientPhone = selectedClient?.mobile ?? "";
  const clientAddress = selectedClient?.address ?? selectedProject?.address ?? "";
  const productSystems = selectedProject ? getProductSystems(selectedProject) : [];
  const sourceTotalAmount = selectedQuotation
    ? selectedQuotation.contractTotal ?? calculateQuotationTotals(
        selectedQuotation.lines,
        selectedQuotation.discountPercent,
      ).grandTotal
    : 0;
  const contractDiscountTotal =
    sourceTotalAmount * (contractDiscountPercent / 100);
  const totalAmount = Math.max(sourceTotalAmount - contractDiscountTotal, 0);
  const canGenerateContract =
    Boolean(selectedQuotation && selectedProject) &&
    canViewSalesPrices(role) &&
    (!selectedExistingContract || Boolean(editingContractId));

  useEffect(() => {
    if (!isRoleLoaded) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const nextQuotations = canViewSalesPrices(role)
          ? await loadSupabaseQuotations(projects)
          : await loadContractSourceQuotations(projects);
        const nextQuotationSources: ContractSourceDraft[] = nextQuotations.map((quotation) => ({
          ...quotation,
          quotationStatus:
            (quotation as ContractSourceDraft).quotationStatus ?? "Saved",
        }));
        setSavedQuotations(nextQuotationSources);
        setQuotationNumber((current) =>
          nextQuotationSources.some(
            (quotation) => quotation.quotationNumber === current,
          )
            ? current
            : "",
        );

        const [
          contractsResponse,
          templateResponse,
          nextNumber,
          discountPolicies,
        ] = await Promise.all([
          fetch("/api/contracts", { cache: "no-store" }),
          fetch("/api/contracts/template", { cache: "no-store" }),
          fetchNextContractNumber(t("contracts.nextNumberError")),
          loadDiscountPolicies().catch(() => []),
        ]);
        const nextDiscountLimit = discountLimitFromPolicies(
          role,
          discountPolicies,
        );
        setDiscountLimit(nextDiscountLimit);
        setContractDiscountPercent((current) =>
          clampDiscount(current, nextDiscountLimit),
        );

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
          setContractTemplate(replaceLegacyEnglishContractTemplate(nextTemplate));
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
          const legalTemplate = replaceLegacyEnglishContractTemplate(nextTemplate);

          contracts.push({
            id: contract.id,
            contractNumber: contract.contract_number,
            contractDate: contract.contract_date ?? today(),
            quotationNumber:
              nextQuotationSources.find((quotation) => quotation.id === contract.quotation_id)
                ?.quotationNumber ?? "",
            project,
            openingSchedule:
              nextQuotationSources.find((quotation) => quotation.id === contract.quotation_id)
                ?.lines ?? project.structuralOpenings.map((opening) => ({
                  ...opening,
                  unitPrice: 0,
                  discountPercent: 0,
                })),
            clientPhone:
              clients.find((client) => client.id === project.clientId)?.mobile ?? "",
            clientAddress: project.address,
            totalAmount: Number(contract.contract_value ?? 0),
            sourceTotalAmount: Number(
              contract.source_contract_value ?? contract.contract_value ?? 0,
            ),
            contractDiscountPercent: Number(
              contract.contract_discount_percent ?? 0,
            ),
            contractDiscountTotal: Number(contract.contract_discount_total ?? 0),
            paymentTerms: legalTemplate.paymentTerms,
            warrantyTerms: legalTemplate.warrantyTerms,
            executionTerms: legalTemplate.executionTerms,
            contractTerms: legalTemplate.contractTerms,
            firstPartyObligations: legalTemplate.firstPartyObligations,
            secondPartyObligations: legalTemplate.secondPartyObligations,
            notes: contract.notes ?? "",
            salesEngineer: project.salesEngineer,
            preparedBy: contract.prepared_by_text ?? "",
            language: contract.language ?? language,
            clientSignatureDataUrl: contract.client_signature_data_url ?? "",
            clientSignedName: contract.client_signed_name ?? "",
            clientSignedAt: contract.client_signed_at ?? "",
            salesSignatureDataUrl: contract.sales_signature_data_url ?? "",
            salesSignedName: contract.sales_signed_name ?? "",
            salesSignedAt: contract.sales_signed_at ?? "",
          });

          return contracts;
        }, []);

        setSavedContracts(nextContracts);
      } catch (loadError) {
        setSavedQuotations([]);
        setSavedContracts([]);
        console.error("[ContractGenerator] load contracts failed", loadError);
        setError(friendlyDatabaseError(loadError, t("contracts.loadError")));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [clients, defaultTemplate, isRoleLoaded, language, projects, role, t]);

  function selectQuotation(nextQuotationNumber: string) {
    setQuotationNumber(nextQuotationNumber);
    setContractDiscountPercent(0);
    setEditingContractId(null);
  }

  function editExistingContract(contract: ContractDraft) {
    setEditingContractId(contract.id ?? null);
    setContractNumber(contract.contractNumber);
    setContractDate(contract.contractDate);
    setPreparedBy(contract.preparedBy);
    setNotes(contract.notes);
    setContractDiscountPercent(
      clampDiscount(contract.contractDiscountPercent ?? 0, discountLimit),
    );
    setContractTemplate({
      paymentTerms: contract.paymentTerms,
      warrantyTerms: contract.warrantyTerms,
      executionTerms: contract.executionTerms,
      contractTerms: contract.contractTerms,
      firstPartyObligations: contract.firstPartyObligations,
      secondPartyObligations: contract.secondPartyObligations,
    });
  }

  async function openPreview() {
    if (!selectedProject || !selectedQuotation) {
      return;
    }

    if (!canGenerateContract) {
      return;
    }

    if (!selectedProject.clientId || !selectedQuotation.id) {
      setError(t("contracts.saveError"));
      return;
    }

    if (contractDiscountPercent > discountLimit) {
      setError(t("quotations.discountLimitError", { limit: discountLimit }));
      return;
    }

    setError("");
    let nextContractNumber = contractNumber;

    if (!editingContractId) {
      try {
        nextContractNumber = await fetchNextContractNumber(
          t("contracts.nextNumberError"),
        );
        setContractNumber(nextContractNumber);
      } catch (numberError) {
        setError(
          friendlyDatabaseError(numberError, t("contracts.nextNumberError")),
        );
        return;
      }
    }

    const response = await fetch(
      editingContractId ? `/api/contracts/${editingContractId}` : "/api/contracts",
      {
        method: editingContractId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_number: nextContractNumber,
          project_id: selectedProject.id,
          quotation_id: selectedQuotation.id,
          client_id: selectedProject.clientId,
          status: "Draft",
          contract_value: totalAmount,
          source_contract_value: sourceTotalAmount,
          contract_discount_percent: contractDiscountPercent,
          contract_discount_total: contractDiscountTotal,
          contract_date: contractDate,
          ...payloadFromTemplate(contractTemplate),
          prepared_by_text: preparedBy || null,
          language,
          notes,
        }),
      },
    );

    if (!response.ok) {
      setError(
        await readApiError(
          response,
          t("contracts.saveError"),
          t("contracts.duplicateNumberRegenerated"),
        ),
      );
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
      sourceTotalAmount,
      contractDiscountPercent,
      contractDiscountTotal,
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
      clientSignatureDataUrl: "",
      clientSignedName: selectedProject.client,
      clientSignedAt: "",
      salesSignatureDataUrl: "",
      salesSignedName: selectedProject.salesEngineer || preparedBy,
      salesSignedAt: "",
    };

    window.localStorage.setItem(contractStorageKey, JSON.stringify(draft));
    setEditingContractId(null);
    router.push("/contracts/preview");
  }

  function openExistingContract(contract: ContractDraft) {
    window.localStorage.setItem(contractStorageKey, JSON.stringify(contract));
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

      <StepCard step={1} title="Select Approved Quotation">
        {savedQuotations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-muted p-6 text-center">
            <p className="text-base font-bold text-foreground">
              No saved quotations yet.
            </p>
            <p className="mt-2 text-sm text-muted">
              Create and save a quotation before generating a contract.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-muted-strong">
                Select saved quotation
              </span>
              <select
                value={quotationNumber}
                onChange={(event) => selectQuotation(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
              >
                <option value="">Choose a quotation...</option>
                {savedQuotations.map((quotation) => (
                  <option
                    key={quotation.id ?? quotation.quotationNumber}
                    value={quotation.quotationNumber}
                  >
                    {quotation.quotationNumber} - {term(quotation.project.client)} -{" "}
                    {term(quotation.project.projectName)}
                  </option>
                ))}
              </select>
            </label>

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3">Quotation Number</th>
                      <th className="px-3 py-3">Client</th>
                      <th className="px-3 py-3">Project</th>
                      <th className="px-3 py-3">Total Amount</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {savedQuotations.map((quotation) => {
                      const quotationTotal =
                        quotation.contractTotal ??
                        calculateQuotationTotals(
                          quotation.lines,
                          quotation.discountPercent,
                        ).grandTotal;
                      const isSelected =
                        quotation.quotationNumber === quotationNumber;

                      return (
                        <tr
                          key={quotation.id ?? quotation.quotationNumber}
                          onClick={() => selectQuotation(quotation.quotationNumber)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? "bg-info-surface"
                              : "bg-surface hover:bg-surface-muted"
                          }`}
                        >
                          <td className="px-3 py-3 font-bold text-primary">
                            {quotation.quotationNumber}
                          </td>
                          <td className="px-3 py-3 font-semibold text-foreground">
                            {term(quotation.project.client)}
                          </td>
                          <td className="px-3 py-3 text-muted-strong">
                            {term(quotation.project.projectName)}
                          </td>
                          <td className="px-3 py-3 font-semibold text-foreground">
                            {formatCurrency(quotationTotal)}
                          </td>
                          <td className="px-3 py-3 text-muted-strong">
                            {quotation.quotationStatus ?? "Saved"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </StepCard>

      {selectedProject && selectedQuotation ? (
        <>
          <StepCard step={2} title="Review Contract Source">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryItem label="Client Name" value={term(selectedProject.client)} />
              <SummaryItem label="Project Name" value={term(selectedProject.projectName)} />
              <SummaryItem label="Quotation Number" value={selectedQuotation.quotationNumber} />
              <SummaryItem label="Quotation Total" value={formatCurrency(sourceTotalAmount)} />
              <SummaryItem
                label="Contract Discount"
                value={`${contractDiscountPercent}% (${formatCurrency(contractDiscountTotal)})`}
              />
              <SummaryItem label="Contract Value" value={formatCurrency(totalAmount)} />
              <SummaryItem
                label="Opening Count"
                value={selectedProject.structuralOpenings.length}
              />
              <SummaryItem
                label="Product Systems"
                value={
                  productSystems.length > 0
                    ? productSystems.map((system) => term(system)).join(", ")
                    : t("contracts.noSystemsAdded")
                }
              />
              <SummaryItem
                label="Sales Engineer"
                value={term(selectedProject.salesEngineer)}
              />
              <SummaryItem label="Client Phone" value={clientPhone || t("common.notAdded")} />
            </div>

            <label className="mt-5 block max-w-sm">
              <span className="text-sm font-bold text-muted-strong">
                {t("contracts.contractDiscountPercent")}
              </span>
              <span className="mt-1 block text-xs font-semibold text-muted">
                {t("quotations.discountLimitNotice", { limit: discountLimit })}
              </span>
              <input
                type="number"
                min="0"
                max={discountLimit}
                value={contractDiscountPercent}
                onChange={(event) =>
                  setContractDiscountPercent(
                    clampDiscount(Number(event.target.value), discountLimit),
                  )
                }
                className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
              />
            </label>

            {selectedExistingContract ? (
              <div className="mt-5 rounded-lg border border-info-text bg-info-surface p-4">
                <p className="text-sm font-bold text-info-text">
                  Existing contract found
                </p>
                <p className="mt-1 text-sm text-info-text">
                  {selectedExistingContract.contractNumber} already exists for this quotation.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openExistingContract(selectedExistingContract)}
                    className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white"
                  >
                    View Contract
                  </button>
                  <button
                    type="button"
                    onClick={() => editExistingContract(selectedExistingContract)}
                    className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong"
                  >
                    Edit Contract
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selectedExistingContract)}
                      className="h-10 rounded-md border border-danger-text bg-transparent px-4 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
                    >
                      Delete Contract
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </StepCard>

          {canViewSalesPrices(role) ? (
            <>
              <StepCard step={3} title="Contract Details">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className="text-sm font-bold text-muted-strong">
                      Auto-generated contract number
                    </span>
                    <input
                      value={contractNumber}
                      readOnly
                      className="mt-2 h-11 w-full rounded-md border border-border bg-surface-muted px-3 text-sm font-bold text-foreground outline-none"
                    />
                  </label>
                  <label>
                    <span className="text-sm font-bold text-muted-strong">
                      Date
                    </span>
                    <input
                      type="date"
                      value={contractDate}
                      onChange={(event) => setContractDate(event.target.value)}
                      className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
                    />
                  </label>
                  <div>
                    <span className="text-sm font-bold text-muted-strong">
                      Language
                    </span>
                    <p className="mt-2 flex h-11 items-center rounded-md border border-border bg-surface-muted px-3 text-sm font-semibold text-foreground">
                      {t("contracts.arabicRtl")}
                    </p>
                  </div>
                  <label>
                    <span className="text-sm font-bold text-muted-strong">
                      Prepared by
                    </span>
                    <input
                      value={preparedBy}
                      onChange={(event) => setPreparedBy(event.target.value)}
                      className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
                    />
                  </label>
                </div>
              </StepCard>

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

              <StepCard step={4} title="Generate Contract">
                <button
                  type="button"
                  onClick={openPreview}
                  disabled={!canGenerateContract}
                  className="h-11 rounded-md bg-primary px-5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
                >
                  {editingContractId
                    ? "Update Contract"
                    : "Generate Contract from Selected Quotation"}
                </button>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {editingContractId
                    ? "Update the selected contract with the current discount and terms."
                    : selectedExistingContract
                    ? "This quotation already has a contract. Use View, Edit, or Delete above."
                    : t("contracts.previewDescription")}
                </p>
              </StepCard>
            </>
          ) : null}
        </>
      ) : null}

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
