"use client";
import type { ProjectBranch, ProjectGovernorate } from '@/lib/intake/projectBranch';
/* eslint-disable @next/next/no-img-element -- Print documents use the original SVG brand asset. */
import type { ReactNode } from 'react';
import type { QuoteSnapshot,Charge } from '@/lib/workflow/pricing';
import { measuredOpeningArea,openingSellingBand,isAlumexSqmSystem } from '@/lib/workflow/pricing';
import { quotationClientPricing } from '@/lib/quotations/clientPricing';
import { useI18n } from '@/components/i18n/I18nProvider';
import { OpeningAreaBadge,OpeningSellingLegend } from './OpeningAreaIndicator';

export function DocumentHeader({kind,number,createdAt}:{kind:'Quotation'|'Contract';number:string;createdAt:string}) {
 const {term,locale,formatDate}=useI18n();
 return <header className="document-header">
  <div className="document-brand"><img src="/logos/AlumexLogo.svg" alt={term('Alumex Experts')}/><div><strong>{term('ALUMEX EXPERTS')}</strong><p lang="ar" dir="rtl">شركة خبراء الومكس لصناعة وتجارة الالمنيوم المحدودة</p><p className="document-address" lang="ar" dir="rtl">بغداد / فرع الرصافة / كرادة / شارع مجمع المشن<br/>بغداد / فرع الكرخ / القادسية / مجاور ساحة النسور</p></div></div>
  <div className="document-reference"><p className="document-eyebrow">{term(kind==='Quotation'?'SALES QUOTATION':'SUPPLY & INSTALLATION')}</p><h2>{term(kind)}{locale==='en'&&<span lang="ar">{kind==='Quotation'?'عرض سعر':'عقد'}</span>}</h2><dl><div><dt>{term('Reference')}</dt><dd><bdi dir="ltr">{number}</bdi></dd></div><div><dt>{term('Issued')}</dt><dd><bdi dir="ltr">{formatDate(createdAt)}</bdi></dd></div><div><dt>{term('Currency')}</dt><dd>{term('Iraqi dinar · IQD')}</dd></div></dl></div>
 </header>;
}
export function DocumentParties({client,project}:{client:{name:string;mobile:string|null};project:{number:string;address:string|null;branch?:ProjectBranch|null;governorate?:ProjectGovernorate|null}}){
 const {term}=useI18n();
 return <div className="document-parties"><section><h3>{term('PREPARED FOR / العميل')}</h3><p className="document-client" dir="auto">{client.name}</p><p><bdi dir="ltr">{client.mobile}</bdi></p></section><section><h3>{term('PROJECT SITE / موقع المشروع')}</h3><p className="document-client"><bdi dir="ltr">{project.number}</bdi></p><p dir="auto">{project.address||'—'}</p>{project.branch && <p className="mt-2 font-semibold">{term(project.branch === 'Governorates' ? 'Governorates' : project.branch === 'Karkh' ? 'From Karkh' : 'From Rasafa')}</p>}{project.governorate && <p className="mt-1 font-semibold">{project.branch !== 'Governorates' && <>{term('Governorates')} · </>}<bdi>{project.governorate}</bdi></p>}</section></div>;
}
function ChargeRows({items,labels}:{items:Charge[];labels?:string[]}) {
 const {term,formatNumber}=useI18n();
 return <>{items.map((item,i)=><tr key={item.id}><td>{labels&&<span className="document-charge-kind">{term(labels[i])}</span>}<span dir="auto">{term(item.name)}</span></td><td>{formatNumber(item.quantity)} {term(item.unit==='sqm'?'m²':item.unit==='meter'?'m':item.unit)}</td><td>{formatNumber(item.rate)}</td><td>{formatNumber(item.total)}</td></tr>)}</>;
}
export function OpeningSchedule({quote,showAreaColors=false,blendSystemRates=false}:{quote:QuoteSnapshot;showAreaColors?:boolean;blendSystemRates?:boolean}) {
 const {term,locale,formatMoney,formatNumber}=useI18n();
 const clientPricing=blendSystemRates?quotationClientPricing(quote):null;
 const clientOpenings=new Map(clientPricing?.openings.map(opening=>[opening.openingId,opening]));
 return <section className="document-schedule">{!!quote.lines.length&&<div className="document-section-heading"><h3>{term('Opening schedule')}{locale==='en'&&<span lang="ar">جدول الفتحات</span>}</h3><p>{term('{count} openings · {area} m² measured',{count:formatNumber(quote.lines.reduce((sum,line)=>sum+(line.opening.quantity??1),0)),area:formatNumber(quote.lines.reduce((sum,line)=>sum+line.area,0),2)})}</p></div>}
 {showAreaColors&&quote.lines.some(line=>isAlumexSqmSystem(line.system))&&<OpeningSellingLegend/>}
 {clientPricing&&<div className="document-note" data-client-system-rate={clientPricing.rate}>
  <p className="font-semibold">{term('Common Alumex system rate')}: {formatNumber(clientPricing.rate,4)} {term('IQD')} / {term('m²')}</p>
  <p>{term('The same average system rate applies to each billable m². Glass and add-ons are priced separately.')}</p>
  <p>{term(quote.discount?'The displayed average rate is rounded; opening amounts are rounded to whole IQD and reconcile to the quotation subtotal.':'The displayed average rate is rounded; opening amounts are rounded to whole IQD and reconcile to the quotation total.')}</p>
 </div>}
 {!!quote.lines.length&&<div className="document-schedule-scroll" role="region" aria-label={term('Opening schedule')} tabIndex={0}>
  <table className="document-opening-table">
   <caption className="sr-only">{term('Opening schedule')}</caption>
   <colgroup>{(clientPricing?[4,12,16,5,18,10,13,11,11]:[4,12,16,5,21,10,10,11,11]).map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup>
   <thead><tr>{['No.','Floor / room','Opening / dimensions','Qty','Specification','Basis','Rate · IQD','Amount · IQD','Opening total · IQD'].map(label=><th key={label} scope="col">{term(label)}</th>)}</tr></thead>
   {quote.lines.map((line,index)=>{
    const clientOpening=clientOpenings.get(line.opening.id);
    const charges=[line.system,...(line.glass?[line.glass]:[]),...line.extras];
    const labels=['Aluminum / system',...(line.glass?['Glass']:[]),...line.extras.map(()=>'Add-on')];
    const area=measuredOpeningArea(line.opening);
    const band=showAreaColors&&isAlumexSqmSystem(line.system)?openingSellingBand(area,line.system.rate,line.opening):undefined;
    const minimumApplied=line.opening.opening_type==='Window'&&area<1&&charges.some(charge=>charge.unit==='sqm'&&charge.quantity>line.area);
    return <tbody key={line.opening.id} data-area-band={band} className={`document-opening-group${band?` opening-area-${band}`:''}`}>
     {charges.map((charge,chargeIndex)=><tr key={`${charge.id}-${chargeIndex}`}>
      {chargeIndex===0&&<>
       <th scope="rowgroup" rowSpan={charges.length} className="document-opening-index">{formatNumber(index+1)}</th>
       <td rowSpan={charges.length}><strong dir="auto">{term(line.opening.floor)}</strong><span className="document-table-detail" dir="auto">{line.opening.work_area==='internal'?`${term('Internal works')} · ${term(line.opening.room)}`:term(line.opening.room)}</span></td>
       <td rowSpan={charges.length}><strong>{term(line.opening.opening_type)} {line.opening.opening_direction?term(line.opening.opening_direction):''}{line.opening.has_arch?` · ${term('Arch')}`:''}{line.opening.has_roller_shutter?` · ${term('Roller shutter')}`:''}</strong><span className="document-table-detail"><bdi dir="ltr">{formatNumber(line.opening.width)} × {formatNumber(line.opening.height)}</bdi> {term('cm')}</span><span className="document-table-detail">{formatNumber(line.area,2)} {term('m²')}</span>{showAreaColors&&<span className="document-opening-area-indicator mt-1 block">{band?<OpeningAreaBadge area={area} rate={line.system.rate} opening={line.opening}/>:<span className="text-xs text-slate-600">{term('Each opening: {area} m²',{area:formatNumber(area)})}</span>}</span>}{minimumApplied&&<span className="document-table-detail">{term('Minimum billable area: 1 m² per window.')}</span>}</td>
       <td rowSpan={charges.length} className="document-table-number">{formatNumber(line.opening.quantity??1)}</td>
      </>}
      <td><span className="document-charge-kind">{term(labels[chargeIndex])}</span><span dir="auto">{term(charge.name)}</span></td>
      <td className="document-table-number">{formatNumber(charge.quantity)} {term(charge.unit==='sqm'?'m²':charge.unit==='meter'?'m':charge.unit)}</td>
      <td className={`document-table-number${chargeIndex===0&&clientOpening?' whitespace-nowrap':''}`}>{formatNumber(chargeIndex===0&&clientOpening&&clientPricing?clientPricing.rate:charge.rate,4)}</td>
      <td className="document-table-number">{formatNumber(chargeIndex===0&&clientOpening?clientOpening.systemAmount:charge.total)}</td>
      {chargeIndex===0&&<td rowSpan={charges.length} className="document-table-number document-opening-total">{formatNumber(clientOpening?.openingTotal??line.total)}</td>}
     </tr>)}
    </tbody>;
   })}
  </table>
 </div>}
 {!!quote.facadeMeasurements?.length&&<section className="document-opening">
  <div className="document-section-heading"><h3>{term('Recorded facade dimensions')}</h3></div>
  <table><caption className="sr-only">{term('Recorded facade dimensions')}</caption><thead><tr>{['Facade','Width (cm)','Length (cm)'].map(label=><th key={label}>{term(label)}</th>)}</tr></thead><tbody>{quote.facadeMeasurements.map(o=><tr key={o.id}><th scope="row">{term('Facade {number}',{number:String(o.facade_number)})}</th><td>{formatNumber(o.width)}</td><td>{formatNumber(o.height)}</td></tr>)}</tbody></table>
 </section>}
 {!!quote.additionalItems?.length&&<div className="document-section-heading"><h3>{term('Standalone products & facade services')}{locale==='en'&&<span lang="ar">منتجات مستقلة وخدمات واجهات</span>}</h3></div>}
 {quote.additionalItems?.map(item=><section key={item.id} className="document-opening">
  <div className="document-opening-heading"><h4>{term(item.name)}</h4></div>
  {!!item.measurements?.length&&<table><caption className="sr-only">{term('Measured facade areas')}</caption><thead><tr><th>{term('Area / elevation name')}</th><th>{term('Dimensions (m)')}</th><th>{term('Quantity')}</th><th>{term('Area (m²)')}</th></tr></thead><tbody>{item.measurements.map((area,index)=><tr key={index}><td dir="auto">{term(area.label)}</td><td><bdi>{formatNumber(area.width,3)} × {formatNumber(area.height,3)}</bdi></td><td>{formatNumber(area.quantity)}</td><td>{formatNumber(area.width*area.height*area.quantity,3)}</td></tr>)}</tbody></table>}
  <table><caption className="sr-only">{term('Project products and services')}</caption><thead><tr><th>{term('Product / service')}</th><th>{term('Basis')}</th><th>{term('Rate · IQD')}</th><th>{term('Amount · IQD')}</th></tr></thead><tbody><ChargeRows items={[item,...(item.extras??[])]}/></tbody></table>
 </section>)}
 {quote.skylightsPricedSeparately&&<p className="document-note">{term('Skylights are priced separately in the calculator and are not included in this quotation.')}</p>}
 <div className="break-inside-avoid">
  {quote.discount&&<dl className="mb-4 ms-auto max-w-sm space-y-2 text-sm text-slate-700">
   <div className="flex items-baseline justify-between gap-4"><dt>{term('Subtotal')}</dt><dd className="font-semibold"><bdi>{formatMoney(quote.discount.subtotal)}</bdi></dd></div>
   <div className="flex items-baseline justify-between gap-4"><dt>{term('Discount (5%)')}</dt><dd className="font-semibold"><bdi>{formatMoney(-quote.discount.amount)}</bdi></dd></div>
  </dl>}
  <div className="document-total"><div><span>{term('TOTAL / الإجمالي')}</span><p>{term('All amounts in Iraqi dinars')}</p></div><strong>{formatMoney(quote.total)}</strong></div>
 </div></section>;
}
export function DocumentFooter({reference}:{reference:string}){const {term}=useI18n();return <footer className="document-footer"><strong>{term('ALUMEX EXPERTS')}</strong><bdi dir="ltr">{reference}</bdi></footer>;}
export function DocumentPaper({children}:{children:ReactNode}){const {direction,locale}=useI18n();return <article className="commercial-document" dir={direction} lang={locale}>{children}</article>;}
export function ContractTerms({terms}:{terms:{title:string;text:string}[]}){
 const {term,locale,formatNumber}=useI18n();
 const labels:Record<string,string>={'contract terms':'General conditions / الشروط العامة','payment terms':'Payment terms / شروط الدفع','warranty terms':'Warranty / الكفالة','execution terms':'Execution / مدة التنفيذ','first party obligations':'First party obligations / التزامات الطرف الأول','second party obligations':'Second party obligations / التزامات الطرف الثاني'};
 return <section className="document-terms"><div className="document-section-heading"><h3>{term('Terms & conditions')}{locale==='en'&&<span lang="ar">الشروط والأحكام</span>}</h3></div>{terms.map((section,index)=><section key={section.title}><h4><span>{formatNumber(index+1)}</span>{term(labels[section.title]??section.title)}</h4>{section.text.split('\n').filter(Boolean).map((paragraph,i)=><p dir="auto" key={i}>{paragraph}</p>)}</section>)}</section>;
}
