import {
  applyQuotationDiscount,
  isQuotationCurtainRateEditable,
  isQuotationSystemRateEditable,
  QUOTATION_DISCOUNTS_ENABLED,
  QUOTATION_SYSTEM_RATE_MIN,
  quotationCurtainMinimumRate,
  type CatalogItem,
  type Charge,
  type QuoteSnapshot,
} from '@/lib/workflow/pricing';
import { normalizeCatalogItem } from '@/lib/workflow/catalogRules';

function ratesById(input: unknown, expectedIds: string[], key: 'openingId' | 'id') {
  if (!Array.isArray(input) || input.length !== expectedIds.length) {
    throw new Error('Reload the quotation before editing its prices.');
  }
  const expected = new Set(expectedIds);
  const rates = new Map<string, number>();
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid quotation prices.');
    const row = value as Record<string, unknown>;
    const id = row[key];
    const rate = row.rate;
    if (typeof id !== 'string' || !expected.has(id) || rates.has(id)
      || typeof rate !== 'number' || !Number.isSafeInteger(rate) || rate <= 0) {
      throw new Error('Enter valid prices in whole IQD for the saved quotation items.');
    }
    rates.set(id, rate);
  }
  return rates;
}

// A shared employee edits prices on the saved specification. No request field
// can replace a product, measurement, quantity, policy, branch or attribution.
export function reviseSharedQuotationPrices(
  snapshot: QuoteSnapshot,
  input: { systemRates?: unknown; additionalRates?: unknown },
  rawCatalog: CatalogItem[],
  actorId: string,
): QuoteSnapshot {
  const systemRates = ratesById(input.systemRates, snapshot.lines.map(line => line.opening.id), 'openingId');
  const additionalRates = ratesById(input.additionalRates, (snapshot.additionalItems ?? []).map(item => item.id), 'id');
  const catalog = rawCatalog.map(normalizeCatalogItem);
  const quotation = structuredClone(snapshot);
  let changed = false;
  function revise<T extends Charge>(charge: T, rate: number, standalone: boolean, openingType?: string | null): T {
    if (rate === charge.rate) return charge;
    const product = catalog.find(item => item.id === charge.id);
    const curtain = isQuotationCurtainRateEditable(product) && (standalone || openingType === 'Curtain Wall');
    if (!product || product.unit !== charge.unit || (!curtain && (standalone || !isQuotationSystemRateEditable(product)))) {
      throw new Error('This product does not allow a quotation-specific price.');
    }
    const minimum = curtain ? quotationCurtainMinimumRate(snapshot.pricingPolicy) : QUOTATION_SYSTEM_RATE_MIN;
    if (rate < minimum) throw new Error(`Enter a rate of at least ${minimum.toLocaleString('en-US')} IQD, using whole IQD.`);
    const total = Math.round(charge.quantity * rate);
    if (!Number.isFinite(charge.quantity) || charge.quantity <= 0 || !Number.isSafeInteger(total) || total <= 0) {
      throw new Error('Invalid quotation amount.');
    }
    changed = true;
    return { ...charge, rate, total, rateSource: 'quotation' };
  }
  quotation.lines = quotation.lines.map(line => {
    const system = revise(line.system, systemRates.get(line.opening.id)!, false, line.opening.opening_type);
    return { ...line, system, total: system.total + (line.glass?.total ?? 0) + line.extras.reduce((sum, extra) => sum + extra.total, 0) };
  });
  if (quotation.additionalItems) quotation.additionalItems = quotation.additionalItems.map(item => revise(item, additionalRates.get(item.id)!, true));
  if (!changed) throw new Error('Change a quotation price before saving.');
  const revised = applyQuotationDiscount(quotation, QUOTATION_DISCOUNTS_ENABLED ? snapshot.discount?.percent ?? 0 : 0);
  revised.createdAt = new Date().toISOString();
  revised.preparedBy = actorId;
  return revised;
}
