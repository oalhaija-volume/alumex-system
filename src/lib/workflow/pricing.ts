import type { ProjectBranch, ProjectGovernorate } from '@/lib/intake/projectBranch';
import { catalogKind, compatibleAddon, compatibleGlass, isAvailable, isCurtainWall, isLouver, isRollerShutter, isShutterBox, normalizeCatalogItem } from './catalogRules';
export type CatalogItem = {id:string;name:string;category:string|null;unit:string;unit_price:number;is_active:boolean};
export type MeasuredOpening = {has_roller_shutter?:boolean;work_area?:"facade"|"internal"|null;facade_number?:number|null;has_arch?:boolean;id:string;floor:string|null;room:string|null;width:number;height:number;quantity?:number;opening_type:string|null;opening_direction:string|null};
export type ExtraChoice = {id:string;quantity:number;motorPrice?:number};
export type OpeningChoice = {openingId:string;systemId:string;systemRate?:number;glassId?:string;extras:ExtraChoice[]};
export type SurfaceMeasurement = {label:string;width:number;height:number;quantity:number};
export type AdditionalChoice = {id:string;quantity:number;measurements?:SurfaceMeasurement[];extras?:ExtraChoice[]};
export type Charge = {id:string;name:string;unit:string;rate:number;quantity:number;total:number;rateSource?:'quotation';motorFor?:string};
export type StandaloneCharge = Charge & {measurements?:SurfaceMeasurement[];extras?:Charge[]};
export type QuoteLine = {opening:MeasuredOpening;system:Charge;glass:Charge|null;extras:Charge[];area:number;total:number};
export type QuoteSnapshot = {facadeMeasurements?:MeasuredOpening[];branch?:ProjectBranch|null;governorate?:ProjectGovernorate|null;lines:QuoteLine[];additionalItems?:StandaloneCharge[];skylightsPricedSeparately?:boolean;version?:number;discount?:{percent:5;subtotal:number;amount:number};total:number;currency:"IQD";createdAt:string;preparedBy:string};
// Keep charge rates intact and deduct the discount once from the whole quotation.
// Reconstructing the subtotal also makes removal and repeated edits non-stacking.
export function applyQuotationDiscount(snapshot:QuoteSnapshot,discountPercent:unknown=0):QuoteSnapshot {
 if(discountPercent!==0&&discountPercent!==5)throw new Error('Choose either no discount or the 5% quotation discount.');
 const charges=[...snapshot.lines.flatMap(line=>[line.system,...(line.glass?[line.glass]:[]),...line.extras]),...(snapshot.additionalItems??[]).flatMap(item=>[item,...(item.extras??[])])];
 if(charges.some(charge=>!Number.isSafeInteger(charge.total)||charge.total<=0))throw new Error('Invalid quotation amount.');
 const subtotal=charges.reduce((sum,charge)=>sum+charge.total,0);
 if(!Number.isSafeInteger(subtotal)||subtotal<=0)throw new Error('Add a measured opening, facade service or standalone product before quoting.');
 const quotation=structuredClone(snapshot);
 delete quotation.discount;
 quotation.total=subtotal;
 if(discountPercent===5){
  const amount=Math.round(subtotal/20);
  quotation.discount={percent:5,subtotal,amount};
  quotation.total=subtotal-amount;
 }
 return quotation;
}
export const money = (n:number) => new Intl.NumberFormat('en-IQ',{maximumFractionDigits:0}).format(n)+' IQD';
export const QUOTATION_SYSTEM_RATE_MIN = 240_000;
export const QUOTATION_SYSTEM_RATE_MAX = 300_000;
type OpeningSellingDetails = Pick<MeasuredOpening,'opening_type'|'opening_direction'>;
export function quotationSystemRateMax(opening?:OpeningSellingDetails) {
 return opening?.opening_type==='Door'&&opening.opening_direction==='Hinged'?305_000:QUOTATION_SYSTEM_RATE_MAX;
}
export function isAlumexSqmSystem(product:Pick<CatalogItem,'name'|'unit'>|null|undefined) {
 return !!product&&product.unit==='sqm'&&/^alumex\b/i.test(product.name.trim());
}
export function isQuotationSystemRateEditable(product:CatalogItem|null|undefined) {
 return !!product&&isAvailable(product)&&catalogKind(product)==='system'&&isAlumexSqmSystem(product);
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
export function openingMinimumSellingRate(area:number,opening?:OpeningSellingDetails) {
 if(!Number.isFinite(area)||area<=0)throw new Error('Complete all opening measurements first.');
 if(opening?.opening_direction==='Hinged'){
  if(opening.opening_type==='Window')return 260_000;
  if(opening.opening_type==='Door')return 305_000;
 }
 if(area<=3)return 278_000;
 if(area<4)return 265_000;
 if(area<6)return 250_000;
 return 240_000;
}
export function openingSellingBand(area:number,rate:number,opening?:OpeningSellingDetails):ReturnType<typeof openingAreaBand> {
 if(!Number.isFinite(area)||area<=0||!Number.isFinite(rate)||rate<=0)return 'red';
 if(rate>=openingMinimumSellingRate(area,opening))return 'green';
 const band=openingAreaBand(area);
 return band==='green'?'red':band;
}
export function discountedSystemRate(rate:number,discountPercent:0|5=0) {
 // Selling targets use the unrounded net rate; whole-IQD rounding happens only
 // once when calculating the quotation's overall discount amount.
 return rate*(100-discountPercent)/100;
}
export function quotationSellingSuggestion(snapshot:QuoteSnapshot,rawCatalog:CatalogItem[]):{rate:number;openingCount:number;allGreen:boolean;canApply:boolean;billableArea:number;systemTotal:number;openingRates:{openingId:string;rate:number}[]}|null {
 const catalog=rawCatalog.map(normalizeCatalogItem);
 const discountPercent=snapshot.discount?.percent??0;
 let openingCount=0,billableArea=0,systemTotal=0,allGreen=true,canApply=true;
 const openingRates:{openingId:string;rate:number}[]=[];
 for(const line of snapshot.lines){
  if(!['Window','Door'].includes(line.opening.opening_type??'')||line.system.unit!=='sqm'||!isQuotationSystemRateEditable(catalog.find(product=>product.id===line.system.id)))continue;
  const area=measuredOpeningArea(line.opening);
  const minimum=openingMinimumSellingRate(area,line.opening);
  const requiredRate=Math.ceil(minimum*100/(100-discountPercent));
  // Saved system quantities include repetitions and the window billing minimum.
  // Average the actual charges, keeping each opening's own target selling rate.
  if(!Number.isFinite(line.system.quantity)||line.system.quantity<=0)return null;
  billableArea+=line.system.quantity;
  systemTotal+=Math.round(line.system.quantity*requiredRate);
  openingRates.push({openingId:line.opening.id,rate:requiredRate});
  openingCount+=line.opening.quantity??1;
  allGreen=allGreen&&openingSellingBand(area,discountedSystemRate(line.system.rate,discountPercent),line.opening)==='green';
  canApply=canApply&&requiredRate<=quotationSystemRateMax(line.opening);
 }
 return openingCount?{rate:systemTotal/billableArea,openingCount,allGreen,canApply,billableArea,systemTotal,openingRates}:null;
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
function quotationSystemCharge(charge:Charge,product:CatalogItem|undefined,rate:unknown,opening:MeasuredOpening):Charge {
 if(!isQuotationSystemRateEditable(product))throw new Error('Quotation-specific rates are available only for active Alumex systems priced per m².');
 const maximum=quotationSystemRateMax(opening);
 if(typeof rate!=='number'||!Number.isInteger(rate)||rate<QUOTATION_SYSTEM_RATE_MIN||rate>maximum)throw new Error(`Enter an Alumex system rate between 240,000 and ${maximum.toLocaleString('en-US')} IQD, using whole IQD.`);
 const total=Math.round(charge.quantity*rate);
 if(!Number.isSafeInteger(total)||total<=0)throw new Error(`Invalid amount for ${charge.name}.`);
 return {...charge,rate,total,rateSource:'quotation'};
}
export function isRollerShutterMotor<T extends Pick<Charge,'motorFor'>>(charge:T):charge is T & {motorFor:string} {
 return typeof charge.motorFor==='string'&&charge.motorFor.length>0;
}
function rollerShutterMotorCharge(shutterId:string,rate:unknown,quantity:number):Charge {
 if(typeof rate!=='number'||!Number.isSafeInteger(rate)||rate<=0)throw new Error('Enter a motor price greater than zero in whole IQD for each roller shutter.');
 const total=rate*quantity;
 if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>10000||!Number.isSafeInteger(total)||total<=0)throw new Error('Enter a motor price greater than zero in whole IQD for each roller shutter.');
 return {id:`roller-shutter-motor:${shutterId}`,name:'Roller shutter motor',unit:'item',rate,quantity,total,motorFor:shutterId};
}

// Price refresh uses the quantities already charged in the saved quotation.
// Reconstructing choices from openings could multiply repeated accessories a
// second time or change a facade's recorded area.
export function repriceQuotation(snapshot:QuoteSnapshot,rawCatalog:CatalogItem[],actor:string):QuoteSnapshot {
 const catalog=rawCatalog.map(normalizeCatalogItem);
 const quotation=structuredClone(snapshot);
 const refresh=<T extends Charge>(charge:T,opening?:MeasuredOpening):T=>{
  if(charge.motorFor!==undefined)throw new Error('Review the roller shutter motor in Edit quotation before updating prices.');
  const item=catalog.find(item=>item.id===charge.id&&isAvailable(item));
  if(item&&item.unit!==charge.unit)throw new Error('A catalog unit changed. Use Edit quotation to review the affected items before updating prices.');
  let current=catalogCharge(charge.id,charge.quantity,catalog);
  if(charge.rateSource!==undefined){
   if(!opening||charge.rateSource!=='quotation')throw new Error('Quotation-specific rates can only be applied to the opening system.');
   current=quotationSystemCharge(current,item,charge.rate,opening);
  }
  return {...charge,rate:current.rate,total:current.total};
 };
 quotation.lines=quotation.lines.map(line=>{
  const system=refresh(line.system,line.opening);
  const glass=line.glass?refresh(line.glass):null;
  const extras=line.extras.map(extra=>{
   if(extra.motorFor===undefined)return refresh(extra);
   const shutter=line.extras.find(item=>item.id===extra.motorFor&&item.motorFor===undefined&&isRollerShutter(item));
   if(!isRollerShutterMotor(extra)||!shutter||extra.id!==`roller-shutter-motor:${extra.motorFor}`||extra.unit!=='item'||extra.rateSource!==undefined||extra.quantity!==(line.opening.quantity??1)||line.extras.filter(item=>item.motorFor===extra.motorFor).length!==1)throw new Error('Review the roller shutter motor in Edit quotation before updating prices.');
   const motor=rollerShutterMotorCharge(extra.motorFor,extra.rate,extra.quantity);
   return {...extra,rate:motor.rate,total:motor.total};
  });
  return {...line,system,glass,extras,total:system.total+(glass?.total??0)+extras.reduce((sum,extra)=>sum+extra.total,0)};
 });
 if(quotation.additionalItems)quotation.additionalItems=quotation.additionalItems.map(item=>({
  ...refresh(item),...(item.extras?{extras:item.extras.map(extra=>refresh(extra))}:{}),
 }));
 quotation.total=quotation.lines.reduce((sum,line)=>sum+line.total,0)+(quotation.additionalItems??[]).reduce((sum,item)=>sum+item.total+(item.extras??[]).reduce((extraSum,extra)=>extraSum+extra.total,0),0);
 if(!Number.isSafeInteger(quotation.total)||quotation.total<=0)throw new Error('Add a measured opening, facade service or standalone product before quoting.');
 quotation.createdAt=new Date().toISOString();
 quotation.preparedBy=actor;
 return applyQuotationDiscount(quotation,snapshot.discount?.percent??0);
}

export function quotationPriceKey(snapshot:QuoteSnapshot) {
 const charge=(item:Charge)=>({id:item.id,unit:item.unit,rate:item.rate,quantity:item.quantity,...(item.rateSource?{rateSource:item.rateSource}:{}),...(item.motorFor!==undefined?{motorFor:item.motorFor}:{})});
 return JSON.stringify({
  lines:snapshot.lines.map(line=>({system:charge(line.system),glass:line.glass?charge(line.glass):null,extras:line.extras.map(charge)})),
  additionalItems:(snapshot.additionalItems??[]).map(item=>({...charge(item),extras:(item.extras??[]).map(charge)})),
  ...(snapshot.discount?{discount:snapshot.discount}:{}),
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
 return extras.flatMap((extra,index)=>{
  const product=products[index];
  if(!isRollerShutter(product)&&extra.motorPrice!==undefined)throw new Error('Motor prices can only be entered for roller shutter add-ons.');
  if(product.unit!=='sqm'&&(!Number.isFinite(extra.quantity)||extra.quantity<=0||(product.unit==='item'&&!Number.isInteger(extra.quantity))))throw new Error('Enter a valid quantity, area or length. Use whole numbers for items.');
  const charge=catalogCharge(extra.id,product.unit==='sqm'?area:extra.quantity*openingQuantity,catalog);
  return isRollerShutter(product)?[charge,rollerShutterMotorCharge(product.id,extra.motorPrice,openingQuantity)]:[charge];
 });
}
export function priceQuotation(openings:MeasuredOpening[],choices:OpeningChoice[],rawCatalog:CatalogItem[],actor:string,additionalItems:AdditionalChoice[]=[],discountPercent:unknown=0):QuoteSnapshot {
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
  const system=choice.systemRate===undefined?catalogSystem:quotationSystemCharge(catalogSystem,catalog.find(product=>product.id===choice.systemId),choice.systemRate,opening);
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
 return applyQuotationDiscount({lines,additionalItems:additional,...(openings.some(o=>o.opening_type==='Facade')?{facadeMeasurements:openings.filter(o=>o.opening_type==='Facade')}:{ }),...(openings.some(o=>o.opening_type==='Skylight')?{skylightsPricedSeparately:true}:{}),total,currency:'IQD',createdAt:new Date().toISOString(),preparedBy:actor},discountPercent);
}
