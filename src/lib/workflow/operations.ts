import type { QuoteSnapshot } from './pricing';
// Construct an explicit allowlist. Never spread a commercial snapshot into a manager response.
export function operationalSpecifications(quotation:QuoteSnapshot){
 return quotation.lines.map(line=>({
  openingId:line.opening.id,
  system:line.system.name,
  glass:line.glass?.name??'Standard glass',
  extras:line.extras.map(extra=>({name:extra.name,quantity:extra.quantity,unit:extra.unit})),
 }));
}
