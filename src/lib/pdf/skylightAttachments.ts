export type SkylightAttachment = {
  id: string;
  name: string;
  kind: "pdf" | "jpg";
  bytes: ArrayBuffer;
  pageCount: number;
};

export const maxAttachmentFiles = 5;
export const maxAttachmentBytes = 10 * 1024 * 1024;
export const maxAttachmentPages = 50;

export async function readSkylightAttachment(file: File): Promise<SkylightAttachment> {
  if (!file.size || file.size > maxAttachmentBytes) {
    throw new Error(`${file.name}: choose a non-empty file no larger than 10 MB.`);
  }

  let bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes.slice(0, 5));
  const isPdf = /\.pdf$/i.test(file.name) && new TextDecoder().decode(signature) === "%PDF-";
  const isJpg = /\.jpe?g$/i.test(file.name) && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  if (!isPdf && !isJpg) {
    throw new Error(`${file.name}: choose a valid PDF or JPG file.`);
  }

  let pageCount = 1;
  if (isPdf) {
    const { PDFDocument } = await import("pdf-lib");
    try {
      const pdf = await PDFDocument.load(bytes);
      pageCount = pdf.getPageCount();
      if (!pageCount || pageCount > maxAttachmentPages) throw new Error("Page limit");
    } catch {
      throw new Error(`${file.name}: use a readable, unprotected PDF with 1–50 pages.`);
    }
  } else {
    try {
      // Decode and normalize camera orientation before adding the photograph.
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 25_000_000) throw new Error("Image too large");
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image canvas unavailable");
        context.drawImage(bitmap, 0, 0);
        const normalized = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image conversion failed")), "image/jpeg", 0.95);
        });
        bytes = await normalized.arrayBuffer();
      } finally {
        bitmap.close();
      }
    } catch {
      throw new Error(`${file.name}: use a readable JPG image up to 25 megapixels.`);
    }
  }

  return { id: crypto.randomUUID(), name: file.name, kind: isPdf ? "pdf" : "jpg", bytes, pageCount };
}

export async function appendSkylightAttachments(
  quotation: ArrayBuffer,
  attachments: readonly SkylightAttachment[],
) {
  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.load(quotation);
  for (const attachment of attachments) {
    if (attachment.kind === "pdf") {
      const source = await PDFDocument.load(attachment.bytes);
      const pages = await output.copyPages(source, source.getPageIndices());
      for (const page of pages) output.addPage(page);
    } else {
      const image = await output.embedJpg(attachment.bytes);
      const landscape = image.width > image.height;
      const page = output.addPage(landscape ? [841.89, 595.28] : [595.28, 841.89]);
      const { width, height } = image.scaleToFit(page.getWidth() - 48, page.getHeight() - 48);
      page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
    }
  }
  return output.save();
}
