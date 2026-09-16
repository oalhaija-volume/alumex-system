"use client";

import { useState, useSyncExternalStore } from "react";
import { PdfDownloadButton } from "@/components/pdf/PdfDownloadButton";
import { SkylightQuotation, type SkylightQuotationData } from "@/components/skylight/SkylightQuotation";
import { calculateSkylight, skylightMoney, type SkylightQuantities } from "@/lib/skylight";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function SkylightCalculator() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [quantities, setQuantities] = useState<SkylightQuantities>({});
  const [laminated, setLaminated] = useState(false);
  const [customer, setCustomer] = useState("");
  const [project, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [quote, setQuote] = useState<SkylightQuotationData | null>(null);
  const calculation = calculateSkylight(quantities);
  const canGenerate = calculation.valid && calculation.standardTotalCents > 0;

  function generateQuotation() {
    if (!canGenerate) return;
    const now = new Date();
    setQuote({
      number: `SK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getTime()).slice(-6)}`,
      date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      customer: customer.trim(), project: project.trim(), notes: notes.trim(), laminated, calculation,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main dir="ltr" lang="en" className="min-h-screen bg-background text-foreground">
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/AlumexLogo.svg" width={145} height={60} alt="Alumex Experts" className="w-32 rounded bg-white p-1 sm:w-36" />
          <span className="text-sm font-semibold text-muted">Skylight estimator · USD</span>
        </div>
      </header>

      {quote ? (
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-2xl font-bold">Quotation preview</h1><p className="mt-1 text-sm text-muted">{quote.laminated ? "Laminated glass" : "Standard glass"} · {quote.number}</p></div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="material-button-outlined" onClick={() => setQuote(null)}>Edit calculation</button>
              <PdfDownloadButton elementId="skylight-quotation" fileName={`${quote.number}.pdf`} label="Download quotation PDF" />
            </div>
          </div>
          <div className="flex justify-center"><SkylightQuotation quote={quote} /></div>
        </section>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
          <div className="mb-7 border-b border-border pb-6">
            <h1 className="text-3xl font-bold tracking-tight">Skylight cost calculator</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Enter the required quantities. Item totals and glass options update automatically.</p>
          </div>
          <fieldset disabled={!ready} aria-label="Skylight calculation" className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              <section className="material-card overflow-hidden" aria-labelledby="materials-heading">
                <div className="border-b border-border px-5 py-4"><h2 id="materials-heading" className="text-lg font-bold">Materials & quantities</h2><p className="mt-1 text-sm text-muted">Lengths in meters · glass in m² · hardware in pieces</p></div>
                <div className="hidden grid-cols-[minmax(0,1fr)_100px_108px_110px] gap-3 border-b border-border bg-surface-muted px-5 py-3 text-xs font-bold text-muted sm:grid" aria-hidden="true"><span>Item</span><span className="text-end">Unit price</span><span>Quantity</span><span className="text-end">Item total</span></div>
                <div className="divide-y divide-border">
                  {calculation.lines.map((line, index) => (
                    <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-x-3 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_100px_108px_110px]" data-testid={`line-${line.id}`}>
                      <label htmlFor={`quantity-${line.id}`} className="text-sm font-semibold"><span className="me-2 text-xs font-normal text-muted">{String(index + 1).padStart(2, "0")}</span>{line.name}</label>
                      <span className="text-end text-sm tabular-nums text-muted">{skylightMoney(line.priceCents)}<span className="text-xs">/{line.unit}</span></span>
                      <div>
                        <div className="relative">
                          <input id={`quantity-${line.id}`} type="number" min="0" max="1000000" step={line.unit === "pcs" ? "1" : "0.001"} inputMode={line.unit === "pcs" ? "numeric" : "decimal"} placeholder="0" value={quantities[line.id] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setQuantities((current) => ({ ...current, [line.id]: value })); }} aria-invalid={!line.valid} aria-describedby={!line.valid ? `error-${line.id}` : undefined} className="h-11 w-full rounded-md border border-border bg-surface px-3 pe-9 text-sm tabular-nums focus:border-primary focus:outline-2 focus:outline-primary" />
                          <span className="pointer-events-none absolute end-2 top-3 text-xs text-muted">{line.unit}</span>
                        </div>
                      </div>
                      <output htmlFor={`quantity-${line.id}`} className="text-end text-sm font-bold tabular-nums">{line.valid ? skylightMoney(line.totalCents) : "—"}</output>
                      {!line.valid && <p id={`error-${line.id}`} className="col-span-full text-xs text-danger-text">Enter {line.unit === "pcs" ? "a whole number" : "a number with up to 3 decimal places"} from 0 to 1,000,000.</p>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="material-card p-5" aria-labelledby="total-heading">
                <h2 id="total-heading" className="text-lg font-bold">Grand total</h2>
                <p className="mt-1 text-sm text-muted">Choose the glass for your quotation.</p>
                <fieldset className="mt-4 grid grid-cols-2 gap-3">
                  <legend className="sr-only">Glass option</legend>
                  {[false, true].map((option) => (
                    <label key={String(option)} className={`cursor-pointer rounded-lg border p-3 ${laminated === option ? "border-primary bg-info-surface" : "border-border"}`}>
                      <span className="flex min-h-10 items-center gap-2 text-sm font-semibold sm:min-h-0"><input type="radio" name="glass-option" checked={laminated === option} onChange={() => setLaminated(option)} className="accent-primary" />{option ? "Laminated glass" : "Standard glass"}</span>
                      <span className="mt-2 block break-words text-lg font-bold tabular-nums sm:text-xl" data-testid={option ? "laminated-total" : "standard-total"}>{calculation.valid ? skylightMoney(option ? calculation.laminatedTotalCents : calculation.standardTotalCents) : "—"}</span>
                      <span className="mt-1 block text-xs text-muted">Glass: {option ? "$175.00" : "$120.00"}/m²</span>
                    </label>
                  ))}
                </fieldset>
                <p className="mt-4 text-xs leading-5 text-muted">Lamination adds $55.00 × glass m²: <strong className="text-foreground">{calculation.valid ? skylightMoney(calculation.laminationCents) : "—"}</strong>. All totals are in USD.</p>
              </section>
            </div>

            <aside className="space-y-5 lg:sticky lg:top-6">
              <section className="material-card p-5" aria-labelledby="quotation-heading">
                <h2 id="quotation-heading" className="text-lg font-bold">Prepare a quotation</h2>
                <p className="mt-1 text-sm text-muted">Add customer details for the branded PDF.</p>
                <div className="mt-4 space-y-4">
                  <label className="block text-sm font-semibold">Customer name<input value={customer} onChange={(event) => setCustomer(event.target.value)} maxLength={100} className="mt-1.5 h-11 w-full rounded-md border border-border bg-surface px-3 font-normal" placeholder="Customer or company" /></label>
                  <label className="block text-sm font-semibold">Project name<input value={project} onChange={(event) => setProject(event.target.value)} maxLength={100} className="mt-1.5 h-11 w-full rounded-md border border-border bg-surface px-3 font-normal" placeholder="Project or location" /></label>
                  <label className="block text-sm font-semibold">Notes <span className="font-normal text-muted">(optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={350} rows={3} className="mt-1.5 w-full resize-y rounded-md border border-border bg-surface p-3 font-normal" /></label>
                  <button type="button" disabled={!canGenerate} onClick={generateQuotation} className="min-h-11 w-full rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Generate quotation</button>
                  {!canGenerate && <p className="text-xs text-muted">{calculation.valid ? "Enter at least one quantity to generate a quotation." : "Correct the highlighted quantities to continue."}</p>}
                </div>
              </section>
            </aside>
          </fieldset>
        </div>
      )}
    </main>
  );
}
