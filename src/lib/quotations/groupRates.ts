import { normalizeCatalogItem } from '@/lib/workflow/catalogRules';
import { isQuotationCurtainRateEditable, isQuotationSystemRateEditable, QUOTATION_SYSTEM_RATE_MIN, type AdditionalChoice, type CatalogItem, type MeasuredOpening, type OpeningChoice } from '@/lib/workflow/pricing';

export type QuotationRateGroupId='sliding'|'hinged'|'curtain-wall';
export type QuotationRateGroup={id:QuotationRateGroupId;openingIds:string[];additionalItemIds:string[];count:number;rate?:number;minimum:number};

export function quotationRateGroups(openings:MeasuredOpening[],choices:OpeningChoice[],additionalItems:AdditionalChoice[],catalog:CatalogItem[]):QuotationRateGroup[]{
 const products=new Map(catalog.map(product=>[product.id,normalizeCatalogItem(product)]));
 const selections=new Map(choices.map(choice=>[choice.openingId,choice]));
 const groups:QuotationRateGroup[]=['sliding','hinged','curtain-wall'].map(id=>({id:id as QuotationRateGroupId,openingIds:[],additionalItemIds:[],count:0,minimum:id==='curtain-wall'?1:QUOTATION_SYSTEM_RATE_MIN}));
 const rates=new Map<QuotationRateGroupId,number[]>();
 function add(group:QuotationRateGroup,rate:number){group.count++;const values=rates.get(group.id)??[];values.push(rate);rates.set(group.id,values);}
 for(const opening of openings){
  const choice=selections.get(opening.id),product=choice?products.get(choice.systemId):undefined;
  if(!choice||!product)continue;
  const group=opening.opening_type==='Window'&&isQuotationSystemRateEditable(product)
   ?opening.opening_direction==='Sliding'?groups[0]:opening.opening_direction==='Hinged'?groups[1]:undefined
   :opening.opening_type==='Curtain Wall'&&isQuotationCurtainRateEditable(product)?groups[2]:undefined;
  if(!group)continue;
  group.openingIds.push(opening.id);
  add(group,choice.systemRate===undefined?Number(product.unit_price):choice.systemRate);
 }
 for(const item of additionalItems){
  const product=products.get(item.id);
  if(!product||!isQuotationCurtainRateEditable(product))continue;
  groups[2].additionalItemIds.push(item.id);
  add(groups[2],item.unitRate===undefined?Number(product.unit_price):item.unitRate);
 }
 for(const group of groups){
  const values=rates.get(group.id);
  if(values?.length&&Number.isFinite(values[0])&&values[0]>0&&values.every(rate=>rate===values[0]))group.rate=values[0];
 }
 return groups;
}

export function applyQuotationGroupRate(groupId:QuotationRateGroupId,rate:number,openings:MeasuredOpening[],choices:OpeningChoice[],additionalItems:AdditionalChoice[],catalog:CatalogItem[]):{choices:OpeningChoice[];additionalItems:AdditionalChoice[]}{
 const group=quotationRateGroups(openings,choices,additionalItems,catalog).find(group=>group.id===groupId);
 if(!group)throw new Error('Choose a valid quotation rate group.');
 if(!Number.isSafeInteger(rate)||rate<group.minimum)throw new Error(groupId==='curtain-wall'?'Enter a Curtain Wall rate greater than zero, using whole IQD.':'Enter an Alumex system rate of at least 240,000 IQD, using whole IQD.');
 const openingIds=new Set(group.openingIds),additionalItemIds=new Set(group.additionalItemIds);
 return {
  choices:choices.map(choice=>openingIds.has(choice.openingId)?{...choice,systemRate:rate}:choice),
  additionalItems:additionalItems.map(item=>additionalItemIds.has(item.id)?{...item,unitRate:rate}:item),
 };
}
