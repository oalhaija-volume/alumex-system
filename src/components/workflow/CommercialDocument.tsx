"use client";
/* eslint-disable @next/next/no-img-element -- Print documents use the original SVG brand asset. */
import type { ReactNode } from 'react';
import type { QuoteSnapshot,Charge } from '@/lib/workflow/pricing';
import { useI18n } from '@/components/i18n/I18nProvider';

export function DocumentHeader({kind,number,createdAt}:{kind:'Quotation'|'Contract';number:string;createdAt:string}) {
 const {term,locale,formatDate}=useI18n();
 return <header className="document-header">
  <div className="document-brand"><img src="/logos/AlumexLogo.svg" alt={term('Alumex Experts')}/><div><strong>{term('ALUMEX EXPERTS')}</strong><p lang="ar" dir="rtl">شركة خبراء الومكس لصناعة وتجارة الالمنيوم المحدودة</p><p className="document-address" lang="ar" dir="rtl">بغداد / فرع الرصافة / كرادة / شارع مجمع المشن<br/>بغداد / فرع الكرخ / القادسية / مجاور ساحة النسور</p></div></div>
  <div className="document-reference"><p className="document-eyebrow">{term(kind==='Quotation'?'SALES QUOTATION':'SUPPLY & INSTALLATION')}</p><h2>{term(kind)}{locale==='en'&&<span lang="ar">{kind==='Quotation'?'عرض سعر':'عقد'}</span>}</h2><dl><div><dt>{term('Reference')}</dt><dd><bdi dir="ltr">{number}</bdi></dd></div><div><dt>{term('Issued')}</dt><dd><bdi dir="ltr">{formatDate(createdAt)}</bdi></dd></div><div><dt>{term('Currency')}</dt><dd>{term('Iraqi dinar · IQD')}</dd></div></dl></div>
 </header>;
}
export function DocumentParties({client,project}:{client:{name:string;mobile:string|null};project:{number:string;address:string|null;branch?:"Karkh"|"Rasafa"|null}}){
 const {term}=useI18n();
 return <div className="document-parties"><section><h3>{term('PREPARED FOR / العميل')}</h3><p className="document-client" dir="auto">{client.name}</p><p><bdi dir="ltr">{client.mobile}</bdi></p></section><section><h3>{term('PROJECT SITE / موقع المشروع')}</h3><p className="document-client"><bdi dir="ltr">{project.number}</bdi></p><p dir="auto">{project.address||'—'}</p>{project.branch && <p className="mt-2 font-semibold">{term(project.branch === 'Karkh' ? 'From Karkh' : 'From Rasafa')}</p>}</section></div>;
}
function ChargeRows({items,labels}:{items:Charge[];labels?:string[]}) {
 const {term,formatNumber}=useI18n();
 return <>{items.map((item,i)=><tr key={item.id}><td>{labels&&<span className="document-charge-kind">{term(labels[i])}</span>}<span dir="auto">{term(item.name)}</span></td><td>{formatNumber(item.quantity)} {term(item.unit==='sqm'?'m²':item.unit==='meter'?'m':item.unit)}</td><td>{formatNumber(item.rate)}</td><td>{formatNumber(item.total)}</td></tr>)}</>;
}
export function OpeningSchedule({quote}:{quote:QuoteSnapshot}) {
 const {term,locale,formatMoney,formatNumber}=useI18n();
 return <section className="document-schedule">{!!quote.lines.length&&<div className="document-section-heading"><h3>{term('Opening schedule')}{locale==='en'&&<span lang="ar">جدول الفتحات</span>}</h3><p>{term('{count} openings · {area} m² measured',{count:formatNumber(quote.lines.reduce((sum,line)=>sum+(line.opening.quantity??1),0)),area:formatNumber(quote.lines.reduce((sum,line)=>sum+line.area,0),2)})}</p></div>}
 {!!quote.lines.length&&<div className="document-schedule-scroll" role="region" aria-label={term('Opening schedule')} tabIndex={0}>
  <table className="document-opening-table">
   <caption className="sr-only">{term('Opening schedule')}</caption>
   <colgroup>{[4,12,16,5,21,10,10,11,11].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup>
   <thead><tr>{['No.','Floor / room','Opening / dimensions','Qty','Specification','Basis','Rate · IQD','Amount · IQD','Opening total · IQD'].map(label=><th key={label} scope="col">{term(label)}</th>)}</tr></thead>
   {quote.lines.map((line,index)=>{
    const charges=[line.system,...(line.glass?[line.glass]:[]),...line.extras];
    const labels=['Aluminum / system',...(line.glass?['Glass']:[]),...line.extras.map(()=>'Add-on')];
    return <tbody key={line.opening.id} className="document-opening-group">
     {charges.map((charge,chargeIndex)=><tr key={`${charge.id}-${chargeIndex}`}>
      {chargeIndex===0&&<>
       <th scope="rowgroup" rowSpan={charges.length} className="document-opening-index">{formatNumber(index+1)}</th>
       <td rowSpan={charges.length}><strong dir="auto">{term(line.opening.floor)}</strong><span className="document-table-detail" dir="auto">{term(line.opening.room)}</span></td>
       <td rowSpan={charges.length}><strong>{term(line.opening.opening_type)} {line.opening.opening_direction?term(line.opening.opening_direction):''}</strong><span className="document-table-detail"><bdi dir="ltr">{formatNumber(line.opening.width)} × {formatNumber(line.opening.height)}</bdi> {term('cm')}</span><span className="document-table-detail">{formatNumber(line.area,2)} {term('m²')}</span></td>
       <td rowSpan={charges.length} className="document-table-number">{formatNumber(line.opening.quantity??1)}</td>
      </>}
      <td><span className="document-charge-kind">{term(labels[chargeIndex])}</span><span dir="auto">{term(charge.name)}</span></td>
      <td className="document-table-number">{formatNumber(charge.quantity)} {term(charge.unit==='sqm'?'m²':charge.unit==='meter'?'m':charge.unit)}</td>
      <td className="document-table-number">{formatNumber(charge.rate)}</td>
      <td className="document-table-number">{formatNumber(charge.total)}</td>
      {chargeIndex===0&&<td rowSpan={charges.length} className="document-table-number document-opening-total">{formatNumber(line.total)}</td>}
     </tr>)}
    </tbody>;
   })}
  </table>
 </div>}
 {!!quote.additionalItems?.length&&<div className="document-section-heading"><h3>{term('Standalone products & facade services')}{locale==='en'&&<span lang="ar">منتجات مستقلة وخدمات واجهات</span>}</h3></div>}
 {quote.additionalItems?.map(item=><section key={item.id} className="document-opening">
  <div className="document-opening-heading"><h4>{term(item.name)}</h4></div>
  {!!item.measurements?.length&&<table><caption className="sr-only">{term('Measured facade areas')}</caption><thead><tr><th>{term('Area / elevation name')}</th><th>{term('Dimensions (m)')}</th><th>{term('Quantity')}</th><th>{term('Area (m²)')}</th></tr></thead><tbody>{item.measurements.map((area,index)=><tr key={index}><td dir="auto">{area.label}</td><td><bdi>{formatNumber(area.width,3)} × {formatNumber(area.height,3)}</bdi></td><td>{formatNumber(area.quantity)}</td><td>{formatNumber(area.width*area.height*area.quantity,3)}</td></tr>)}</tbody></table>}
  <table><caption className="sr-only">{term('Project products and services')}</caption><thead><tr><th>{term('Product / service')}</th><th>{term('Basis')}</th><th>{term('Rate · IQD')}</th><th>{term('Amount · IQD')}</th></tr></thead><tbody><ChargeRows items={[item,...(item.extras??[])]}/></tbody></table>
 </section>)}
 {quote.skylightsPricedSeparately&&<p className="document-note">{term('Skylights are priced separately in the calculator and are not included in this quotation.')}</p>}
 <div className="document-total"><div><span>{term('TOTAL / الإجمالي')}</span><p>{term('All amounts in Iraqi dinars')}</p></div><strong>{formatMoney(quote.total)}</strong></div></section>;
}
export function DocumentFooter({reference}:{reference:string}){const {term}=useI18n();return <footer className="document-footer"><strong>{term('ALUMEX EXPERTS')}</strong><bdi dir="ltr">{reference}</bdi></footer>;}
export function DocumentPaper({children}:{children:ReactNode}){const {direction,locale}=useI18n();return <article className="commercial-document" dir={direction} lang={locale}>{children}</article>;}
export function ContractTerms({terms}:{terms:{title:string;text:string}[]}){
 const {term,locale,formatNumber}=useI18n();
 const labels:Record<string,string>={'contract terms':'General conditions / الشروط العامة','payment terms':'Payment terms / شروط الدفع','warranty terms':'Warranty / الكفالة','execution terms':'Execution / مدة التنفيذ','first party obligations':'First party obligations / التزامات الطرف الأول','second party obligations':'Second party obligations / التزامات الطرف الثاني'};
 return <section className="document-terms"><div className="document-section-heading"><h3>{term('Terms & conditions')}{locale==='en'&&<span lang="ar">الشروط والأحكام</span>}</h3></div>{terms.map((section,index)=><section key={section.title}><h4><span>{formatNumber(index+1)}</span>{term(labels[section.title]??section.title)}</h4>{section.text.split('\n').filter(Boolean).map((paragraph,i)=><p dir="auto" key={i}>{paragraph}</p>)}</section>)}</section>;
}
