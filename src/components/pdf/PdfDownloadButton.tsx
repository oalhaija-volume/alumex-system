"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { exportElementToPdf } from "@/lib/pdf/exportPdf";

export function PdfDownloadButton({
  elementId,
  fileName,
  label,
}: {
  elementId: string;
  fileName: string;
  label: string;
}) {
  const { t } = useI18n();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  async function generatePdf() {
    setError("");
    setIsGenerating(true);

    try {
      await exportElementToPdf({ elementId, fileName });
    } catch (pdfError) {
      setError(
        pdfError instanceof Error ? pdfError.message : t("errors.pdfError"),
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={generatePdf}
        disabled={isGenerating}
        className="h-11 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isGenerating ? t("errors.generating") : label}
      </button>
      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
