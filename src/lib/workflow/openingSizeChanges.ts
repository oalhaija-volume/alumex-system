import { applyQuotationDiscount, isCurtainWallArchCharge, isRollerShutterMotor, priceQuotation, type AdditionalChoice, type CatalogItem, type Charge, type MeasuredOpening, type OpeningChoice, type QuoteSnapshot, type QuotationPricingPolicy } from './pricing';

export type OpeningSizeChange = {
 openingId:string;
 previousWidth:number;
 previousHeight:number;
 previousQuantity:number;
 width:number;
 height:number;
 quantity:number;
 reason:string;
 splitOpeningId?:string;
};

export type OpeningSizeHistory = {
 id:string;project_id:string;opening_id:string;source_opening_id:string;
 previous_width:number;previous_height:number;previous_quantity:number;
 width:number;height:number;quantity:number;reason:string;
 changed_by:string;changed_by_name?:string;changed_at:string;quotation_version:number;
};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dimension=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0.01&&value<=100000&&Number(value.toFixed(2))===value;
const conflict='This opening changed on another device. Reload the quotation before editing its size.';

export function normalizeOpeningSizeChanges(openings:MeasuredOpening[],input:unknown=[]):OpeningSizeChange[] {
 if(!Array.isArray(input)||input.length>100)throw new Error('Edit up to 100 opening sizes per revision.');
 const sources=new Set<string>();
 const ids=new Set(openings.map(opening=>opening.id.toLowerCase()));
 return input.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid opening size change.');
  const change=value as Record<string,unknown>;
  const opening=openings.find(opening=>opening.id===change.openingId);
  if(!opening||!['Window','Door','Louver','Curtain Wall'].includes(opening.opening_type??''))throw new Error('Choose a measured opening to edit its size.');
  if(sources.has(opening.id))throw new Error('Edit each opening size once per revision.');
  sources.add(opening.id);
  const previousQuantity=opening.quantity??1;
  if(change.previousWidth!==opening.width||change.previousHeight!==opening.height||change.previousQuantity!==previousQuantity)throw new Error(conflict);
  if(!dimension(change.width)||!dimension(change.height))throw new Error('Enter width and height between 0.01 and 100,000 cm, using up to two decimal places.');
  if(change.width===opening.width&&change.height===opening.height)throw new Error('Change the width or height before applying the size edit.');
  if(typeof change.quantity!=='number'||!Number.isInteger(change.quantity)||change.quantity<1||change.quantity>previousQuantity)throw new Error('Choose how many identical openings need the new size.');
  if(typeof change.reason!=='string'||!change.reason.trim()||change.reason.trim().length>500)throw new Error('Enter a reason for the size change, up to 500 characters.');
  const partial=change.quantity<previousQuantity;
  let splitOpeningId:string|undefined;
  if(partial){
   if(typeof change.splitOpeningId!=='string'||!uuid.test(change.splitOpeningId)||ids.has(change.splitOpeningId.toLowerCase()))throw new Error('Use a separate opening entry for the resized openings. Reload and try again.');
   splitOpeningId=change.splitOpeningId.toLowerCase();
   ids.add(splitOpeningId);
  }else if(change.splitOpeningId!==undefined)throw new Error('A separate opening entry is only needed when resizing some identical openings.');
  return {openingId:opening.id,previousWidth:opening.width,previousHeight:opening.height,previousQuantity,width:change.width,height:change.height,quantity:change.quantity,reason:change.reason.trim(),...(splitOpeningId?{splitOpeningId}:{})};
 });
}

// Apply against the original server measurements, so repeated edits and undo
// never progressively shrink the source quantity or lose recorded attributes.
export function applyOpeningSizeChanges(openings:MeasuredOpening[],changes:OpeningSizeChange[]):MeasuredOpening[] {
 const normalized=normalizeOpeningSizeChanges(openings,changes);
 const byId=new Map(normalized.map(change=>[change.openingId,change]));
 return openings.flatMap(opening=>{
  const change=byId.get(opening.id);
  if(!change)return [{...opening}];
  if(change.splitOpeningId)return [
   {...opening,quantity:change.previousQuantity-change.quantity},
   {...opening,id:change.splitOpeningId,width:change.width,height:change.height,quantity:change.quantity},
  ];
  return [{...opening,width:change.width,height:change.height}];
 });
}

// A size correction changes charge quantities. Keep saved rates for the same
// selected products; explicit system and motor price edits still take effect.
export function priceQuotationWithSizeChanges(openings:MeasuredOpening[],choices:OpeningChoice[],catalog:CatalogItem[],actor:string,additionalItems:AdditionalChoice[]=[],discountPercent:unknown=0,savedSnapshot?:QuoteSnapshot,changes:OpeningSizeChange[]=[],pricingPolicy:QuotationPricingPolicy|undefined=savedSnapshot?.pricingPolicy):QuoteSnapshot {
 const quotation=priceQuotation(openings,choices,catalog,actor,additionalItems,discountPercent,pricingPolicy);
 if(!savedSnapshot||!changes.length)return quotation;
 const affected=new Map(changes.flatMap(change=>[[change.openingId,change.openingId],...(change.splitOpeningId?[[change.splitOpeningId,change.openingId]]:[])] as [string,string][]));
 for(const line of quotation.lines){
  const source=affected.get(line.opening.id);
  const saved=savedSnapshot.lines.find(previous=>previous.opening.id===source);
  const choice=choices.find(choice=>choice.openingId===line.opening.id);
  if(!saved||!choice)continue;
  const keepRate=(charge:Charge,previous:Charge|undefined,explicit=false):Charge=>{
   if(!previous||explicit||previous.id!==charge.id||previous.unit!==charge.unit||isCurtainWallArchCharge(charge)||isRollerShutterMotor(charge))return charge;
   if(!Number.isFinite(previous.rate)||previous.rate<=0)throw new Error('Review the saved opening prices before changing its size.');
   const total=Math.round(previous.rate*charge.quantity);
   if(!Number.isSafeInteger(total)||total<=0)throw new Error('Invalid quotation amount.');
   const retained={...charge,rate:previous.rate,total};
   if(previous.rateSource)retained.rateSource=previous.rateSource;
   return retained;
  };
  line.system=keepRate(line.system,saved.system,choice.systemRate!==undefined);
  if(line.glass)line.glass=keepRate(line.glass,saved.glass??undefined);
  line.extras=line.extras.map(extra=>keepRate(extra,saved.extras.find(previous=>previous.id===extra.id)));
  line.total=line.system.total+(line.glass?.total??0)+line.extras.reduce((total,charge)=>total+charge.total,0);
 }
 return applyQuotationDiscount(quotation,discountPercent);
}
