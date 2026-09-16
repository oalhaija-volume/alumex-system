"use client";

import { useState, useSyncExternalStore } from "react";
import { SkylightPdfButton } from "@/components/skylight/SkylightPdfButton";
import { SkylightAttachments } from "@/components/skylight/SkylightAttachments";
import type { SkylightAttachment } from "@/lib/pdf/skylightAttachments";
import { SkylightQuotation, type SkylightQuotationData } from "@/components/skylight/SkylightQuotation";
import { calculateSkylight, parseSkylightExchangeRate, skylightRateLabel, skylightTotal, type SkylightCurrency, type SkylightQuantities } from "@/lib/skylight";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function SkylightCalculator() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [quantities, setQuantities] = useState<SkylightQuantities>({});
  const [otherAmount, setOtherAmount] = useState("");
  const [steelAmount, setSteelAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [convertToIqd, setConvertToIqd] = useState(false);
  const [laminated, setLaminated] = useState(false);
  const [customer, setCustomer] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [attachments, setAttachments] = useState<SkylightAttachment[]>([]);
  const [checkingAttachments, setCheckingAttachments] = useState(false);
  const [project, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [quote, setQuote] = useState<SkylightQuotationData | null>(null);
  const calculation = calculateSkylight(quantities, otherAmount, steelAmount);
  const rate = parseSkylightExchangeRate(exchangeRate);
  const currency: SkylightCurrency | null = convertToIqd
    ? rate === null ? null : { code: "IQD", rate }
    : { code: "USD" };
  const canGenerate = currency !== null && calculation.valid && calculation.standardTotalCents > 0 && salesperson.trim().length > 0 && !checkingAttachments;

  function generateQuotation() {
    if (!canGenerate || !currency) return;
    const now = new Date();
    setQuote({
      number: `SK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getTime()).slice(-6)}`,
      date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      customer: customer.trim(), salesperson: salesperson.trim(), attachments, project: project.trim(), notes: notes.trim(), laminated, calculation, currency,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main dir="ltr" lang="en" className="min-h-screen bg-background text-foreground">
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/AlumexLogo.svg" width={145} height={60} alt="Alumex Experts" className="w-32 rounded bg-white p-1 sm:w-36" />
          <span className="text-sm font-semibold text-muted">Skylight estimator · {convertToIqd ? "IQD" : "USD"}</span>
        </div>
      </header>

      {quote ? (
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-2xl font-bold">Quotation preview</h1><p className="mt-1 text-sm text-muted">{quote.laminated ? "Laminated glass" : "Standard glass"} · {quote.number}</p></div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="material-button-outlined" onClick={() => setQuote(null)}>Edit calculation</button>
              <SkylightPdfButton number={quote.number} attachments={quote.attachments} />
            </div>
          </div>
          {quote.attachments.length > 0 && (
            <section className="no-print material-card mb-6 p-4" aria-label="Included attachments">
              <h2 className="text-sm font-bold">Included attachments</h2>
              <p className="mt-1 text-xs text-muted">These files will follow the quotation in the downloaded PDF.</p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
                {quote.attachments.map((attachment) => <li key={attachment.id} className="break-words">{attachment.name} · {attachment.pageCount} {attachment.pageCount === 1 ? "page" : "pages"}</li>)}
              </ol>
            </section>
          )}
          <div className="flex justify-center"><SkylightQuotation quote={quote} /></div>
        </section>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
          <div className="mb-7 border-b border-border pb-6">
            <h1 className="text-3xl font-bold tracking-tight">Skylight cost calculator</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Enter the required quantities. Grand totals and glass options update automatically.</p>
          </div>
          <fieldset disabled={!ready} aria-label="Skylight calculation" className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              <section className="material-card overflow-hidden" aria-labelledby="materials-heading">
                <div className="border-b border-border px-5 py-4"><h2 id="materials-heading" className="text-lg font-bold">Materials & quantities</h2><p className="mt-1 text-sm text-muted">Lengths in meters · glass in m² · hardware in pieces</p></div>
                <div className="hidden grid-cols-[minmax(0,1fr)_108px] gap-3 border-b border-border bg-surface-muted px-5 py-3 text-xs font-bold text-muted sm:grid" aria-hidden="true"><span>Item</span><span>Quantity</span></div>
                <div className="divide-y divide-border">
                  {calculation.lines.map((line, index) => (
                    <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-x-3 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_108px]" data-testid={`line-${line.id}`}>
                      <label htmlFor={`quantity-${line.id}`} className="text-sm font-semibold"><span className="me-2 text-xs font-normal text-muted">{String(index + 1).padStart(2, "0")}</span>{line.name}</label>
                      <div>
                        <div className="relative">
                          <input id={`quantity-${line.id}`} type="number" min="0" max="1000000" step={line.unit === "pcs" ? "1" : "0.001"} inputMode={line.unit === "pcs" ? "numeric" : "decimal"} placeholder="0" value={quantities[line.id] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setQuantities((current) => ({ ...current, [line.id]: value })); }} aria-invalid={!line.valid} aria-describedby={!line.valid ? `error-${line.id}` : undefined} className="h-11 w-full rounded-md border border-border bg-surface px-3 pe-9 text-sm tabular-nums focus:border-primary focus:outline-2 focus:outline-primary" />
                          <span className="pointer-events-none absolute end-2 top-3 text-xs text-muted">{line.unit}</span>
                        </div>
                      </div>
                      {!line.valid && <p id={`error-${line.id}`} className="col-span-full text-xs text-danger-text">Enter {line.unit === "pcs" ? "a whole number" : "a number with up to 3 decimal places"} from 0 to 1,000,000.</p>}
                    </div>
                  ))}
                  <div className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 px-5 py-4">
                    <div>
                      <label htmlFor="other-amount" className="text-sm font-semibold"><span className="me-2 text-xs font-normal text-muted">13</span>Other</label>
                      <p id="other-amount-help" className="mt-1 text-xs text-muted">One-time amount added to both grand totals.</p>
                    </div>
                    <div className="relative">
                      <input id="other-amount" type="number" min="0" max="1000000" step="0.01" inputMode="decimal" placeholder="Amount" value={otherAmount} onChange={(event) => setOtherAmount(event.currentTarget.value)} aria-invalid={!calculation.otherValid} aria-describedby={`other-amount-help${calculation.otherValid ? "" : " other-amount-error"}`} className="h-11 w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none rounded-md border border-border bg-surface px-3 pe-9 text-sm tabular-nums focus:border-primary focus:outline-2 focus:outline-primary" />
                      <span className="pointer-events-none absolute end-2 top-3 text-xs text-muted">USD</span>
                    </div>
                    {!calculation.otherValid && <p id="other-amount-error" className="col-span-full text-xs text-danger-text">Enter an amount from 0 to 1,000,000 with up to 2 decimal places.</p>}
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 px-5 py-4">
                    <div>
                      <label htmlFor="steel-amount" className="text-sm font-semibold"><span className="me-2 text-xs font-normal text-muted">14</span>Steel reinforcement</label>
                      <p id="steel-amount-help" className="mt-1 text-xs text-muted">One-time amount added to both grand totals.</p>
                    </div>
                    <div className="relative">
                      <input id="steel-amount" type="number" min="0" max="1000000" step="0.01" inputMode="decimal" placeholder="Amount" value={steelAmount} onChange={(event) => setSteelAmount(event.currentTarget.value)} aria-invalid={!calculation.steelValid} aria-describedby={`steel-amount-help${calculation.steelValid ? "" : " steel-amount-error"}`} className="h-11 w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none rounded-md border border-border bg-surface px-3 pe-9 text-sm tabular-nums focus:border-primary focus:outline-2 focus:outline-primary" />
                      <span className="pointer-events-none absolute end-2 top-3 text-xs text-muted">USD</span>
                    </div>
                    {!calculation.steelValid && <p id="steel-amount-error" className="col-span-full text-xs text-danger-text">Enter an amount from 0 to 1,000,000 with up to 2 decimal places.</p>}
                  </div>
                </div>
              </section>

              <section className="material-card p-5" aria-labelledby="total-heading">
                <h2 id="total-heading" className="text-lg font-bold">Grand total</h2>
                <p className="mt-1 text-sm text-muted">Choose the glass for your quotation.</p>
                <div className="mt-4 rounded-md border border-border bg-surface-muted p-3">
                  <label htmlFor="exchange-rate" className="block text-sm font-semibold">Exchange rate (IQD per 1 USD)</label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input id="exchange-rate" type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={exchangeRate} onChange={(event) => setExchangeRate(event.currentTarget.value)} placeholder="e.g. 1540" aria-invalid={rate === null && (exchangeRate !== "" || convertToIqd)} aria-describedby="exchange-rate-help" className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm tabular-nums" />
                    <button type="button" role="switch" aria-checked={convertToIqd} aria-label="Convert totals to IQD" disabled={!convertToIqd && rate === null} onClick={() => setConvertToIqd((current) => !current)} className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                      <span aria-hidden="true" className={`flex h-6 w-10 items-center rounded-full p-0.5 ${convertToIqd ? "justify-end bg-primary" : "justify-start bg-muted"}`}><span className="h-5 w-5 rounded-full bg-white" /></span>
                      Convert to IQD
                    </button>
                  </div>
                  <p id="exchange-rate-help" className="mt-2 text-xs leading-5 text-muted">{rate === null ? "Enter a rate greater than 0, up to 1,000,000, with at most 2 decimal places to convert." : skylightRateLabel(rate)} Manual item amounts stay in USD.</p>
                </div>
                <fieldset className="mt-4 grid grid-cols-2 gap-3">
                  <legend className="sr-only">Glass option</legend>
                  {[false, true].map((option) => (
                    <label key={String(option)} className={`cursor-pointer rounded-lg border p-3 ${laminated === option ? "border-primary bg-info-surface" : "border-border"}`}>
                      <span className="flex min-h-10 items-center gap-2 text-sm font-semibold sm:min-h-0"><input type="radio" name="glass-option" checked={laminated === option} onChange={() => setLaminated(option)} className="accent-primary" />{option ? "Laminated glass" : "Standard glass"}</span>
                      <span className="mt-2 block break-words text-lg font-bold tabular-nums sm:text-xl" data-testid={option ? "laminated-total" : "standard-total"}>{calculation.valid && currency ? skylightTotal(option ? calculation.laminatedTotalCents : calculation.standardTotalCents, currency) : "—"}</span>
                    </label>
                  ))}
                </fieldset>
                <p className="mt-4 text-xs leading-5 text-muted">{convertToIqd ? "Totals are in IQD, rounded to the nearest whole dinar." : "All totals are in USD."}</p>
              </section>
            </div>

            <aside className="space-y-5 lg:sticky lg:top-6">
              <section className="material-card p-5" aria-labelledby="quotation-heading">
                <h2 id="quotation-heading" className="text-lg font-bold">Prepare a quotation</h2>
                <p className="mt-1 text-sm text-muted">Add customer details for the branded PDF.</p>
                <div className="mt-4 space-y-4">
                  <label className="block text-sm font-semibold">Customer name<input value={customer} onChange={(event) => setCustomer(event.target.value)} maxLength={100} className="mt-1.5 h-11 w-full rounded-md border border-border bg-surface px-3 font-normal" placeholder="Customer or company" /></label>
                  <label className="block text-sm font-semibold">Salesperson name <span className="font-normal text-muted">(required)</span><input required value={salesperson} onChange={(event) => setSalesperson(event.target.value)} maxLength={100} autoComplete="name" className="mt-1.5 h-11 w-full rounded-md border border-border bg-surface px-3 font-normal" placeholder="Your full name" /></label>
                  <label className="block text-sm font-semibold">Project name<input value={project} onChange={(event) => setProject(event.target.value)} maxLength={100} className="mt-1.5 h-11 w-full rounded-md border border-border bg-surface px-3 font-normal" placeholder="Project or location" /></label>
                  <label className="block text-sm font-semibold">Notes <span className="font-normal text-muted">(optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={350} rows={3} className="mt-1.5 w-full resize-y rounded-md border border-border bg-surface p-3 font-normal" /></label>
                  <SkylightAttachments attachments={attachments} onChange={setAttachments} busy={checkingAttachments} onBusyChange={setCheckingAttachments} />
                  <button type="button" disabled={!canGenerate} onClick={generateQuotation} className="min-h-11 w-full rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Generate quotation</button>
                  {!canGenerate && <p className="text-xs text-muted">{checkingAttachments ? "Wait for the attachments to finish checking." : !currency ? "Enter a valid exchange rate or switch back to USD." : !calculation.valid ? "Correct the highlighted values to continue." : calculation.standardTotalCents <= 0 ? "Enter a quantity or a manual amount to generate a quotation." : "Enter the salesperson’s name to generate a quotation."}</p>}
                </div>
              </section>
            </aside>
          </fieldset>
        </div>
      )}
    </main>
  );
}
