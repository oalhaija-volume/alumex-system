"use client";
/* eslint-disable @next/next/no-img-element -- Original PDF bands and stationery must retain their source rendering when printed. */
import type { CSSProperties, ReactNode } from 'react';
import type { ContractSnapshot } from '@/lib/workflow/types';
import type { Agreement2027Product } from '@/lib/contracts/agreement2027Products';
import { balancedAgreement2027Pages } from '@/lib/contracts/agreement2027Pagination';
import { Agreement2027SelectedProducts, agreement2027ProductCards, type Agreement2027ProductCard } from './Agreement2027SelectedProducts';
import layout from '../../../public/contracts/agreement-2027/template-layout.json';
import styles from './SourceAgreement2027Document.module.css';

type SourceBand = typeof layout.layout.compact.bands[number];
type FlowBlock = { id: string; height: number; keepWithNext?: boolean; band?: SourceBand; card?: Agreement2027ProductCard; clauses: number[] };
const compact = layout.layout.compact;
const content = compact.contentRect;
const capacity = content[3] - content[1];
const number = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
function position(rect: number[]): CSSProperties {
 return { left: rect[0] / layout.pageSize.width * 100 + '%', top: rect[1] / layout.pageSize.height * 100 + '%', width: (rect[2] - rect[0]) / layout.pageSize.width * 100 + '%', height: (rect[3] - rect[1]) / layout.pageSize.height * 100 + '%' };
}
function contractFlow(contract: ContractSnapshot, products: Agreement2027Product[]): FlowBlock[][] {
 const kind = contract.template === 'commercial' ? 'commercial' : 'residential';
 const productCards = agreement2027ProductCards(products, capacity - 32);
 const bands = new Map(compact.bands.map(band => [band.id, band]));
 const blocks: FlowBlock[] = [];
 const includedClauses = new Set<number>();
 for (const id of compact.sequence[kind]) {
  const band = bands.get(id);
  if (!band) throw new Error('The contract source is missing a required section.');
  const clauses = band.clauseNumbers.filter(clause => !includedClauses.has(clause));
  for (const clause of clauses) includedClauses.add(clause);
  blocks.push({ id, height: band.height + compact.gap, keepWithNext: band.keepWithNext, band, clauses });
  if (id === compact.selectedSpecificationsAfter) {
   for (const [index, card] of productCards.entries()) blocks.push({ id: 'product-' + index, height: card.height + compact.gap, card, clauses: [] });
  }
 }
 return balancedAgreement2027Pages(blocks, capacity);
}

export function CompactAgreement2027Document({ contract, products, renderHeader, renderFields, renderCoverChecks }: {
 contract: ContractSnapshot;
 products: Agreement2027Product[];
 renderHeader: () => ReactNode;
 renderFields: (sourcePage: number, keys?: readonly string[], offsetY?: number) => ReactNode;
 renderCoverChecks: () => ReactNode;
}) {
 const agreement = contract.agreement2027!;
 const pages = contractFlow(contract, products);
 const imagePair = (asset: { file: string; screenFile: string }, band = false) => <>
  <img data-agreement-artwork="screen" className={(band ? styles.bandArtwork : styles.artwork) + ' ' + styles.screenArtwork} src={'/contracts/agreement-2027/' + asset.screenFile} alt="" aria-hidden="true" decoding="sync" />
  <img data-agreement-artwork="print" className={(band ? styles.bandArtwork : styles.artwork) + ' ' + styles.printArtwork} src={'/contracts/agreement-2027/' + asset.file} alt="" aria-hidden="true" decoding="sync" />
 </>;
 function fixedPage(sourcePage: 1 | 7, pageNumber: number) {
  const asset = layout.assets.find(item => item.page === sourcePage)!;
  return <section key={'fixed-' + sourcePage} data-agreement-page={pageNumber} data-agreement-template-page={sourcePage} data-agreement-page-kind={sourcePage === 1 ? 'handover' : 'annex'} data-agreement-section={sourcePage === 1 ? 'handover' : 'annex'} aria-label={'عقد اتفاق 2027 — الصفحة ' + pageNumber} className={styles.page}>
   {imagePair({ file: asset.file, screenFile: asset.screenFile })}
   <div className={styles.transcript}>{asset.sourceText}</div>
   {renderHeader()}{renderFields(sourcePage)}
   {sourcePage === 1 && renderCoverChecks()}
  </section>;
 }
 return <div lang="ar" dir="rtl" className={styles.document} data-agreement-version={agreement.version} data-agreement-layout="source-pdf-2027" data-agreement-pagination="compact" data-source-document={agreement.sourceDocument}>
  {fixedPage(1, 1)}
  {pages.map((blocks, index) => {
   const used = blocks.reduce((height, block) => height + block.height, 0);
   return <section key={'flow-' + index} data-agreement-page={index + 2} data-agreement-page-kind="flow" data-agreement-page-used={used} data-agreement-page-capacity={capacity} aria-label={'عقد اتفاق 2027 — الصفحة ' + (index + 2)} className={styles.page}>
    {imagePair(compact.stationery)}
    {renderHeader()}
    {blocks.map((block, blockIndex) => {
     const top = content[1] + blocks.slice(0, blockIndex).reduce((height, previous) => height + previous.height, 0);
     if (block.card) return <div key={block.id} className={styles.bandFields} data-agreement-band={block.id} data-agreement-band-kind="product" data-agreement-band-top={top} data-agreement-band-height={block.card.height}>
      <Agreement2027SelectedProducts page={{ sourcePage: 3, cards: [block.card] }} contentRect={[content[0], top, content[2], top + block.card.height]} />
     </div>;
     const band = block.band!;
     const rect = [content[0], top, content[2], top + band.height];
     return <div key={block.id} className={styles.bandFields} data-agreement-band-group={block.id}>
      <section data-agreement-band={band.id} data-agreement-band-kind={band.role} data-agreement-band-source-page={band.sourcePage} data-agreement-band-source-rect={band.rect.join(',')} data-agreement-band-top={top} data-agreement-band-height={band.height} data-agreement-section={band.role === 'payments' ? 'payments' : band.role === 'parties' ? 'parties' : band.role.startsWith('specification') ? 'specifications' : undefined} data-payment-schedule={band.role === 'payments' ? contract.template : undefined} className={styles.contentBand} style={position(rect)}>
       {imagePair(band, true)}
       <div className={styles.transcript}>{band.sourceText}</div>
       {!!block.clauses.length && <div className={styles.transcript} data-agreement-section="terms">{block.clauses.map(clause => <section key={clause} data-agreement-clause={clause}><h3>{contract.terms[clause - 1]?.title}</h3><p>{contract.terms[clause - 1]?.text}</p></section>)}</div>}
       {band.role === 'payments' && <div className={styles.transcript}>{agreement.paymentSchedule.map(stage => <p key={stage.id} data-payment-stage={stage.id}>{stage.label} {stage.percent}% {number(stage.amount)} د.ع {stage.trigger}</p>)}</div>}
      </section>
      <div className={styles.bandFields} data-agreement-band-fields={band.id}>{renderFields(band.sourcePage, band.fieldKeys, top - band.rect[1])}</div>
     </div>;
    })}
   </section>;
  })}
  {fixedPage(7, pages.length + 2)}
 </div>;
}
