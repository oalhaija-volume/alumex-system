import { alumexSystemLabel, type AlumexSystemModel } from '../workflow/alumexModels';
import type { Charge, QuoteSnapshot } from '../workflow/pricing';
import { productTechnicalDescription } from './agreement2027Content';
import type { AgreementOpeningSpecification } from './agreement2027Types';

export type Agreement2027Product = {
 id: string;
 name: string;
 kind: 'system' | 'glass' | 'addon';
 sourceKey?: string;
 unit: string;
 rates: number[];
 openingIds: string[];
 technicalDescriptions: string[];
 details: string[];
};

// Keep the selected systems in the same family order as the source document.
// An unfamiliar approved product is retained after these known families.
const systemOrder = [
 'alumex-16', 'alumex-16-pro', 'alumex-16-plus',
 'alumex-4500', 'alumex-4500-pro', 'alumex-4500-louver',
 'alumex-curtain-wall-cw60', 'alumex-skylight-cw60',
 'alumex-push-out', 'alumex-swing-door', 'photo-cell-geze', 'photo-cell-ex',
 'the-address-as-a18', 'the-address-as-a15', 'the-address-ah650-660-688', 'the-address-curtain-wall',
] as const;
const addonKeys = new Set([
 'tempered-glass-single', 'tempered-glass-double', 'low-e-glass', 'mirror-glass',
 'georgian-bar', 'turn-and-tilt', 'sub-frame', 'arch',
]);
const sourceKeys = new Set<string>([...systemOrder, ...addonKeys]);

/** Recognize reference slots only; a catalog name is never a product selection. */
export function agreement2027ProductKey(name: string): string | undefined {
 const normalized = name.normalize('NFKC').toLowerCase()
  .replace(/alumex\s*a16\b/g, 'alumex 16')
  .replace(/pro\s*\+/g, 'plus')
  .replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
 let key: string | undefined;
 if (/photocell/.test(normalized)) {
  key = /gezz?e/.test(normalized) ? 'photo-cell-geze'
   : /(?:door)?ex$/.test(normalized) || /^exphotocell/.test(normalized) ? 'photo-cell-ex' : undefined;
 } else if (normalized.includes('alumexcurtainwall')) key = 'alumex-curtain-wall-cw60';
 else if (normalized.includes('alumexskylight')) key = 'alumex-skylight-cw60';
 else if (normalized.includes('theaddresscurtainwall')) key = 'the-address-curtain-wall';
 else if (normalized.includes('theaddressah')) key = 'the-address-ah650-660-688';
 else if (normalized.includes('theaddressasa18')) key = 'the-address-as-a18';
 else if (normalized.includes('theaddressasa15')) key = 'the-address-as-a15';
 else {
  const models: Record<string, string> = {
   alumex16: 'alumex-16', alumex16pro: 'alumex-16-pro', alumex16plus: 'alumex-16-plus',
   alumex4500: 'alumex-4500', alumex4500pro: 'alumex-4500-pro', alumex4500louver: 'alumex-4500-louver',
   alumexpushout: 'alumex-push-out', alumexswingdoor: 'alumex-swing-door',
  };
  key = models[normalized];
  if (!key && /tempered|سيكوريت|مقسى/.test(normalized)) key = /double|لوحين|مزدوج/.test(normalized) ? 'tempered-glass-double' : 'tempered-glass-single';
  if (!key && /lowe/.test(normalized)) key = 'low-e-glass';
  if (!key && /mirror|عاكس/.test(normalized)) key = 'mirror-glass';
  if (!key && /georgian/.test(normalized)) key = 'georgian-bar';
  if (!key && /tilt|laval/.test(normalized)) key = 'turn-and-tilt';
  if (!key && /subframe|coverframe/.test(normalized)) key = 'sub-frame';
  if (!key && /arch|تقويس/.test(normalized)) key = 'arch';
 }
 return key && sourceKeys.has(key) ? key : undefined;
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
function unique<T>(values: T[], value: T): void {
 if (!values.includes(value)) values.push(value);
}

/** Build contract products exclusively from charges in the approved snapshot. */
export function selectedAgreement2027Products(
 quotation: QuoteSnapshot,
 specifications: readonly AgreementOpeningSpecification[] = [],
): Agreement2027Product[] {
 const products = new Map<string, Agreement2027Product>();
 const savedSpecifications = new Map(specifications.map(specification => [specification.openingId, specification]));

 function add(charge: Charge, kind: Agreement2027Product['kind'], openingId?: string, model?: AlumexSystemModel): void {
  // Some older snapshots carry optional zero-quantity placeholders. A free
  // selected item still has a positive quantity and must remain in the list.
  if (!(charge.quantity > 0)) return;
  const name = kind === 'system' ? alumexSystemLabel(charge.name, model) : charge.name;
  // Different selected models, units or source products must never collapse
  // just because their display labels or approved rates happen to match.
  const identity = JSON.stringify([charge.id, charge.name, model ?? '', charge.unit]);
  let product = products.get(identity);
  if (!product) {
   const sourceKey = agreement2027ProductKey(name);
   product = { id: identity, name, kind, ...(sourceKey ? { sourceKey } : {}), unit: charge.unit, rates: [], openingIds: [], technicalDescriptions: [], details: [] };
   products.set(identity, product);
  }
  if (Number.isFinite(charge.rate)) unique(product.rates, charge.rate);
  if (openingId) unique(product.openingIds, openingId);
  if (kind !== 'system') return;

  const specification = openingId ? savedSpecifications.get(openingId) : undefined;
  const description = text(specification?.technicalDescription) || productTechnicalDescription(name);
  if (description) unique(product.technicalDescriptions, description);
  for (const [label, value] of [
   ['لون الألمنيوم', specification?.aluminumColor],
   ['لون الزجاج', specification?.glassColor],
   ['الإطار الأرضي / عتب الباب', specification?.bottomFrame],
   ['ملاحظات', specification?.notes],
  ]) {
   const recorded = text(value);
   if (recorded) unique(product.details, label + ': ' + recorded);
  }
 }

 for (const line of quotation.lines) {
  add(line.system, 'system', line.opening.id, line.systemModel);
  if (line.glass) add(line.glass, 'glass', line.opening.id);
  for (const extra of line.extras) add(extra, 'addon', line.opening.id);
 }
 for (const item of quotation.additionalItems ?? []) {
  const sourceKey = agreement2027ProductKey(item.name);
  add(item, item.projectAddon || sourceKey && addonKeys.has(sourceKey) ? 'addon' : 'system');
  for (const extra of item.extras ?? []) add(extra, 'addon');
 }

 const rank = (product: Agreement2027Product) => {
  const index = systemOrder.findIndex(key => key === product.sourceKey);
  return index < 0 ? systemOrder.length : index;
 };
 return [...products.values()].sort((a, b) => {
  if (a.kind === 'system' && b.kind === 'system') return rank(a) - rank(b);
  if (a.kind === 'system') return -1;
  if (b.kind === 'system') return 1;
  return 0;
 });
}
