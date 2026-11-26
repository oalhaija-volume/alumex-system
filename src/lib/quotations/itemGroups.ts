import type { QuoteLine, QuoteSnapshot, StandaloneCharge } from '../workflow/pricing';

export type QuotationItemGroup = {
 key:string;
 label:string;
 lines:QuoteLine[];
 additionalItems:StandaloneCharge[];
 subtotal:number;
 area:number;
 displayArea:number;
 billableArea:number;
 openingCount:number;
};

const groupOrder = ['sliding','hinged','curtain wall','louver'];
const normalize = (value:string) => value.trim().toLowerCase().replace(/[&-]/g,' ').replace(/\s+/g,' ');

export function quotationOpeningDisplayArea(line:QuoteLine):number {
 // Saved sqm quantities already include repetitions and the minimum used for pricing.
 return line.system.unit==='sqm'&&(line.opening.opening_type==='Louver'||productGroup(line.system.name)==='Louver')
  ?line.system.quantity:line.area;
}

function productGroup(name:string):string {
 const key=normalize(name);
 if(['louver','louvers','louvres'].includes(key))return 'Louver';
 if(['curtain wall','curtain wall arch','curtain wall pushout'].includes(key))return 'Curtain Wall';
 if(['lift slide','lift and slide'].includes(key))return 'Sliding';
 if(key==='sliding')return 'Sliding';
 if(key==='hinged')return 'Hinged';
 return name.trim()||'Other items';
}

function openingGroup(line:QuoteLine):string {
 const type=normalize(line.opening.opening_type??'');
 const product=productGroup(line.system.name);
 // Structural products take precedence: louvers are saved as hinged openings.
 if(type==='curtain wall'||product==='Curtain Wall')return 'Curtain Wall';
 if(type==='louver'||product==='Louver')return 'Louver';
 if(product==='Sliding')return 'Sliding';
 if(['window','door'].includes(type)){
  const direction=normalize(line.opening.opening_direction??'');
  if(direction==='sliding')return 'Sliding';
  if(direction==='hinged')return 'Hinged';
  if(/\bsliding\b/i.test(line.system.name))return 'Sliding';
  if(/\bhinged\b/i.test(line.system.name))return 'Hinged';
 }
 return line.opening.opening_type?.trim()||product;
}

// Group saved amounts for display only; preserve the quotation and its discount.
export function quotationItemGroups(quote:Pick<QuoteSnapshot,'lines'|'additionalItems'>):QuotationItemGroup[] {
 const groups=new Map<string,QuotationItemGroup>();
 function groupFor(label:string){
  const key=normalize(label);
  let group=groups.get(key);
  if(!group){
   group={key,label,lines:[],additionalItems:[],subtotal:0,area:0,displayArea:0,billableArea:0,openingCount:0};
   groups.set(key,group);
  }
  return group;
 }
 for(const line of quote.lines){
  const group=groupFor(openingGroup(line));
  group.lines.push(line);
  group.subtotal+=line.total;
  // Saved line area already includes repeated openings and excludes billing minima.
  group.area+=line.area;
  group.displayArea+=quotationOpeningDisplayArea(line);
  // The saved system quantity includes any billing minimum and repetitions.
  // Glass and accessories share that area; counting them would duplicate it.
  if(line.system.unit==='sqm')group.billableArea+=line.system.quantity;
  group.openingCount+=line.opening.quantity??1;
 }
 for(const item of quote.additionalItems??[]){
  const group=groupFor(productGroup(item.name));
  group.additionalItems.push(item);
  group.subtotal+=item.total+(item.extras??[]).reduce((sum,extra)=>sum+extra.total,0);
  // Services have area, but no physical opening count; accessories add neither.
  if(item.unit==='sqm'&&!item.projectAddon){group.area+=item.quantity;group.displayArea+=item.quantity;group.billableArea+=item.quantity;}
 }
 return [...groups.values()].sort((a,b)=>{
  const aIndex=groupOrder.indexOf(a.key),bIndex=groupOrder.indexOf(b.key);
  return (aIndex<0?groupOrder.length:aIndex)-(bIndex<0?groupOrder.length:bIndex)||a.label.localeCompare(b.label,'en');
 });
}
