import type { ProjectBranch, ProjectGovernorate } from '@/lib/intake/projectBranch';
import { catalogKind, compatibleAddon, compatibleGlass, isAvailable, isCurtainWall, isLouver, isRollerShutter, isShutterBox, normalizeCatalogItem } from './catalogRules';
export type CatalogItem = {id:string;name:string;category:string|null;unit:string;unit_price:number;is_active:boolean};
export type MeasuredOpening = {has_roller_shutter?:boolean;work_area?:"facade"|"internal"|null;facade_number?:number|null;has_arch?:boolean;id:string;floor:string|null;room:string|null;width:number;height:number;quantity?:number;opening_type:string|null;opening_direction:string|null};
export type ExtraChoice = {id:string;quantity:number};
export type OpeningChoice = {openingId:string;systemId:string;systemRate?:number;glassId?:string;extras:ExtraChoice[]};
export type SurfaceMeasurement = {label:string;width:number;height:number;quantity:number};
export type AdditionalChoice = {id:string;quantity:number;measurements?:SurfaceMeasurement[];extras?:ExtraChoice[]};
export type Charge = {id:string;name:string;unit:string;rate:number;quantity:number;total:number;rateSource?:'quotation'};
export type StandaloneCharge = Charge & {measurements?:SurfaceMeasurement[];extras?:Charge[]};
export type QuoteLine = {opening:MeasuredOpening;system:Charge;glass:Charge|null;extras:Charge[];area:number;total:number};
export type QuoteSnapshot = {facadeMeasurements?:MeasuredOpening[];branch?:ProjectBranch|null;governorate?:ProjectGovernorate|null;lines:QuoteLine[];additionalItems?:StandaloneCharge[];skylightsPricedSeparately?:boolean;version?:number;total:number;currency:"IQD";createdAt:string;preparedBy:string};
export const money = (n:number) => new Intl.NumberFormat('en-IQ',{maximumFractionDigits:0}).format(n)+' IQD';
export const QUOTATION_SYSTEM_RATE_MIN = 240_000;
export const QUOTATION_SYSTEM_RATE_MAX = 300_000;
export function isQuotationSystemRateEditable(product:CatalogItem|null|undefined) {
 return !!product&&isAvailable(product)&&product.unit==='sqm'&&catalogKind(product)==='system'&&/^alumex\b/i.test(product.name.trim());
}
export function measuredOpeningArea(opening:Pick<MeasuredOpening,'width'|'height'>) {
 return Number(opening.width)*Number(opening.height)/10000;
}
export function billableOpeningArea(opening:Pick<MeasuredOpening,'width'|'height'|'opening_type'>) {
 const area=measuredOpeningArea(opening);
 return opening.opening_type==='Window'?Math.max(area,1):area;
}
export function openingAreaBand(area:number):'red'|'orange'|'yellow'|'green' {
 if(area<=3)return 'red';
 if(area<4)return 'orange';
 if(area<6)return 'yellow';
 return 'green';
}
export function quotableOpenings(openings:MeasuredOpening[]) { return openings.filter(opening=>opening.opening_type!=='Skylight'&&opening.opening_type!=='Facade'); }
export function recordedFacadeAreas(openings:MeasuredOpening[]):SurfaceMeasurement[] {
 return openings.filter(o=>o.opening_type==='Facade').map(o=>({label:`Facade ${o.facade_number}`,width:o.width/100,height:o.height/100,quantity:1}));
}
export function defaultSystem(opening:MeasuredOpening,catalog:CatalogItem[]) {
 const options=systemOptions(opening,catalog);
 const name=['Window','Door'].includes(opening.opening_type??'')?'Alumex System':opening.opening_type;
 return options.find(p=>p.name.toLowerCase()===`alumex ${opening.opening_direction} ${opening.opening_type}`.toLowerCase()) ?? options.find(p=>p.name===name);
}
export function systemOptions(opening:MeasuredOpening,catalog:CatalogItem[]) {
 return catalog.filter(p=>{
  if(!isAvailable(p))return false;
  const kind=catalogKind(p);
  if(['Window','Door'].includes(opening.opening_type??''))return kind==='system'||kind==='opening'||opening.opening_type==='Door'&&kind==='standalone'&&/door/i.test(p.name);
  if(opening.opening_type==='Curtain Wall')return isCurtainWall(p);
  if(opening.opening_type==='Louver')return isLouver(p);
  return false;
 });
}
export function glassOptions(opening:MeasuredOpening,catalog:CatalogItem[],systemId?:string) { return catalog.filter(p=>compatibleGlass(p,opening.opening_type,catalog.find(s=>s.id===systemId))); }
export function addonOptions(opening:MeasuredOpening,catalog:CatalogItem[],systemId?:string) { return catalog.filter(p=>compatibleAddon(p,opening.opening_type,catalog.find(s=>s.id===systemId))); }
export function additionalOptions(catalog:CatalogItem[]) { return catalog.filter(p=>isAvailable(p)&&['facade','standalone'].includes(catalogKind(p))); }
export function facadeAddonOptions(product:CatalogItem,catalog:CatalogItem[]) { return catalog.filter(p=>compatibleAddon(p,null,product)); }
function catalogCharge(id:string,quantity:number,catalog:CatalogItem[]):Charge {
 const item=catalog.find(p=>p.id===id && isAvailable(p));
 if(!item || !Number.isFinite(Number(item.unit_price)) || Number(item.unit_price)<=0)throw new Error(`Set a catalog price for ${item?.name ?? 'the selected product'} before quoting.`);
 if(!['sqm','item','meter','project'].includes(item.unit))throw new Error(`Unsupported unit for ${item.name}.`);
 if(!Number.isFinite(quantity) || quantity<=0 || quantity>1000000 || item.unit==='item'&&!Number.isInteger(quantity))throw new Error('Enter a valid quantity, area or length. Use whole numbers for items.');
 const total=Math.round(quantity*Number(item.unit_price));
 if(!Number.isSafeInteger(total)||total<=0)throw new Error(`Invalid amount for ${item.name}.`);
 return {id:item.id,name:item.name,unit:item.unit,rate:Number(item.unit_price),quantity,total};
}
function quotationSystemCharge(charge:Charge,product:CatalogItem|undefined,rate:unknown):Charge {
 if(!isQuotationSystemRateEditable(product))throw new Error('Quotation-specific rates are available only for active Alumex systems priced per m².');
 if(typeof rate!=='number'||!Number.isInteger(rate)||rate<QUOTATION_SYSTEM_RATE_MIN||rate>QUOTATION_SYSTEM_RATE_MAX)throw new Error('Enter an Alumex system rate between 240,000 and 300,000 IQD, using whole IQD.');
 const total=Math.round(charge.quantity*rate);
 if(!Number.isSafeInteger(total)||total<=0)throw new Error(`Invalid amount for ${charge.name}.`);
 return {...charge,rate,total,rateSource:'quotation'};
}

// Price refresh uses the quantities already charged in the saved quotation.
// Reconstructing choices from openings could multiply repeated accessories a
// second time or change a facade's recorded area.
export function repriceQuotation(snapshot:QuoteSnapshot,rawCatalog:CatalogItem[],actor:string):QuoteSnapshot {
 const catalog=rawCatalog.map(normalizeCatalogItem);
 const quotation=structuredClone(snapshot);
 const refresh=<T extends Charge>(charge:T,system=false):T=>{
  const item=catalog.find(item=>item.id===charge.id&&isAvailable(item));
  if(item&&item.unit!==charge.unit)throw new Error('A catalog unit changed. Use Edit quotation to review the affected items before updating prices.');
  let current=catalogCharge(charge.id,charge.quantity,catalog);
  if(charge.rateSource!==undefined){
   if(!system||charge.rateSource!=='quotation')throw new Error('Quotation-specific rates can only be applied to the opening system.');
   current=quotationSystemCharge(current,item,charge.rate);
  }
  return {...charge,rate:current.rate,total:current.total};
 };
 quotation.lines=quotation.lines.map(line=>{
  const system=refresh(line.system,true);
  const glass=line.glass?refresh(line.glass):null;
  const extras=line.extras.map(extra=>refresh(extra));
  return {...line,system,glass,extras,total:system.total+(glass?.total??0)+extras.reduce((sum,extra)=>sum+extra.total,0)};
 });
 if(quotation.additionalItems)quotation.additionalItems=quotation.additionalItems.map(item=>({
  ...refresh(item),...(item.extras?{extras:item.extras.map(extra=>refresh(extra))}:{}),
 }));
 quotation.total=quotation.lines.reduce((sum,line)=>sum+line.total,0)+(quotation.additionalItems??[]).reduce((sum,item)=>sum+item.total+(item.extras??[]).reduce((extraSum,extra)=>extraSum+extra.total,0),0);
 if(!Number.isSafeInteger(quotation.total)||quotation.total<=0)throw new Error('Add a measured opening, facade service or standalone product before quoting.');
 quotation.createdAt=new Date().toISOString();
 quotation.preparedBy=actor;
 return quotation;
}

export function quotationPriceKey(snapshot:QuoteSnapshot) {
 const charge=(item:Charge)=>({id:item.id,unit:item.unit,rate:item.rate,quantity:item.quantity,...(item.rateSource?{rateSource:item.rateSource}:{})});
 return JSON.stringify({
  lines:snapshot.lines.map(line=>({system:charge(line.system),glass:line.glass?charge(line.glass):null,extras:line.extras.map(charge)})),
  additionalItems:(snapshot.additionalItems??[]).map(item=>({...charge(item),extras:(item.extras??[]).map(charge)})),
 });
}

export function measuredFacadeArea(measurements:SurfaceMeasurement[]) {
 if(!Array.isArray(measurements)||!measurements.length||measurements.length>100)throw new Error('Enter the measured areas for this facade service.');
 let area=0;
 for(const surface of measurements){
  if(!surface||typeof surface.label!=='string'||!surface.label.trim()||surface.label.length>100||!Number.isFinite(surface.width)||surface.width<=0||surface.width>1000||!Number.isFinite(surface.height)||surface.height<=0||surface.height>1000||!Number.isInteger(surface.quantity)||surface.quantity<1||surface.quantity>10000)throw new Error('Enter a name, width, height and whole-number quantity for each facade area.');
  area+=surface.width*surface.height*surface.quantity;
 }
 if(area>1000000)throw new Error('Facade area exceeds the supported limit.');
 return Math.round(area*1000000)/1000000;
}
function priceExtras(extras:ExtraChoice[],allowed:CatalogItem[],catalog:CatalogItem[],area:number,excludedIds:string[]=[],openingQuantity=1){
 if(!Array.isArray(extras)||extras.length>30||extras.some(e=>!e||typeof e.id!=='string')||new Set(extras.map(e=>e.id)).size!==extras.length)throw new Error('Each add-on can be selected once per opening or facade service.');
 const products=extras.map(extra=>{
  const product=allowed.find(p=>p.id===extra.id);
  if(!product||excludedIds.includes(extra.id))throw new Error('Choose an add-on compatible with this opening or facade service.');
  return product;
 });
 if(products.some(isShutterBox)&&!products.some(isRollerShutter))throw new Error('A shutter box requires roller shutters on the same opening.');
 if(products.filter(isRollerShutter).length>1)throw new Error('Choose one roller shutter type per opening.');
 return extras.map((extra,index)=>{
  if(products[index].unit!=='sqm'&&(!Number.isFinite(extra.quantity)||extra.quantity<=0||(products[index].unit==='item'&&!Number.isInteger(extra.quantity))))throw new Error('Enter a valid quantity, area or length. Use whole numbers for items.');
  return catalogCharge(extra.id,products[index].unit==='sqm'?area:extra.quantity*openingQuantity,catalog);
 });
}
export function priceQuotation(openings:MeasuredOpening[],choices:OpeningChoice[],rawCatalog:CatalogItem[],actor:string,additionalItems:AdditionalChoice[]=[]):QuoteSnapshot {
 const catalog=rawCatalog.map(normalizeCatalogItem);
 const measured=quotableOpenings(openings);
 if(!Array.isArray(choices)||choices.some(c=>!c)||choices.length!==measured.length||new Set(choices.map(c=>c.openingId)).size!==measured.length)throw new Error('Choose a system for every opening. Skylights are priced in the calculator.');
 const lines=measured.map(opening=>{
  const quantity=opening.quantity===undefined?1:opening.quantity;
  if(!Number.isInteger(quantity)||quantity<1||quantity>10000)throw new Error("Enter a whole-number opening quantity between 1 and 10,000.");
  if(!opening.floor || !opening.room || !Number.isFinite(Number(opening.width)) || !Number.isFinite(Number(opening.height)) || opening.width<=0 || opening.height<=0)throw new Error('Complete all opening measurements first.');
  const choice=choices.find(c=>c.openingId===opening.id);
  if(!choice || !Array.isArray(choice.extras))throw new Error('Invalid opening selections.');
  const area=measuredOpeningArea(opening)*quantity;
  // Apply the window minimum to each physical opening before repetitions.
  // Keep measured area in the snapshot for dimensions and operational use.
  const billableArea=billableOpeningArea(opening)*quantity;
  const charge=(id:string)=>catalogCharge(id,catalog.find(p=>p.id===id)?.unit==='sqm'?billableArea:quantity,catalog);
  if(!systemOptions(opening,catalog).some(p=>p.id===choice.systemId))throw new Error('Choose a compatible system for this structural type.');
  const catalogSystem=charge(choice.systemId);
  const system=choice.systemRate===undefined?catalogSystem:quotationSystemCharge(catalogSystem,catalog.find(product=>product.id===choice.systemId),choice.systemRate);
  if(choice.glassId&&!glassOptions(opening,catalog,choice.systemId).some(p=>p.id===choice.glassId))throw new Error('Choose a compatible glass option.');
  const glass=choice.glassId?charge(choice.glassId):null;
  const extras=priceExtras(choice.extras,addonOptions(opening,catalog,choice.systemId),catalog,billableArea,[choice.systemId,choice.glassId??''],quantity);
  if(opening.has_roller_shutter&&!extras.some(isRollerShutter))throw new Error('This window requires roller shutters. Choose a roller shutter add-on.');
  return {opening,area,system,glass,extras,total:system.total+(glass?.total??0)+extras.reduce((s,p)=>s+p.total,0)};
 });
 if(!Array.isArray(additionalItems)||additionalItems.length>100||additionalItems.some(item=>!item)||new Set(additionalItems.map(item=>item.id)).size!==additionalItems.length)throw new Error('Select each standalone product or service once and enter its measurements or quantity.');
 const additional=additionalItems.map((item:AdditionalChoice)=>{
  const product=additionalOptions(catalog).find(p=>p.id===item.id);
  if(!product)throw new Error('Choose an active standalone product or facade service from the catalog.');
  const facade=catalogKind(product)==='facade';
  const quantity=facade?measuredFacadeArea(item.measurements??[]):item.quantity;
  const base=catalogCharge(item.id,quantity,catalog);
  const extras=priceExtras(item.extras??[],facadeAddonOptions(product,catalog),catalog,quantity);
  return {...base,...(facade?{measurements:item.measurements!.map(s=>({label:s.label.trim(),width:s.width,height:s.height,quantity:s.quantity}))}:{}),...(extras.length?{extras}:{} )};
 });
 const total=lines.reduce((sum,line)=>sum+line.total,0)+additional.reduce((sum,item)=>sum+item.total+(item.extras?.reduce((s,e)=>s+e.total,0)??0),0);
 if(!Number.isSafeInteger(total)||total<=0)throw new Error('Add a measured opening, facade service or standalone product before quoting.');
 return {lines,additionalItems:additional,...(openings.some(o=>o.opening_type==='Facade')?{facadeMeasurements:openings.filter(o=>o.opening_type==='Facade')}:{ }),...(openings.some(o=>o.opening_type==='Skylight')?{skylightsPricedSeparately:true}:{}),total,currency:'IQD',createdAt:new Date().toISOString(),preparedBy:actor};
}
