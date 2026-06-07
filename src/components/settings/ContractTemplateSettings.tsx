"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { ContractTemplate } from "@/components/contracts/contractTypes";

type ContractTemplateRow = {
  payment_terms: string | null;
  warranty_terms: string | null;
  execution_terms: string | null;
  contract_terms: string | null;
  first_party_obligations: string | null;
  second_party_obligations: string | null;
};

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

function toTemplate(row: ContractTemplateRow | null | undefined): ContractTemplate {
  return {
    paymentTerms: row?.payment_terms ?? "",
    warrantyTerms: row?.warranty_terms ?? "",
    executionTerms: row?.execution_terms ?? "",
    contractTerms: row?.contract_terms ?? "",
    firstPartyObligations: row?.first_party_obligations ?? "",
    secondPartyObligations: row?.second_party_obligations ?? "",
  };
}

function toPayload(template: ContractTemplate) {
  return {
    payment_terms: template.paymentTerms,
    warranty_terms: template.warrantyTerms,
    execution_terms: template.executionTerms,
    contract_terms: template.contractTerms,
    first_party_obligations: template.firstPartyObligations,
    second_party_obligations: template.secondPartyObligations,
  };
}

export function ContractTemplateSettings() {
  const { t } = useI18n();
  const [template, setTemplate] = useState<ContractTemplate>({
    paymentTerms: "",
    warrantyTerms: "",
    executionTerms: "",
    contractTerms: "",
    firstPartyObligations: "",
    secondPartyObligations: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTemplate = useCallback(async () => {
    const response = await fetch("/api/contracts/template", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        await readError(response, t("settings.loadContractTemplateError")),
      );
    }

    const body = (await response.json()) as {
      template?: ContractTemplateRow | null;
    };

    return toTemplate(body.template);
  }, [t]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialTemplate() {
      try {
        const nextTemplate = await loadTemplate();

        if (isMounted) {
          setTemplate(nextTemplate);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("settings.loadContractTemplateError"),
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialTemplate();

    return () => {
      isMounted = false;
    };
  }, [loadTemplate, t]);

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/contracts/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(template)),
      });

      if (!response.ok) {
        setError(
          await readError(response, t("settings.saveContractTemplateError")),
        );
        return;
      }

      const body = (await response.json()) as {
        template?: ContractTemplateRow | null;
      };
      setTemplate(toTemplate(body.template));
      setNotice(t("settings.contractTemplateSaved"));
    } catch {
      setError(t("settings.saveContractTemplateError"));
    } finally {
      setIsSaving(false);
    }
  }

  function updateTemplate(field: keyof ContractTemplate, value: string) {
    setTemplate((current) => ({ ...current, [field]: value }));
  }

  if (isLoading) {
    return <p className="text-sm font-semibold text-muted">{t("common.loading")}</p>;
  }

  return (
    <form onSubmit={saveTemplate} className="space-y-4">
      <p className="text-sm leading-6 text-muted-strong">
        {t("settings.contractTemplateDescription")}
      </p>

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <TemplateField
          label={t("contracts.paymentTerms")}
          value={template.paymentTerms}
          onChange={(value) => updateTemplate("paymentTerms", value)}
        />
        <TemplateField
          label={t("contracts.warrantyTerms")}
          value={template.warrantyTerms}
          onChange={(value) => updateTemplate("warrantyTerms", value)}
        />
        <TemplateField
          label={t("contracts.executionTerms")}
          value={template.executionTerms}
          onChange={(value) => updateTemplate("executionTerms", value)}
        />
        <TemplateField
          label={t("contracts.generalTerms")}
          value={template.contractTerms}
          onChange={(value) => updateTemplate("contractTerms", value)}
        />
        <TemplateField
          label={t("contracts.firstPartyObligations")}
          value={template.firstPartyObligations}
          onChange={(value) => updateTemplate("firstPartyObligations", value)}
        />
        <TemplateField
          label={t("contracts.secondPartyObligations")}
          value={template.secondPartyObligations}
          onChange={(value) => updateTemplate("secondPartyObligations", value)}
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
      >
        {isSaving ? t("common.loading") : t("settings.saveContractTemplate")}
      </button>
    </form>
  );
}

function TemplateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface"
      />
    </label>
  );
}
