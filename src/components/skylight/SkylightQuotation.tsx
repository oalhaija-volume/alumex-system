import { laminationPriceCents, skylightMoney, type calculateSkylight } from "@/lib/skylight";

export type SkylightQuotationData = {
  number: string;
  date: string;
  customer: string;
  project: string;
  notes: string;
  laminated: boolean;
  calculation: ReturnType<typeof calculateSkylight>;
};

export function SkylightQuotation({ quote }: { quote: SkylightQuotationData }) {
  const { calculation, laminated } = quote;
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
            <p className="mt-1">Currency: USD</p>
          </div>
        </header>
        <h2 className="mt-6 text-2xl font-bold">Skylight quotation</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 rounded-md bg-slate-50 p-3 text-[11px]">
          <div><dt className="text-slate-500">Prepared for</dt><dd className="mt-1 break-words font-bold">{quote.customer || "—"}</dd></div>
          <div><dt className="text-slate-500">Project</dt><dd className="mt-1 break-words font-bold">{quote.project || "—"}</dd></div>
        </dl>
        <p className="mt-4 text-[11px] font-semibold">Glass specification: {laminated ? "Laminated glass — $175.00/m²" : "Standard glass — $120.00/m²"}</p>
        <table className="mt-4 w-full table-fixed border-collapse text-[10px]">
          <thead className="bg-[#0057a8] text-white">
            <tr>
              <th scope="col" className="w-[40%] px-2 py-3 text-start">Item</th>
              <th scope="col" className="w-[12%] px-1 py-3 text-end">Qty</th>
              <th scope="col" className="w-[10%] px-1 py-3 text-center">Unit</th>
              <th scope="col" className="w-[18%] px-1 py-3 text-end">Unit price</th>
              <th scope="col" className="w-[20%] px-2 py-3 text-end">Total</th>
            </tr>
          </thead>
          <tbody>
            {calculation.lines.filter((line) => line.quantity > 0).map((line) => (
              <tr key={line.id} className="border-b border-slate-200">
                <td className="px-2 py-2.5">{line.name}{line.id === "glass" && laminated ? " (laminated)" : ""}</td>
                <td className="px-1 py-2.5 text-end tabular-nums">{line.quantity}</td>
                <td className="px-1 py-2.5 text-center">{line.unit}</td>
                <td className="px-1 py-2.5 text-end tabular-nums">{skylightMoney(line.priceCents + (line.id === "glass" && laminated ? laminationPriceCents : 0))}</td>
                <td className="px-2 py-2.5 text-end font-semibold tabular-nums">{skylightMoney(line.totalCents + (laminated ? line.laminationCents : 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 ms-auto w-full max-w-72 text-[11px]">
          {laminated && <div className="mb-2 flex justify-between gap-3"><span>Lamination included ($55.00/m²)</span><span>{skylightMoney(calculation.laminationCents)}</span></div>}
          <div className="flex items-center justify-between gap-4 rounded-md bg-[#0057a8] p-4 text-white">
            <span className="font-bold">Grand total</span>
            <strong className="text-lg tabular-nums">{skylightMoney(laminated ? calculation.laminatedTotalCents : calculation.standardTotalCents)}</strong>
          </div>
        </div>
        {quote.notes && <div className="mt-5 text-[11px]"><h3 className="font-bold">Notes</h3><p className="mt-1 break-words leading-5">{quote.notes}</p></div>}
        <footer className="mt-auto border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          <div className="flex justify-between gap-4"><span>Alumex Experts · Skylight quotation</span><span>1 / 1</span></div>
        </footer>
      </article>
    </div>
  );
}
