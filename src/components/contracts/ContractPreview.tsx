"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";
import { SignaturePad } from "@/components/contracts/SignaturePad";
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

const scheduleRowsPerPage = 14;
const legalPageWeightLimit = 28;

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo/AlumexLogo.svg"
      alt="خبراء ألومكس"
      className="h-auto w-[38mm] object-contain print:w-[30mm]"
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

type LegalPrintSection = {
  key: string;
  title: string;
  text: string;
};

type LegalPrintPage = {
  key: string;
  title: string;
  sections: LegalPrintSection[];
};

const arabicContractTextReplacements: Array<[RegExp, string]> = [
  [/\bALUMEX\b/g, "ألومكس"],
  [/\bPRO\b/g, "برو"],
  [/\bTHE ADDRESS\b/g, "ذا أدرس"],
  [/\bA\.H\.W\.TB660\b/g, "أيه إتش دبليو تي بي 660"],
  [/\bPUSH OUT\b/g, "بوش آوت"],
  [/\bSWING DOOR\b/g, "باب مفصلي"],
  [/\bPHOTO CELL DOOR\b/g, "باب كهربائي بحساس"],
  [/\bGEZZE\b/g, "جيزي"],
  [/\bLOW-E\b/g, "لو إي"],
  [/\bGLASS MIRROR\b/g, "زجاج عاكس"],
  [/\bGEORGIAN BAR\b/g, "جورجيان بار"],
  [/\bTURN AND TILT\b/g, "فتح وقلب"],
  [/\bLAVAL\b/g, "لافال"],
  [/\bOR COVER FRAME SUB FRAME\b/g, "أور كفر فريم سب فريم"],
  [/\bCURTAIN WALL\b/g, "واجهة زجاجية"],
  [/\bEX\b/g, "إي إكس"],
];

function toArabicContractText(text: string) {
  return arabicContractTextReplacements.reduce(
    (nextText, [pattern, replacement]) => nextText.replace(pattern, replacement),
    text,
  );
}

function splitParagraphs(text: string) {
  return text
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getParagraphPrintWeight(paragraph: string) {
  return Math.max(1, Math.ceil(paragraph.length / 230));
}

function packLegalSections(
  sections: LegalPrintSection[],
  pageKeyPrefix = "legal-page",
) {
  const pages: LegalPrintPage[] = [];
  let currentSections: LegalPrintSection[] = [];
  let currentWeight = 0;
  let pageIndex = 1;

  function pushPage() {
    if (!currentSections.length) {
      return;
    }

    pages.push({
      key: `${pageKeyPrefix}-${pageIndex}`,
      title: currentSections[0]?.title ?? "",
      sections: currentSections,
    });
    pageIndex += 1;
    currentSections = [];
    currentWeight = 0;
  }

  sections.forEach((section) => {
    const paragraphs = splitParagraphs(section.text);
    let blockIndex = 1;

    paragraphs.forEach((paragraph) => {
      const paragraphWeight = getParagraphPrintWeight(paragraph);
      const nextWeight = currentWeight + paragraphWeight + 1;

      if (currentSections.length && nextWeight > legalPageWeightLimit) {
        pushPage();
      }

      const previousSection = currentSections[currentSections.length - 1];

      if (previousSection?.key.startsWith(`${section.key}-`)) {
        previousSection.text = `${previousSection.text}\n\n${paragraph}`;
      } else {
        currentSections.push({
          key: `${section.key}-${blockIndex}`,
          title: section.title,
          text: paragraph,
        });
        blockIndex += 1;
      }
      currentWeight += paragraphWeight + 1;
    });
  });

  pushPage();

  return pages;
}

function formatIqd(value: number, locale: string) {
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);

  return `${formatted} د.ع`;
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
      <header className="shrink-0 border-b border-slate-200 pb-4 print:pb-2">
        <div className="flex items-start justify-between gap-6 print:gap-4">
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
        <div className="mt-4 h-0.5 bg-[var(--alumex-blue)] print:mt-2" />
      </header>
      <div className="contract-print-page-body min-h-0 flex-1 overflow-hidden py-5 print:py-3">
        {children}
      </div>
      <footer className="mt-auto shrink-0 border-t border-slate-200 pt-3 text-[10px] font-semibold text-slate-500 print:pt-2">
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
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`rounded-md border border-slate-200 ${compact ? "p-2.5" : "p-3"}`}>
      <h2 className="text-xs font-black uppercase tracking-wide text-[var(--alumex-blue)]">
        {title}
      </h2>
      <div className={`${compact ? "mt-1.5 text-[11px] leading-4" : "mt-2 text-xs leading-5"} text-slate-700`}>
        {children}
      </div>
    </section>
  );
}

function LegalTextStack({ sections }: { sections: LegalPrintSection[] }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2.5">
      {sections.map((section, index) => (
        <section
          key={section.key}
          className={index === 0 ? "pb-2" : "border-t border-slate-100 py-2"}
        >
          <h2 className="text-[11px] font-black text-[var(--alumex-blue)]">
            {section.title}
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-[10.5px] leading-[1.65] text-slate-700">
            {section.text}
          </p>
        </section>
      ))}
    </div>
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
      <div className="grid content-start gap-5">
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

        <div className="grid gap-3 md:grid-cols-2">
          <InfoBox label={t("contracts.clientName")} value={term(draft.project.client)} />
          <InfoBox
            label={t("projects.fields.projectName")}
            value={term(draft.project.projectName)}
          />
          <InfoBox label={t("contracts.contractNumber")} value={draft.contractNumber} />
          <InfoBox label={t("quotations.quotationNumber")} value={draft.quotationNumber} />
          <InfoBox
            label={locale === "ar" ? "نوع العقد" : "Contract type"}
            value={
              draft.pricingSource === "project_costing"
                ? locale === "ar"
                  ? "عقد مبني على التكلفة"
                  : "Costing-based contract"
                : locale === "ar"
                  ? "عقد من دليل الأسعار"
                  : "Catalog contract"
            }
          />
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

        <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
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

        <LegalSection title={`أ. ${t("contracts.contractParties")}`}>
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

        <LegalSection title={`ب. ${t("contracts.productSpecifications")}`}>
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

      </div>
    </PageShell>
  );
}

function ContractBodyTextPage({
  draft,
  isArabic,
  legalPage,
  page,
  totalPages,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  legalPage: LegalPrintPage;
  page: number;
  totalPages: number;
}) {
  const { t, term } = useContractDocumentI18n(isArabic ? "ar" : "en");

  return (
    <PageShell
      title={t("contracts.contractBody")}
      clientName={term(draft.project.client)}
      contractNumber={draft.contractNumber}
      page={page}
      totalPages={totalPages}
      isArabic={isArabic}
    >
      <LegalTextStack sections={legalPage.sections} />
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
      <LegalSection title={`ج. ${t("contracts.openingSchedule")}`}>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full border-collapse text-[9px] leading-tight">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-1.5 text-start">{t("contracts.opening")}</th>
                <th className="p-1.5 text-start">{t("projects.openings.fields.width")}</th>
                <th className="p-1.5 text-start">{t("projects.openings.fields.height")}</th>
                <th className="p-1.5 text-start">{t("projects.openings.fields.solidPanelHeight")}</th>
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
                    <td className="p-1.5">{line.solidPanelHeight ?? 0}</td>
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

function FinancialAndFirstPartyPage({
  draft,
  isArabic,
  page,
  showFinanceValues,
  totalPages,
  lines,
  firstPartyText,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  page: number;
  showFinanceValues: boolean;
  totalPages: number;
  lines: QuotationLine[];
  firstPartyText: string;
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
      <div className="grid gap-3">
        {showFinanceValues ? (
          <LegalSection title={`د. ${t("contracts.financialSummary")}`} compact>
            <div className="grid gap-2 md:grid-cols-2">
              <InfoBox label={t("contracts.totalArea")} value={t("common.areaValue", { value: totalArea.toFixed(2) })} />
              <InfoBox label={t("contracts.totalAmount")} value={formatIqd(draft.totalAmount, locale)} />
              <InfoBox label={t("contracts.currency")} value={t("settings.currencyValue")} />
              <InfoBox label={t("contracts.advancePayment")} value={formatIqd(advancePayment, locale)} />
              <InfoBox label={t("contracts.remainingBalance")} value={formatIqd(remainingBalance, locale)} />
            </div>
          </LegalSection>
        ) : null}

        <LegalSection title={`ح. ${t("contracts.firstPartyObligations")}`} compact>
          <p className="whitespace-pre-wrap">{toArabicContractText(firstPartyText)}</p>
        </LegalSection>
      </div>
    </PageShell>
  );
}

function LegalStackPage({
  draft,
  isArabic,
  page,
  totalPages,
  legalPage,
  shellTitle,
}: {
  draft: ContractDraft;
  isArabic: boolean;
  page: number;
  totalPages: number;
  legalPage: LegalPrintPage;
  shellTitle?: string;
}) {
  const { term } = useContractDocumentI18n(isArabic ? "ar" : "en");

  return (
    <PageShell
      title={shellTitle ?? legalPage.title}
      clientName={term(draft.project.client)}
      contractNumber={draft.contractNumber}
      page={page}
      totalPages={totalPages}
      isArabic={isArabic}
    >
      <LegalTextStack sections={legalPage.sections} />
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
  const { formatDate, t, term } = useContractDocumentI18n(isArabic ? "ar" : "en");
  const signatureRows = [
    {
      label: t("contracts.clientRepresentative"),
      name: draft.clientSignedName || term(draft.project.client),
      signatureDataUrl: draft.clientSignatureDataUrl,
      signedAt: draft.clientSignedAt,
    },
    {
      label: t("contracts.alumexRepresentative"),
      name: draft.preparedBy,
    },
    {
      label: t("contracts.salesEngineer"),
      name: draft.salesSignedName || term(draft.salesEngineer),
      signatureDataUrl: draft.salesSignatureDataUrl,
      signedAt: draft.salesSignedAt,
    },
  ];

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
        <LegalSection title={`ك. ${t("common.signatures")}`}>
          <p>{t("contracts.signatureConfirmation")}</p>
          {isArabic ? (
            <p className="mt-2">
              يوقع عن الطرف الاول المدير المفوض او المدير العام او من ينوب عنهم، ويوقع عن الطرف الثاني المالك او من يمثله قانونا.
            </p>
          ) : null}
        </LegalSection>

        <div className="mt-auto grid gap-8">
          {signatureRows.map((row) => (
            <div key={row.label} className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-[1fr_1fr] md:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {row.label}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-950">{row.name}</p>
                {row.signedAt ? (
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    تم التوقيع رقميا: {formatDate(row.signedAt)}
                  </p>
                ) : null}
              </div>
              <div>
                <div className="flex h-16 items-end border-b border-slate-400">
                  {row.signatureDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.signatureDataUrl}
                      alt={`توقيع ${row.label}`}
                      className="max-h-16 max-w-full object-contain"
                    />
                  ) : null}
                </div>
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
  const { t } = useContractDocumentI18n("ar");
  const { role } = useCurrentRole();
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [clientSignedName, setClientSignedName] = useState("");
  const [clientSignatureDataUrl, setClientSignatureDataUrl] = useState("");
  const [salesSignedName, setSalesSignedName] = useState("");
  const [salesSignatureDataUrl, setSalesSignatureDataUrl] = useState("");
  const [signatureError, setSignatureError] = useState("");
  const [signatureNotice, setSignatureNotice] = useState("");
  const [isSavingSignatures, setIsSavingSignatures] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedDraft = window.localStorage.getItem(contractStorageKey);

      if (storedDraft) {
        const nextDraft = JSON.parse(storedDraft) as ContractDraft;
        setDraft(nextDraft);
        setClientSignedName(nextDraft.clientSignedName || nextDraft.project.client);
        setClientSignatureDataUrl(nextDraft.clientSignatureDataUrl ?? "");
        setSalesSignedName(
          nextDraft.salesSignedName ||
            nextDraft.salesEngineer ||
            nextDraft.preparedBy,
        );
        setSalesSignatureDataUrl(nextDraft.salesSignatureDataUrl ?? "");
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

  async function saveSignatures() {
    if (!draft?.id) {
      setSignatureError("يجب إنشاء العقد وحفظه قبل التوقيع.");
      return;
    }

    if (!clientSignatureDataUrl || !salesSignatureDataUrl) {
      setSignatureError("توقيع العميل وتوقيع المبيعات مطلوبان.");
      return;
    }

    setSignatureError("");
    setSignatureNotice("");
    setIsSavingSignatures(true);

    const signedAt = new Date().toISOString();
    const nextDraft: ContractDraft = {
      ...draft,
      clientSignatureDataUrl,
      clientSignedName: clientSignedName.trim() || draft.project.client,
      clientSignedAt: draft.clientSignedAt || signedAt,
      salesSignatureDataUrl,
      salesSignedName:
        salesSignedName.trim() || draft.salesEngineer || draft.preparedBy,
      salesSignedAt: draft.salesSignedAt || signedAt,
    };

    try {
      const response = await fetch(`/api/contracts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-signatures",
          client_signature_data_url: nextDraft.clientSignatureDataUrl,
          client_signed_name: nextDraft.clientSignedName,
          client_signed_at: nextDraft.clientSignedAt,
          sales_signature_data_url: nextDraft.salesSignatureDataUrl,
          sales_signed_name: nextDraft.salesSignedName,
          sales_signed_at: nextDraft.salesSignedAt,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "تعذر حفظ تواقيع العقد."),
        );
      }

      setDraft(nextDraft);
      window.localStorage.setItem(contractStorageKey, JSON.stringify(nextDraft));
      setSignatureNotice(
        "تم حفظ التواقيع وتحويل ملف العقد إلى العمليات.",
      );
    } catch (saveError) {
      setSignatureError(
        saveError instanceof Error
          ? saveError.message
          : "تعذر حفظ تواقيع العقد.",
      );
    } finally {
      setIsSavingSignatures(false);
    }
  }

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
            href="/quotations?view=contracts"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white"
          >
            {t("contracts.backToGenerator")}
          </Link>
        </div>
      </main>
    );
  }

  const isArabic = true;
  const showSalesPrices = canViewSalesPrices(role);
  const showFinanceValues = canViewFinanceValues(role);
  const commercialSections = [
    {
      key: "payment-terms",
      title: `هـ. ${t("contracts.paymentTerms")}`,
      text: toArabicContractText(draft.paymentTerms),
    },
    {
      key: "warranty-terms",
      title: `و. ${t("contracts.warrantyTerms")}`,
      text: toArabicContractText(draft.warrantyTerms),
    },
    {
      key: "execution-period",
      title: `ز. ${t("contracts.executionPeriod")}`,
      text: toArabicContractText(draft.executionTerms),
    },
  ];
  const commercialPages = packLegalSections(
    commercialSections,
    "commercial-page",
  );
  const baseLegalSections = [
    {
      key: "second-party-obligations",
      title: `ط. ${t("contracts.secondPartyObligations")}`,
      text: toArabicContractText(draft.secondPartyObligations),
    },
    {
      key: "general-terms",
      title: `ي. ${t("contracts.generalTermsAndConditions")}`,
      text: toArabicContractText(draft.contractTerms),
    },
  ];
  const firstLegalPages = packLegalSections(baseLegalSections);
  const fixedPageCount = 4 + scheduleChunks.length + commercialPages.length;
  const firstTotalPages = fixedPageCount + firstLegalPages.length;
  const buildFullLegalSections = (pageCount: number): LegalPrintSection[] => [
    ...baseLegalSections,
    ...(isArabic
      ? [
          {
            key: "acceptance",
            title: "التحرير والقبول",
            text: `يتكون هذا العقد من البنود الاساسية الموضحة فيه ويقع على ${pageCount} صفحات. تم توقيع هذا العقد بايجاب وقبول الطرفين وفي مجلس واحد بتاريخ العقد.`,
          },
        ]
      : []),
    ...(draft.notes
      ? [
          {
            key: "notes",
            title: t("common.notes"),
            text: toArabicContractText(draft.notes),
          },
        ]
      : []),
  ];
  const secondLegalPages = packLegalSections(
    buildFullLegalSections(firstTotalPages),
  );
  const secondTotalPages = fixedPageCount + secondLegalPages.length;
  const legalPages = packLegalSections(buildFullLegalSections(secondTotalPages));
  const totalPages = fixedPageCount + legalPages.length;
  let page = 1;

  return (
    <main className="min-h-screen max-w-[100vw] overflow-x-hidden bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:justify-between">
        <Link
          href="/quotations?view=contracts"
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

      <section className="no-print mx-auto mb-6 w-full max-w-5xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--alumex-red)]">
              توقيع العقد
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">
              توقيع العميل والمبيعات
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              راجع العقد أولا، ثم خذ توقيع العميل وتوقيع ممثل المبيعات.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveSignatures()}
            disabled={
              isSavingSignatures ||
              !clientSignatureDataUrl ||
              !salesSignatureDataUrl
            }
            className="h-11 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {isSavingSignatures ? "جاري الحفظ..." : "حفظ التواقيع على العقد"}
          </button>
        </div>

        {signatureError ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {signatureError}
          </p>
        ) : null}
        {signatureNotice ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {signatureNotice}
          </p>
        ) : null}

        <div className="mt-4 grid gap-6">
          <SignaturePad
            signerName={clientSignedName}
            value={clientSignatureDataUrl}
            onChange={setClientSignatureDataUrl}
            onSignerNameChange={setClientSignedName}
            signerLabel="اسم ممثل العميل"
            signerPlaceholder="الاسم الكامل للعميل"
            ariaLabel="لوحة توقيع العميل"
            emptyMessage="اطلب من العميل التوقيع داخل المربع."
          />
          <SignaturePad
            signerName={salesSignedName}
            value={salesSignatureDataUrl}
            onChange={setSalesSignatureDataUrl}
            onSignerNameChange={setSalesSignedName}
            signerLabel="اسم ممثل المبيعات"
            signerPlaceholder="اسم ممثل المبيعات"
            ariaLabel="لوحة توقيع ممثل المبيعات"
            emptyMessage="اطلب من ممثل المبيعات التوقيع داخل المربع."
          />
        </div>
      </section>

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
        {commercialPages.map((commercialPage) => (
          <ContractBodyTextPage
            key={commercialPage.key}
            draft={draft}
            isArabic={isArabic}
            legalPage={commercialPage}
            page={++page}
            totalPages={totalPages}
          />
        ))}
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
        <FinancialAndFirstPartyPage
          draft={draft}
          isArabic={isArabic}
          page={++page}
          showFinanceValues={showFinanceValues}
          totalPages={totalPages}
          lines={lines}
          firstPartyText={draft.firstPartyObligations}
        />
        {legalPages.map((legalPage) => (
          <LegalStackPage
            key={legalPage.key}
            draft={draft}
            isArabic={isArabic}
            page={++page}
            totalPages={totalPages}
            legalPage={legalPage}
            shellTitle={t("contracts.contractBody")}
          />
        ))}
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
