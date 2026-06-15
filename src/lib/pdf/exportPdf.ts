type ExportPdfOptions = {
  elementId: string;
  fileName: string;
};

export async function exportElementToPdf({
  elementId,
  fileName,
}: ExportPdfOptions) {
  const element = document.getElementById(elementId);

  if (!element) {
    throw new Error(`PDF source element "${elementId}" was not found.`);
  }

  const [{ toPng }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);
  const pages = Array.from(element.querySelectorAll<HTMLElement>(".pdf-page"));
  const sourcePages = pages.length > 0 ? pages : [element];
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (const [index, page] of sourcePages.entries()) {
    await waitForImages(page);
    await document.fonts?.ready;
    const previousStyle = {
      height: page.style.height,
      maxWidth: page.style.maxWidth,
      minHeight: page.style.minHeight,
      overflow: page.style.overflow,
      width: page.style.width,
    };

    let image = "";

    try {
      page.style.width = "210mm";
      page.style.height = "297mm";
      page.style.minHeight = "297mm";
      page.style.maxWidth = "none";
      page.style.overflow = "hidden";

      const captureWidth = page.offsetWidth;
      const captureHeight = page.offsetHeight;
      image = await toPng(page, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        width: captureWidth,
        height: captureHeight,
        style: {
          boxSizing: "border-box",
          margin: "0",
          maxWidth: "none",
          transform: "none",
        },
      });
    } finally {
      page.style.width = previousStyle.width;
      page.style.height = previousStyle.height;
      page.style.minHeight = previousStyle.minHeight;
      page.style.maxWidth = previousStyle.maxWidth;
      page.style.overflow = previousStyle.overflow;
    }

    if (index > 0) {
      pdf.addPage();
    }

    pdf.addImage(image, "PNG", 0, 0, pageWidth, pageHeight);
  }

  pdf.save(fileName);
}

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll("img"));

  await Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
}
