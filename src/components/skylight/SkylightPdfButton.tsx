"use client";

import { useState } from "react";
import { createElementPdf } from "@/lib/pdf/exportPdf";
import { appendSkylightAttachments, type SkylightAttachment } from "@/lib/pdf/skylightAttachments";

export function SkylightPdfButton({ number, attachments }: { number: string; attachments: SkylightAttachment[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const pdf = await createElementPdf("skylight-quotation");
      if (!attachments.length) {
        pdf.save(`${number}.pdf`);
        return;
      }
      const bytes = await appendSkylightAttachments(pdf.output("arraybuffer"), attachments);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Give browsers time to consume the download before releasing its bytes.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("The quotation PDF could not be generated. Please try again or remove the attachment that could not be read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void download()} disabled={busy} className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50">{busy ? "Generating PDF…" : "Download quotation PDF"}</button>
      {error && <p role="alert" className="mt-2 max-w-sm text-xs text-danger-text">{error}</p>}
    </div>
  );
}
