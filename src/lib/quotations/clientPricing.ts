import { isAlumexSqmSystem, type QuoteSnapshot } from '../workflow/pricing';

type ClientOpeningPrice = { openingId:string;systemAmount:number;openingTotal:number };
export type QuotationClientPricing = { rate:number;billableArea:number;systemTotal:number;openings:ClientOpeningPrice[] };

// Client presentation uses saved charges, independently of catalog updates or
// internal selling targets. The original quotation remains unchanged.
export function quotationClientPricing(quote:QuoteSnapshot):QuotationClientPricing|null {
 const eligible=quote.lines.filter(line=>['Window','Door'].includes(line.opening.opening_type??'')&&isAlumexSqmSystem(line.system));
 if(eligible.length<2)return null;
 if(eligible.some(line=>!Number.isFinite(line.system.quantity)||line.system.quantity<=0||!Number.isFinite(line.system.rate)||line.system.rate<=0||!Number.isSafeInteger(line.system.total)||line.system.total<=0||!Number.isSafeInteger(line.total)||line.total<line.system.total))return null;
 if(eligible.every(line=>line.system.rate===eligible[0].system.rate))return null;
 if(new Set(eligible.map(line=>line.opening.id)).size!==eligible.length)return null;
 const billableArea=eligible.reduce((sum,line)=>sum+line.system.quantity,0);
 const systemTotal=eligible.reduce((sum,line)=>sum+line.system.total,0);
 if(!Number.isFinite(billableArea)||billableArea<=0||!Number.isSafeInteger(systemTotal))return null;
 const rate=systemTotal/billableArea;
 if(!Number.isFinite(rate))return null;
 const shares=eligible.map((line,index)=>{
  const exact=systemTotal*(line.system.quantity/billableArea);
  const amount=Math.floor(exact);
  return {index,amount,remainder:exact-amount};
 });
 const remainder=systemTotal-shares.reduce((sum,share)=>sum+share.amount,0);
 if(!Number.isSafeInteger(remainder)||remainder<0||remainder>shares.length)return null;
 // Largest remainders receive one IQD each, with stable opening-order ties.
 const ranked=[...shares].sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
 for(let index=0;index<remainder;index++)ranked[index].amount+=1;
 const openings=eligible.map((line,index)=>({openingId:line.opening.id,systemAmount:shares[index].amount,openingTotal:line.total-line.system.total+shares[index].amount}));
 if(openings.some(line=>!Number.isSafeInteger(line.systemAmount)||!Number.isSafeInteger(line.openingTotal)))return null;
 return {rate,billableArea,systemTotal,openings};
}
