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
    const image = await toPng(page, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    const imageRatio = page.scrollWidth / page.scrollHeight;
    const pageRatio = pageWidth / pageHeight;
    const renderWidth = imageRatio > pageRatio ? pageWidth : pageHeight * imageRatio;
    const renderHeight =
      imageRatio > pageRatio ? pageWidth / imageRatio : pageHeight;
    const x = (pageWidth - renderWidth) / 2;
    const y = 0;

    if (index > 0) {
      pdf.addPage();
    }

    pdf.addImage(image, "PNG", x, y, renderWidth, renderHeight);
  }

  pdf.save(fileName);
}
