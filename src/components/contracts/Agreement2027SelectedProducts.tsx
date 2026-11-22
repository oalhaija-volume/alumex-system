"use client";
import type { CSSProperties } from 'react';
import type { Agreement2027Product } from '@/lib/contracts/agreement2027Products';
import layout from '../../../public/contracts/agreement-2027/template-layout.json';
import styles from './SourceAgreement2027Document.module.css';

export type Agreement2027ProductCard = { product: Agreement2027Product; rows: string[]; headingHeight: number; height: number; continuation: boolean };
type ProductCard = Agreement2027ProductCard;
export type SelectedSpecificationPage = { sourcePage: 3 | 4; cards: ProductCard[] };
const rowHeight = 14;
const gap = 6;
const number = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
const unitLabels: Record<string, string> = { sqm: 'المتر المربع', meter: 'المتر الطولي', item: 'الوحدة', unit: 'الوحدة', set: 'الطقم', pair: 'الزوج' };
function wrap(text: string): string[] {
 const rows: string[] = [];
 // Short, complete rows prevent saved notes from overflowing the source page.
 // Every character is retained, including an unbroken product reference.
 for (const paragraph of text.split('\n')) {
  if (!paragraph.trim()) continue;
  let remaining = paragraph.trim();
  while (remaining.length > 48) {
   const space = remaining.lastIndexOf(' ', 48);
   const end = space > 20 ? space : 48;
   rows.push(remaining.slice(0, end));
   remaining = remaining.slice(end).trimStart();
  }
  if (remaining) rows.push(remaining);
 }
 return rows;
}
export function agreement2027ProductCards(products: Agreement2027Product[], maximumHeight?: number): ProductCard[] {
 const width = layout.layout.stationery['3'].contentRect[2] - layout.layout.stationery['3'].contentRect[0];
 const minimumPageHeight = maximumHeight ?? layout.layout.stationery['4'].contentRect[3] - layout.layout.stationery['4'].contentRect[1];
 return products.flatMap(product => {
  const headingHeight = Math.max(1, Math.ceil(product.name.length * 12.5 * 1.1 / (width - 12))) * 16 + 6;
  const rateCaption = 'سعر ' + (unitLabels[product.unit] ?? product.unit) + ': ' + product.rates.map(number).join(' / ') + ' دينار عراقي.';
  const rows = [...product.technicalDescriptions, ...product.details, rateCaption].flatMap(wrap);
  const maximumRows = Math.max(1, Math.floor((minimumPageHeight - headingHeight - gap) / rowHeight));
  const parts: ProductCard[] = [];
  for (let start = 0; start < rows.length; start += maximumRows) {
   const part = rows.slice(start, start + maximumRows);
   parts.push({ product, rows: part, headingHeight, height: headingHeight + part.length * rowHeight + gap, continuation: start > 0 });
  }
  return parts;
 });
}
function paginate(items: ProductCard[], sourcePage: 3 | 4): ProductCard[][] {
 const rect = layout.layout.stationery[String(sourcePage) as '3' | '4'].contentRect;
 const capacity = rect[3] - rect[1];
 const pages: ProductCard[][] = [[]];
 let used = 0;
 for (const item of items) {
  if (used && used + item.height > capacity) { pages.push([]); used = 0; }
  pages[pages.length - 1].push(item);
  used += item.height;
 }
 return pages;
}
export function selectedSpecificationPages(products: Agreement2027Product[]): SelectedSpecificationPage[] {
 const systems = paginate(agreement2027ProductCards(products.filter(product => product.kind === 'system')), 3);
 const extras = paginate(agreement2027ProductCards(products.filter(product => product.kind !== 'system')), 4);
 // Additional rows use the same source stationery rather than truncating a
 // selected product or moving text over the original legal notes.
 return [
  ...systems.map(items => ({ sourcePage: 3 as const, cards: items })),
  ...extras.slice(0, -1).map(items => ({ sourcePage: 3 as const, cards: items })),
  { sourcePage: 4, cards: extras[extras.length - 1] },
 ];
}
export function Agreement2027SelectedProducts({ page, contentRect }: { page: SelectedSpecificationPage; contentRect?: number[] }) {
 const rect = contentRect ?? layout.layout.stationery[String(page.sourcePage) as '3' | '4'].contentRect;
 return <>{page.cards.map((card, index) => {
  const top = rect[1] + page.cards.slice(0, index).reduce((height, previous) => height + previous.height, 0);
  const style: CSSProperties = {
   left: rect[0] / layout.pageSize.width * 100 + '%', top: top / layout.pageSize.height * 100 + '%',
   width: (rect[2] - rect[0]) / layout.pageSize.width * 100 + '%', height: card.height / layout.pageSize.height * 100 + '%',
  };
  return <section key={card.product.id + ':' + index} data-agreement-product={card.continuation ? undefined : card.product.id} data-agreement-product-continuation={card.continuation ? card.product.id : undefined} data-agreement-source-key={card.product.sourceKey} data-agreement-product-kind={card.product.kind} className={styles.product} style={style}>
   <h4 className={styles.productHeading} style={{ height: card.headingHeight / layout.pageSize.width * 100 + 'cqw' }}><bdi>{card.product.name}</bdi>{card.continuation && <span> — تابع</span>}</h4>
   <div className={styles.productDetails}>{card.rows.map((text, row) => <p key={row} dir="auto">{text}</p>)}</div>
  </section>;
 })}</>;
}
