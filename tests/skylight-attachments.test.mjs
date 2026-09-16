import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { appendSkylightAttachments, readSkylightAttachment } from "../src/lib/pdf/skylightAttachments.ts";

test("attached PDF pages retain their page dimensions and order", async () => {
  const quotation = await PDFDocument.create();
  quotation.addPage([595, 842]);
  const drawing = await PDFDocument.create();
  drawing.addPage([300, 500]);
  drawing.addPage([600, 400]);
  const attachment = await readSkylightAttachment(new File([await drawing.save()], "drawing.pdf"));
  assert.equal(attachment.pageCount, 2);
  const merged = await PDFDocument.load(await appendSkylightAttachments(await quotation.save(), [attachment]));
  assert.equal(merged.getPageCount(), 3);
  assert.deepEqual(merged.getPage(1).getSize(), { width: 300, height: 500 });
  assert.deepEqual(merged.getPage(2).getSize(), { width: 600, height: 400 });
});

test("empty, oversized, and disguised attachment files are rejected", async () => {
  await assert.rejects(readSkylightAttachment(new File([], "empty.pdf")), /non-empty/);
  await assert.rejects(readSkylightAttachment(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf")), /10 MB/);
  await assert.rejects(readSkylightAttachment(new File(["not a pdf"], "fake.pdf")), /valid PDF or JPG/);
  await assert.rejects(readSkylightAttachment(new File(["not a jpg"], "fake.jpg")), /valid PDF or JPG/);
});

test("PDF attachments over the page limit are rejected before generation", async () => {
  const document = await PDFDocument.create();
  for (let page = 0; page < 51; page++) document.addPage();
  await assert.rejects(readSkylightAttachment(new File([await document.save()], "long.pdf")), /1–50 pages/);
});
