/* eslint-disable @next/next/no-img-element -- Print documents use the original SVG brand asset. */
import type { ReactNode } from 'react';
import type { QuoteSnapshot } from '@/lib/workflow/pricing';
import { money } from '@/lib/workflow/pricing';

const date = (value: string) => new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Baghdad' }).format(new Date(value));
export function DocumentHeader({kind,number,createdAt}:{kind:'Quotation'|'Contract';number:string;createdAt:string}) {
 return <header className="document-header">
  <div className="document-brand"><img src="/logos/AlumexLogo.svg" alt="Alumex Experts"/><div><strong>ALUMEX EXPERTS</strong><p lang="ar" dir="rtl">شركة خبراء الومكس لصناعة وتجارة الالمنيوم المحدودة</p><p className="document-address" lang="ar" dir="rtl">بغداد / فرع الرصافة / كرادة / شارع مجمع المشن<br/>بغداد / فرع الكرخ / القادسية / مجاور ساحة النسور</p></div></div>
  <div className="document-reference"><p className="document-eyebrow">{kind==='Quotation'?'SALES QUOTATION':'SUPPLY & INSTALLATION'}</p><h2>{kind} <span lang="ar">{kind==='Quotation'?'عرض سعر':'عقد'}</span></h2><dl><div><dt>Reference</dt><dd>{number}</dd></div><div><dt>Issued</dt><dd>{date(createdAt)}</dd></div><div><dt>Currency</dt><dd>Iraqi dinar · IQD</dd></div></dl></div>
 </header>;
}
export function DocumentParties({client,project}:{client:{name:string;mobile:string|null};project:{number:string;address:string|null}}){
 return <div className="document-parties"><section><h3>PREPARED FOR / العميل</h3><p className="document-client" dir="auto">{client.name}</p><p dir="ltr">{client.mobile}</p></section><section><h3>PROJECT SITE / موقع المشروع</h3><p className="document-client">{project.number}</p><p dir="auto">{project.address||'—'}</p></section></div>;
}
export function OpeningSchedule({quote}:{quote:QuoteSnapshot}) {
 return <section className="document-schedule"><div className="document-section-heading"><h3>Opening schedule <span lang="ar">جدول الفتحات</span></h3><p>{quote.lines.length} openings · {quote.lines.reduce((sum,line)=>sum+line.area,0).toFixed(2)} m² measured</p></div>
 {quote.lines.map((line,index)=><section className="document-opening" key={line.opening.id}>
  <div className="document-opening-heading"><div className="document-opening-number">{String(index+1).padStart(2,'0')}</div><div><h4>{line.opening.opening_type} {line.opening.opening_direction}</h4><p>Floor {line.opening.floor} · {line.opening.room}</p></div><div className="document-dimensions"><strong>{line.opening.width} × {line.opening.height} cm</strong><p>{line.area.toFixed(2)} m²</p></div></div>
  <table><caption className="sr-only">Prices for opening {index+1}</caption><thead><tr><th>Specification</th><th>Basis</th><th>Rate · IQD</th><th>Amount · IQD</th></tr></thead><tbody>{[line.system,...(line.glass?[line.glass]:[]),...line.extras].map((item,i)=><tr key={item.id}><td><span className="document-charge-kind">{i===0?'Aluminum / system':item===line.glass?'Glass':'Add-on'}</span><span dir="auto">{item.name}</span></td><td>{item.quantity.toLocaleString('en-GB',{maximumFractionDigits:4})} {item.unit==='sqm'?'m²':item.unit==='meter'?'m':item.unit}</td><td>{item.rate.toLocaleString('en-GB')}</td><td>{item.total.toLocaleString('en-GB')}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Opening {index+1} total</th><td>{money(line.total)}</td></tr></tfoot></table>
 </section>)}
 <div className="document-total"><div><span>TOTAL / الإجمالي</span><p>All amounts in Iraqi dinars</p></div><strong>{money(quote.total)}</strong></div></section>;
}
export function DocumentFooter({reference}:{reference:string}){return <footer className="document-footer"><strong>ALUMEX EXPERTS</strong><span>{reference}</span></footer>;}
export function DocumentPaper({children}:{children:ReactNode}){return <article className="commercial-document">{children}</article>;}
export function ContractTerms({terms}:{terms:{title:string;text:string}[]}){
 const labels:Record<string,string>={'contract terms':'General conditions / الشروط العامة','payment terms':'Payment terms / شروط الدفع','warranty terms':'Warranty / الكفالة','execution terms':'Execution / مدة التنفيذ','first party obligations':'First party obligations / التزامات الطرف الأول','second party obligations':'Second party obligations / التزامات الطرف الثاني'};
 return <section className="document-terms"><div className="document-section-heading"><h3>Terms & conditions <span lang="ar">الشروط والأحكام</span></h3></div>{terms.map((term,index)=><section key={term.title}><h4><span>{String(index+1).padStart(2,'0')}</span>{labels[term.title]??term.title}</h4>{term.text.split('\n').filter(Boolean).map((paragraph,i)=><p dir="auto" key={i}>{paragraph}</p>)}</section>)}</section>;
}
