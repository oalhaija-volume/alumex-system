import type { SkylightAttachment } from "@/lib/pdf/skylightAttachments";
import { skylightRateLabel, skylightTotal, type SkylightCurrency, type calculateSkylight } from "@/lib/skylight";

export type SkylightQuotationData = {
  number: string;
  date: string;
  customer: string;
  salesperson: string;
  attachments: SkylightAttachment[];
  project: string;
  notes: string;
  currency: SkylightCurrency;
  calculation: ReturnType<typeof calculateSkylight>;
};

export function SkylightQuotation({ quote }: { quote: SkylightQuotationData }) {
  const { calculation } = quote;
  return (
    <div id="skylight-quotation" dir="ltr" lang="en">
      <article className="pdf-page flex flex-col bg-white p-6 text-slate-900 sm:p-10" style={{ colorScheme: "light" }}>
        <header className="flex items-start justify-between gap-5 border-b-2 border-[#0057a8] pb-5">
          <div className="flex flex-wrap items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/AlumexLogo.svg" alt="Alumex Experts" width={88} height={88} className="w-[88px]" />
            <div>
              <p className="text-[11px] font-bold">Alumex Experts</p>
              <p className="mt-1 text-[10px] leading-4">Aluminium manufacturing & trading<br />Baghdad, Iraq<br />Rasafa branch · Karrada<br />Karkh branch · Yarmouk, Four Streets</p>
            </div>
          </div>
          <div className="text-end text-[11px]">
            <p className="font-bold uppercase tracking-widest text-[#0057a8]">Quotation</p>
            <p className="mt-2 font-bold">{quote.number}</p>
            <p className="mt-1">{quote.date}</p>
            <p className="mt-1">Currency: {quote.currency.code}</p>
          </div>
        </header>
        <h2 className="mt-4 text-2xl font-bold">Skylight quotation</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 rounded-md bg-slate-50 p-3 text-[11px]">
          <div><dt className="text-slate-500">Prepared for</dt><dd className="mt-1 break-words font-bold">{quote.customer || "—"}</dd></div>
          <div><dt className="text-slate-500">Project</dt><dd className="mt-1 break-words font-bold">{quote.project || "—"}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Prepared by</dt><dd className="mt-1 break-words font-bold">{quote.salesperson}</dd></div>
        </dl>
        <table className="mt-4 w-full table-fixed border-collapse text-[10px]">
          <thead className="bg-[#0057a8] text-white">
            <tr>
              <th scope="col" className="w-[70%] px-2 py-3 text-start">Item</th>
              <th scope="col" className="w-[15%] px-1 py-3 text-end">Qty</th>
              <th scope="col" className="w-[15%] px-1 py-3 text-center">Unit</th>
            </tr>
          </thead>
          <tbody>
            {calculation.lines.filter((line) => line.quantity > 0).map((line) => (
              <tr key={line.id} className="border-b border-slate-200">
                <td className="px-2 py-1.5">{line.name}</td>
                <td className="px-1 py-1.5 text-end tabular-nums">{line.quantity}</td>
                <td className="px-1 py-1.5 text-center">{line.unit}</td>
              </tr>
            ))}
            {calculation.otherCents > 0 && (
              <tr className="border-b border-slate-200">
                <td className="px-2 py-1.5">Other</td>
                <td className="px-1 py-1.5 text-end tabular-nums">1</td>
                <td className="px-1 py-1.5 text-center">—</td>
              </tr>
            )}
            {calculation.steelCents > 0 && (
              <tr className="border-b border-slate-200">
                <td className="px-2 py-1.5">Steel reinforcement</td>
                <td className="px-1 py-1.5 text-end tabular-nums">1</td>
                <td className="px-1 py-1.5 text-center">—</td>
              </tr>
            )}
          </tbody>
        </table>
        <section className="mt-4 text-[11px]" aria-label="Suggested glass options">
          <h3 className="font-bold">Suggested glass options — choose one</h3>
          {quote.currency.code === "IQD" && <p className="mt-1">{skylightRateLabel(quote.currency.rate)} · Rounded to whole IQD</p>}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-md bg-[#0057a8] p-3 text-white">
              <p className="font-bold">Standard glass</p>
              <p className="mt-1 text-[10px]">Grand total</p>
              <strong className="mt-1 block break-words text-base tabular-nums" data-testid="quotation-standard-total">{skylightTotal(calculation.standardTotalCents, quote.currency)}</strong>
            </div>
            <div className="min-w-0 rounded-md bg-[#0057a8] p-3 text-white">
              <p className="font-bold">Laminated glass</p>
              <p className="mt-1 text-[10px]">Grand total</p>
              <strong className="mt-1 block break-words text-base tabular-nums" data-testid="quotation-laminated-total">{skylightTotal(calculation.laminatedTotalCents, quote.currency)}</strong>
            </div>
          </div>
        </section>
        {quote.notes && <div className="mt-5 text-[11px]"><h3 className="font-bold">Notes</h3><p className="mt-1 break-words leading-5">{quote.notes}</p></div>}
        <footer className="mt-auto border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          <div className="flex justify-between gap-4"><span>Alumex Experts · Skylight quotation</span><span>1 / {1 + quote.attachments.reduce((total, attachment) => total + attachment.pageCount, 0)}</span></div>
        </footer>
      </article>
    </div>
  );
}
