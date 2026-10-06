export type CatalogItem = {id:string;name:string;category:string|null;unit:string;unit_price:number;is_active:boolean};
export type MeasuredOpening = {id:string;floor:string|null;room:string|null;width:number;height:number;opening_type:string|null;opening_direction:string|null};
export type OpeningChoice = {openingId:string;systemId:string;glassId?:string;extras:{id:string;quantity:number}[]};
export type Charge = {id:string;name:string;unit:string;rate:number;quantity:number;total:number};
export type QuoteLine = {opening:MeasuredOpening;system:Charge;glass:Charge|null;extras:Charge[];area:number;total:number};
export type QuoteSnapshot = {lines:QuoteLine[];total:number;currency:"IQD";createdAt:string;preparedBy:string};
export const money = (n:number) => new Intl.NumberFormat('en-IQ',{maximumFractionDigits:0}).format(n)+' IQD';
export function defaultSystem(opening:MeasuredOpening,catalog:CatalogItem[]) {
 const name=['Window','Door'].includes(opening.opening_type??'')?'Alumex System':opening.opening_type;
 // Prefer an explicitly configured movement-specific Alumex rate when present.
 return catalog.find(p=>p.is_active && p.name.toLowerCase()===`alumex ${opening.opening_direction} ${opening.opening_type}`.toLowerCase()) ?? catalog.find(p=>p.is_active && p.name===name);
}
export function systemOptions(opening:MeasuredOpening,catalog:CatalogItem[]) {
 return catalog.filter(p=>p.is_active && (['Window','Door'].includes(opening.opening_type??'') ? p.category==='aluminum_system' : p.name===opening.opening_type));
}
export function priceQuotation(openings:MeasuredOpening[],choices:OpeningChoice[],catalog:CatalogItem[],actor:string):QuoteSnapshot {
 if(!openings.length || choices.length!==openings.length || new Set(choices.map(c=>c.openingId)).size!==openings.length) throw new Error('Choose a system for every opening.');
 const lines=openings.map(opening=>{
  if(!opening.floor || !opening.room || !Number.isFinite(Number(opening.width)) || !Number.isFinite(Number(opening.height)) || opening.width<=0 || opening.height<=0)throw new Error('Complete all opening measurements first.');
  const choice=choices.find(c=>c.openingId===opening.id);
  if(!choice || !Array.isArray(choice.extras))throw new Error('Invalid opening selections.');
  const area=Number(opening.width)*Number(opening.height)/10000;
  function charge(id:string,quantity=1):Charge {
   const item=catalog.find(p=>p.id===id && p.is_active);
   if(!item || !Number.isFinite(Number(item.unit_price)) || Number(item.unit_price)<=0)throw new Error(`Set a catalog price for ${item?.name ?? 'the selected product'} before quoting.`);
   if(!['sqm','item','meter','project'].includes(item.unit))throw new Error(`Unsupported unit for ${item.name}.`);
   const amount=item.unit==='sqm'?area:quantity;
   if(!Number.isFinite(amount) || amount<=0 || amount>1000000)throw new Error('Enter a valid add-on quantity or length.');
   return {id:item.id,name:item.name,unit:item.unit,rate:Number(item.unit_price),quantity:amount,total:Math.round(amount*Number(item.unit_price))};
  }
  if(!systemOptions(opening,catalog).some(p=>p.id===choice.systemId))throw new Error('Choose a compatible system for this structural type.');
  const system=charge(choice.systemId);
  if(choice.glassId && !catalog.some(p=>p.id===choice.glassId && /glass/i.test(p.name)))throw new Error('Choose a glass product.');
  const glass=choice.glassId?charge(choice.glassId):null;
  if(choice.extras.length>30 || new Set(choice.extras.map(e=>e.id)).size!==choice.extras.length)throw new Error('Each add-on can be selected once per opening.');
  const extras=choice.extras.map(extra=>{
   if(extra.id===choice.systemId || extra.id===choice.glassId || !catalog.some(p=>p.id===extra.id && (p.category==='addon'||p.category==='service')))throw new Error('Invalid add-on.');
   return charge(extra.id,extra.quantity);
  });
  return {opening,area,system,glass,extras,total:system.total+(glass?.total??0)+extras.reduce((s,p)=>s+p.total,0)};
 });
 const total=lines.reduce((sum,line)=>sum+line.total,0);
 if(!Number.isSafeInteger(total)||total<=0)throw new Error('Invalid quotation total.');
 return {lines,total,currency:'IQD',createdAt:new Date().toISOString(),preparedBy:actor};
}
