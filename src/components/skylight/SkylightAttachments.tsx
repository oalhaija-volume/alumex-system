"use client";

import { useState } from "react";
import {
  maxAttachmentFiles,
  maxAttachmentPages,
  readSkylightAttachment,
  type SkylightAttachment,
} from "@/lib/pdf/skylightAttachments";

export function SkylightAttachments({
  attachments,
  onChange,
  busy,
  onBusyChange,
}: {
  attachments: SkylightAttachment[];
  onChange: (attachments: SkylightAttachment[]) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");

  async function addFiles(files: File[]) {
    setError("");
    if (!files.length) return;
    if (files.length + attachments.length > maxAttachmentFiles) {
      setError("You can attach up to 5 files. Remove a file before adding more.");
      return;
    }
    onBusyChange(true);
    try {
      const additions: SkylightAttachment[] = [];
      for (const file of files) additions.push(await readSkylightAttachment(file));
      const next = [...attachments, ...additions];
      if (next.reduce((total, attachment) => total + attachment.pageCount, 0) > maxAttachmentPages) {
        throw new Error("Attachments can contain up to 50 pages in total.");
      }
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read the attachment. Please try another file.");
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor="skylight-attachments" className="block text-sm font-semibold">Attachments <span className="font-normal text-muted">(optional)</span></label>
      <p id="attachment-help" className="text-xs leading-5 text-muted">PDF or JPG · up to 5 files, 10 MB each. Added as pages after the quotation, in the order shown.</p>
      <input
        id="skylight-attachments"
        type="file"
        accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
        multiple
        disabled={busy}
        aria-describedby="attachment-help"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void addFiles(files);
        }}
        className="block min-h-11 w-full min-w-0 rounded-md border border-border bg-surface text-xs text-muted file:me-2 file:min-h-11 file:border-0 file:bg-surface-muted file:px-3 file:font-semibold file:text-foreground"
      />
      {busy && <p role="status" className="text-xs text-muted">Checking attachments…</p>}
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
      {attachments.length > 0 && (
        <ol className="space-y-2" aria-label="Quotation attachments">
          {attachments.map((attachment, index) => (
            <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
              <div className="min-w-0"><p className="break-words font-semibold">{index + 1}. {attachment.name}</p><p className="mt-1 text-muted">{attachment.pageCount} {attachment.pageCount === 1 ? "page" : "pages"}</p></div>
              <button type="button" disabled={busy} onClick={() => { onChange(attachments.filter((item) => item.id !== attachment.id)); setError(""); }} aria-label={`Remove ${attachment.name}`} className="min-h-11 shrink-0 px-2 font-semibold text-danger-text">Remove</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
