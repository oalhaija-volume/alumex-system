"use client";
/* eslint-disable @next/next/no-img-element -- Print documents use the original SVG brand asset. */
import type { ReactNode } from 'react';
import type { QuoteSnapshot,Charge } from '@/lib/workflow/pricing';
import { useI18n } from '@/components/i18n/I18nProvider';

export function DocumentHeader({kind,number,createdAt}:{kind:'Quotation'|'Contract';number:string;createdAt:string}) {
 const {term,locale,formatDate}=useI18n();
 return <header className="document-header">
  <div className="document-brand"><img src="/logos/AlumexLogo.svg" alt={term('Alumex Experts')}/><div><strong>{term('ALUMEX EXPERTS')}</strong><p lang="ar" dir="rtl">شركة خبراء الومكس لصناعة وتجارة الالمنيوم المحدودة</p><p className="document-address" lang="ar" dir="rtl">بغداد / فرع الرصافة / كرادة / شارع مجمع المشن<br/>بغداد / فرع الكرخ / القادسية / مجاور ساحة النسور</p></div></div>
  <div className="document-reference"><p className="document-eyebrow">{term(kind==='Quotation'?'SALES QUOTATION':'SUPPLY & INSTALLATION')}</p><h2>{term(kind)}{locale==='en'&&<span lang="ar">{kind==='Quotation'?'عرض سعر':'عقد'}</span>}</h2><dl><div><dt>{term('Reference')}</dt><dd><bdi dir="ltr">{number}</bdi></dd></div><div><dt>{term('Issued')}</dt><dd>{formatDate(createdAt)}</dd></div><div><dt>{term('Currency')}</dt><dd>{term('Iraqi dinar · IQD')}</dd></div></dl></div>
 </header>;
}
export function DocumentParties({client,project}:{client:{name:string;mobile:string|null};project:{number:string;address:string|null}}){
 const {term}=useI18n();
 return <div className="document-parties"><section><h3>{term('PREPARED FOR / العميل')}</h3><p className="document-client" dir="auto">{client.name}</p><p><bdi dir="ltr">{client.mobile}</bdi></p></section><section><h3>{term('PROJECT SITE / موقع المشروع')}</h3><p className="document-client"><bdi dir="ltr">{project.number}</bdi></p><p dir="auto">{project.address||'—'}</p></section></div>;
}
function ChargeRows({items,labels}:{items:Charge[];labels?:string[]}) {
 const {term,formatNumber}=useI18n();
 return <>{items.map((item,i)=><tr key={item.id}><td>{labels&&<span className="document-charge-kind">{term(labels[i])}</span>}<span dir="auto">{term(item.name)}</span></td><td>{formatNumber(item.quantity)} {term(item.unit==='sqm'?'m²':item.unit==='meter'?'m':item.unit)}</td><td>{formatNumber(item.rate)}</td><td>{formatNumber(item.total)}</td></tr>)}</>;
}
export function OpeningSchedule({quote}:{quote:QuoteSnapshot}) {
 const {term,locale,formatMoney,formatNumber}=useI18n();
 const columns=<tr><th>{term('Specification')}</th><th>{term('Basis')}</th><th>{term('Rate · IQD')}</th><th>{term('Amount · IQD')}</th></tr>;
 return <section className="document-schedule"><div className="document-section-heading"><h3>{term('Opening schedule')}{locale==='en'&&<span lang="ar">جدول الفتحات</span>}</h3><p>{term('{count} openings · {area} m² measured',{count:formatNumber(quote.lines.length),area:formatNumber(quote.lines.reduce((sum,line)=>sum+line.area,0),2)})}</p></div>
 {quote.lines.map((line,index)=><section className="document-opening" key={line.opening.id}>
  <div className="document-opening-heading"><div className="document-opening-number">{formatNumber(index+1)}</div><div><h4>{term(line.opening.opening_type)} {line.opening.opening_direction?term(line.opening.opening_direction):''}</h4><p>{term('Floor')} {term(line.opening.floor)} · {term(line.opening.room)}</p></div><div className="document-dimensions"><strong><bdi dir="ltr">{formatNumber(line.opening.width)} × {formatNumber(line.opening.height)}</bdi> {term('cm')}</strong><p>{formatNumber(line.area,2)} {term('m²')}</p></div></div>
  <table><caption className="sr-only">{term('Prices for opening {number}',{number:formatNumber(index+1)})}</caption><thead>{columns}</thead><tbody><ChargeRows items={[line.system,...(line.glass?[line.glass]:[]),...line.extras]} labels={['Aluminum / system',...(line.glass?['Glass']:[]),...line.extras.map(()=>'Add-on')]}/></tbody><tfoot><tr><th colSpan={3}>{term('Opening {number} total',{number:formatNumber(index+1)})}</th><td>{formatMoney(line.total)}</td></tr></tfoot></table>
 </section>)}
 {!!quote.additionalItems?.length&&<section className="document-opening"><div className="document-section-heading px-3"><h3>{term('Additional products & services')}{locale==='en'&&<span lang="ar">منتجات وخدمات إضافية</span>}</h3></div><table><caption className="sr-only">{term('Project products and services')}</caption><thead><tr><th>{term('Product / service')}</th><th>{term('Basis')}</th><th>{term('Rate · IQD')}</th><th>{term('Amount · IQD')}</th></tr></thead><tbody><ChargeRows items={quote.additionalItems}/></tbody></table></section>}
 <div className="document-total"><div><span>{term('TOTAL / الإجمالي')}</span><p>{term('All amounts in Iraqi dinars')}</p></div><strong>{formatMoney(quote.total)}</strong></div></section>;
}
export function DocumentFooter({reference}:{reference:string}){const {term}=useI18n();return <footer className="document-footer"><strong>{term('ALUMEX EXPERTS')}</strong><bdi dir="ltr">{reference}</bdi></footer>;}
export function DocumentPaper({children}:{children:ReactNode}){const {direction,locale}=useI18n();return <article className="commercial-document" dir={direction} lang={locale}>{children}</article>;}
export function ContractTerms({terms}:{terms:{title:string;text:string}[]}){
 const {term,locale,formatNumber}=useI18n();
 const labels:Record<string,string>={'contract terms':'General conditions / الشروط العامة','payment terms':'Payment terms / شروط الدفع','warranty terms':'Warranty / الكفالة','execution terms':'Execution / مدة التنفيذ','first party obligations':'First party obligations / التزامات الطرف الأول','second party obligations':'Second party obligations / التزامات الطرف الثاني'};
 return <section className="document-terms"><div className="document-section-heading"><h3>{term('Terms & conditions')}{locale==='en'&&<span lang="ar">الشروط والأحكام</span>}</h3></div>{terms.map((section,index)=><section key={section.title}><h4><span>{formatNumber(index+1)}</span>{term(labels[section.title]??section.title)}</h4>{section.text.split('\n').filter(Boolean).map((paragraph,i)=><p dir="auto" key={i}>{paragraph}</p>)}</section>)}</section>;
}
