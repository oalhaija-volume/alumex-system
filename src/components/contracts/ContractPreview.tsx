"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";
import {
  contractStorageKey,
  getProductSystems,
  type ContractDraft,
} from "@/components/contracts/contractTypes";
import {
  calculateArea,
  calculateLineTotal,
  type QuotationLine,
} from "@/components/quotations/quotationTypes";
import { canViewFinanceValues, canViewSalesPrices } from "@/lib/auth/roles";
import { messagesByLocale, type Locale, type Messages } from "@/lib/i18n";

const scheduleRowsPerPage = 9;

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

function chunkRows<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks.length > 0 ? chunks : [[]];
}

function formatIqd(value: number, locale: string) {
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);

  return locale === "ar" ? `${formatted} د.ع` : `IQD ${formatted}`;
}

type Replacements = Record<string, string | number>;

function readMessage(messages: Messages, key: string) {
  return key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }

    return undefined;
  }, messages);
}

function interpolate(message: string, replacements?: Replacements) {
  if (!replacements) {
    return message;
  }

  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

function useContractDocumentI18n(locale: Locale) {
  const uiI18n = useI18n();
  const messages = messagesByLocale[locale];

  function t(key: string, replacements?: Replacements) {
    const message = readMessage(messages, key);
    return typeof message === "string"
      ? interpolate(message, replacements)
      : uiI18n.t(key, replacements);
  }

  function term(rawValue: string | null | undefined) {
    if (!rawValue) {
      return t("common.notAdded");
    }

    return messages.terms[rawValue as keyof typeof messages.terms] ?? rawValue;
  }

  function formatDate(value: Date | string | number) {
    const date = value instanceof Date ? value : new Date(value);

    return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  return { t, term, formatDate, locale };
}

function PageShell({
  children,
  clientName,
  contractNumber,
  page,
  totalPages,
  title,
  isArabic,
}: {
  children: React.ReactNode;
  clientName: string;
  contractNumber: string;
  page: number;
  totalPages: number;
  title: string;
  isArabic: boolean;
}) {
  const { t } = useContractDocumentI18n(isArabic ? "ar" : "en");

  return (
    <section
      dir={isArabic ? "rtl" : "ltr"}
      className="a4-page pdf-page print-page contract-pdf-page mx-auto mb-6 flex flex-col bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 print:mb-0 print:shadow-none print:ring-0"
    >
      <header className="border-b border-slate-200 pb-4">
        <div className="flex items-start justify-between gap-6">
          <Logo />
          <div className={isArabic ? "text-left" : "text-right"}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--alumex-red)]">
              {title}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-700">
              {t("contracts.contractNumber")}: {contractNumber}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {t("contracts.clientName")}: {clientName}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {t("contracts.pageOf", { page, total: totalPages })}
            </p>
          </div>
        </div>
        <div className="mt-4 h-0.5 bg-[var(--alumex-blue)]" />
      </header>
      <div className="min-h-0 flex-1 py-5">{children}</div>
      <footer className="mt-auto border-t border-slate-200 pt-3 text-[10px] font-semibold text-slate-500">
        <div className="flex items-center justify-between gap-4">
          <span>{t("contracts.legalFooter")}</span>
          <span>{contractNumber}</span>
        </div>
      </footer>
    </section>
  );
}

function InfoBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-s-4 border-[var(--alumex-blue)] bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 p-3">
      <h2 className="text-xs font-black uppercase tracking-wide text-[var(--alumex-blue)]">
        {title}
      </h2>
      <div className="mt-2 text-xs leading-5 text-slate-700">{children}</div>
    </section>
  );
}

function CoverPage({
  draft,
  isArabic,
  showFinanceValues,
  totalPages,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  showFinanceValues: boolean;
  totalPages: number;
}) {
  const { formatDate, locale, t, term } = useContractDocumentI18n(
    isArabic ? "ar" : "en",
  );

  return (
    <PageShell
      title={t("contracts.contractPackage")}
      clientName={term(draft.project.client)}
      contractNumber={draft.contractNumber}
      page={1}
      totalPages={totalPages}
      isArabic={isArabic}
    >
      <div className="flex h-full flex-col">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--alumex-red)]">
            {t("app.name")}
          </p>
          <h1 className="mt-4 max-w-[140mm] text-3xl font-black leading-tight text-slate-950">
            {t("contracts.supplyInstallationContract")}
          </h1>
          <p className="mt-4 max-w-[140mm] text-sm leading-6 text-slate-600">
            {t("contracts.coverDescription")}
          </p>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2">
          <InfoBox label={t("contracts.clientName")} value={term(draft.project.client)} />
          <InfoBox
            label={t("projects.fields.projectName")}
            value={term(draft.project.projectName)}
          />
          <InfoBox label={t("contracts.contractNumber")} value={draft.contractNumber} />
          <InfoBox label={t("quotations.quotationNumber")} value={draft.quotationNumber} />
          <InfoBox label={t("common.date")} value={formatDate(draft.contractDate)} />
          {showFinanceValues ? (
            <InfoBox
              label={t("contracts.totalAmount")}
              value={formatIqd(draft.totalAmount, locale)}
            />
          ) : null}
          <InfoBox label={t("contracts.salesEngineer")} value={term(draft.salesEngineer)} />
          <InfoBox label={t("contracts.preparedBy")} value={draft.preparedBy} />
        </div>

        <div className="mt-auto grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {t("contracts.productSystems")}
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              {getProductSystems(draft.project).map((system) => term(system)).join(" | ") ||
                t("common.notSpecified")}
            </p>
          </div>
          <div className={isArabic ? "text-left" : "text-right"}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {t("contracts.projectLocation")}
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              {term(draft.clientAddress || draft.project.address)}
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function PartiesAndSpecsPage({
  draft,
  isArabic,
  page,
  totalPages,
  lines,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  page: number;
  totalPages: number;
  lines: QuotationLine[];
}) {
  const { formatDate, t, term } = useContractDocumentI18n(
    isArabic ? "ar" : "en",
  );
  const specs = Array.from(
    new Map(
      lines.map((line) => [
        `${line.productSystem}-${line.glassType}-${line.aluminumColor}`,
        line,
      ]),
    ).values(),
  );

  return (
    <PageShell
      title={t("contracts.contractBody")}
      clientName={term(draft.project.client)}
      contractNumber={draft.contractNumber}
      page={page}
      totalPages={totalPages}
      isArabic={isArabic}
    >
      <div className="grid gap-4">
        {isArabic ? (
          <LegalSection title="تمهيد العقد">
            <p className="whitespace-pre-wrap">
              بعد مشيئة الله تم الاتفاق بين الطرفين وهما في الحالة المعتبرة شرعا وقانونا على توريد وتركيب اعمال الالمنيوم للطرف الثاني وفق الشروط والاحكام الواردة في هذا العقد. وتعد مقدمة هذا العقد جزءا لا يتجزأ منه ويرجع اليها في تفسير احكامه وبنوده.
            </p>
          </LegalSection>
        ) : null}

        <LegalSection title={`A. ${t("contracts.contractParties")}`}>
          <dl className="grid gap-2 md:grid-cols-2">
            <div>
              <dt className="font-bold text-slate-500">{t("contracts.firstParty")}</dt>
              <dd className="mt-1 font-semibold text-slate-950">{t("contracts.firstPartyName")}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">{t("contracts.secondParty")}</dt>
              <dd className="mt-1 font-semibold text-slate-950">{term(draft.project.client)}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">{t("contracts.projectLocation")}</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {term(draft.clientAddress || draft.project.address)}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">{t("contracts.contractDate")}</dt>
              <dd className="mt-1 font-semibold text-slate-950">{formatDate(draft.contractDate)}</dd>
            </div>
          </dl>
        </LegalSection>

        <LegalSection title={`B. ${t("contracts.productSpecifications")}`}>
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full border-collapse text-[10px]">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-2 text-start">{t("contracts.systemName")}</th>
                  <th className="p-2 text-start">{t("contracts.profileWidth")}</th>
                  <th className="p-2 text-start">{t("contracts.profileThickness")}</th>
                  <th className="p-2 text-start">{t("contracts.glassType")}</th>
                  <th className="p-2 text-start">{t("contracts.glassThickness")}</th>
                  <th className="p-2 text-start">{t("contracts.color")}</th>
                </tr>
              </thead>
              <tbody>
                {specs.map((spec) => (
                  <tr key={`${spec.productSystem}-${spec.glassType}-${spec.aluminumColor}`} className="border-t border-slate-200">
                    <td className="p-2 font-semibold text-slate-950">{term(spec.productSystem)}</td>
                    <td className="p-2">{t("common.notSpecified")}</td>
                    <td className="p-2">{t("common.notSpecified")}</td>
                    <td className="p-2">{term(spec.glassType)}</td>
                    <td className="p-2">{t("common.notSpecified")}</td>
                    <td className="p-2">{term(spec.aluminumColor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LegalSection>

        <LegalSection title={`E. ${t("contracts.paymentTerms")}`}>
          <p className="whitespace-pre-wrap">{draft.paymentTerms}</p>
        </LegalSection>

        <LegalSection title={`F. ${t("contracts.warrantyTerms")}`}>
          <p className="whitespace-pre-wrap">{draft.warrantyTerms}</p>
        </LegalSection>

        <LegalSection title={`G. ${t("contracts.executionPeriod")}`}>
          <p className="whitespace-pre-wrap">{draft.executionTerms}</p>
        </LegalSection>
      </div>
    </PageShell>
  );
}

function SchedulePage({
  draft,
  isArabic,
  page,
  showSalesPrices,
  totalPages,
  lines,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  page: number;
  showSalesPrices: boolean;
  totalPages: number;
  lines: QuotationLine[];
}) {
  const { locale, t, term } = useContractDocumentI18n(
    isArabic ? "ar" : "en",
  );

  return (
    <PageShell
      title={t("contracts.openingSchedule")}
      clientName={term(draft.project.client)}
      contractNumber={draft.contractNumber}
      page={page}
      totalPages={totalPages}
      isArabic={isArabic}
    >
      <LegalSection title={`C. ${t("contracts.openingSchedule")}`}>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full border-collapse text-[9px] leading-tight">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-1.5 text-start">{t("contracts.opening")}</th>
                <th className="p-1.5 text-start">{t("projects.openings.fields.width")}</th>
                <th className="p-1.5 text-start">{t("projects.openings.fields.height")}</th>
                <th className="p-1.5 text-start">{t("projects.openings.fields.quantity")}</th>
                <th className="p-1.5 text-start">{t("common.areaSqm")}</th>
                <th className="p-1.5 text-start">{t("common.system")}</th>
                <th className="p-1.5 text-start">{t("quotations.glass")}</th>
                {showSalesPrices ? (
                  <>
                    <th className="p-1.5 text-start">{t("quotations.unitPrice")}</th>
                    <th className="p-1.5 text-start">{t("common.total")}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const lineTotal = calculateLineTotal(line);

                return (
                  <tr key={line.id} className="border-t border-slate-200">
                    <td className="p-1.5 font-semibold text-slate-950">{line.openingCode}</td>
                    <td className="p-1.5">{line.width}</td>
                    <td className="p-1.5">{line.height}</td>
                    <td className="p-1.5">{line.quantity}</td>
                    <td className="p-1.5">{lineTotal.area.toFixed(2)}</td>
                    <td className="p-1.5">{term(line.productSystem)}</td>
                    <td className="p-1.5">{term(line.glassType)}</td>
                    {showSalesPrices ? (
                      <>
                        <td className="p-1.5">{formatIqd(line.unitPrice, locale)}</td>
                        <td className="p-1.5 font-bold">{formatIqd(lineTotal.net, locale)}</td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </LegalSection>
    </PageShell>
  );
}

function FinancialAndTermsPage({
  draft,
  isArabic,
  page,
  showFinanceValues,
  totalPages,
  lines,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  page: number;
  showFinanceValues: boolean;
  totalPages: number;
  lines: QuotationLine[];
}) {
  const { locale, t, term } = useContractDocumentI18n(
    isArabic ? "ar" : "en",
  );
  const totalArea = lines.reduce((sum, line) => sum + calculateArea(line), 0);
  const advancePayment = draft.totalAmount * 0.4;
  const remainingBalance = draft.totalAmount - advancePayment;

  return (
    <PageShell
      title={t("contracts.financialSummary")}
      clientName={term(draft.project.client)}
      contractNumber={draft.contractNumber}
      page={page}
      totalPages={totalPages}
      isArabic={isArabic}
    >
      <div className="grid gap-4">
        {showFinanceValues ? (
          <LegalSection title={`D. ${t("contracts.financialSummary")}`}>
            <div className="grid gap-3 md:grid-cols-2">
              <InfoBox label={t("contracts.totalArea")} value={t("common.areaValue", { value: totalArea.toFixed(2) })} />
              <InfoBox label={t("contracts.totalAmount")} value={formatIqd(draft.totalAmount, locale)} />
              <InfoBox label={t("contracts.currency")} value={t("settings.currencyValue")} />
              <InfoBox label={t("contracts.advancePayment")} value={formatIqd(advancePayment, locale)} />
              <InfoBox label={t("contracts.remainingBalance")} value={formatIqd(remainingBalance, locale)} />
            </div>
          </LegalSection>
        ) : null}

        <LegalSection title={`H. ${t("contracts.firstPartyObligations")}`}>
          <p className="whitespace-pre-wrap">{draft.firstPartyObligations}</p>
        </LegalSection>

        <LegalSection title={`I. ${t("contracts.secondPartyObligations")}`}>
          <p className="whitespace-pre-wrap">{draft.secondPartyObligations}</p>
        </LegalSection>

        <LegalSection title={`J. ${t("contracts.generalTermsAndConditions")}`}>
          <p className="whitespace-pre-wrap">{draft.contractTerms}</p>
        </LegalSection>

        {isArabic ? (
          <LegalSection title="التحرير والقبول">
            <p className="whitespace-pre-wrap">
              يتكون هذا العقد من ستة بنود اساسية ويقع على خمس صفحات. تم توقيع هذا العقد بايجاب وقبول الطرفين وفي مجلس واحد بتاريخ العقد.
            </p>
          </LegalSection>
        ) : null}

        {draft.notes ? (
          <LegalSection title={t("common.notes")}>
            <p className="whitespace-pre-wrap">{draft.notes}</p>
          </LegalSection>
        ) : null}
      </div>
    </PageShell>
  );
}

function SignaturePage({
  draft,
  isArabic,
  page,
  totalPages,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  page: number;
  totalPages: number;
}) {
  const { t, term } = useContractDocumentI18n(isArabic ? "ar" : "en");

  return (
    <PageShell
      title={t("contracts.signaturePage")}
      clientName={term(draft.project.client)}
      contractNumber={draft.contractNumber}
      page={page}
      totalPages={totalPages}
      isArabic={isArabic}
    >
      <div className="flex h-full flex-col">
        <LegalSection title={`K. ${t("common.signatures")}`}>
          <p>{t("contracts.signatureConfirmation")}</p>
          {isArabic ? (
            <p className="mt-2">
              يوقع عن الطرف الاول المدير المفوض او المدير العام او من ينوب عنهم، ويوقع عن الطرف الثاني المالك او من يمثله قانونا.
            </p>
          ) : null}
        </LegalSection>

        <div className="mt-auto grid gap-8">
          {[
            [t("contracts.clientRepresentative"), term(draft.project.client)],
            [t("contracts.alumexRepresentative"), draft.preparedBy],
            [t("contracts.salesEngineer"), term(draft.salesEngineer)],
          ].map(([label, name]) => (
            <div key={label} className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-[1fr_1fr] md:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-950">{name}</p>
              </div>
              <div>
                <div className="h-16 border-b border-slate-400" />
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {t("common.signature")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export function ContractPreview() {
  const { t } = useI18n();
  const { role } = useCurrentRole();
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

  const lines = useMemo<QuotationLine[]>(() => {
    if (!draft) {
      return [];
    }

    return draft.openingSchedule?.length
      ? draft.openingSchedule
      : draft.project.structuralOpenings.map((opening) => ({
          ...opening,
          unitPrice: 0,
          discountPercent: 0,
        }));
  }, [draft]);
  const scheduleChunks = useMemo(
    () => chunkRows(lines, scheduleRowsPerPage),
    [lines],
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
  const showSalesPrices = canViewSalesPrices(role);
  const showFinanceValues = canViewFinanceValues(role);
  const totalPages = 4 + scheduleChunks.length;
  let page = 1;

  return (
    <main className="min-h-screen max-w-[100vw] overflow-x-hidden bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:justify-between">
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
        className="mx-auto w-full max-w-full overflow-x-hidden print:max-w-none print:overflow-visible"
      >
        <CoverPage
          draft={draft}
          isArabic={isArabic}
          showFinanceValues={showFinanceValues}
          totalPages={totalPages}
        />
        <PartiesAndSpecsPage
          draft={draft}
          isArabic={isArabic}
          page={++page}
          totalPages={totalPages}
          lines={lines}
        />
        {scheduleChunks.map((chunk) => (
          <SchedulePage
            key={`schedule-${page + 1}`}
            draft={draft}
            isArabic={isArabic}
            page={++page}
            showSalesPrices={showSalesPrices}
            totalPages={totalPages}
            lines={chunk}
          />
        ))}
        <FinancialAndTermsPage
          draft={draft}
          isArabic={isArabic}
          page={++page}
          showFinanceValues={showFinanceValues}
          totalPages={totalPages}
          lines={lines}
        />
        <SignaturePage
          draft={draft}
          isArabic={isArabic}
          page={++page}
          totalPages={totalPages}
        />
      </article>
    </main>
  );
}
