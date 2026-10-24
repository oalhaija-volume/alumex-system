export type CatalogProduct = { name: string; category: string | null; unit: string; is_active: boolean };
export type CatalogKind = 'facade' | 'standalone' | 'opening' | 'system' | 'glass' | 'addon' | 'calculator' | 'removed' | 'other';
const key = (name: string) => name.trim().toLowerCase().replace(/[&-]/g, ' ').replace(/\s+/g, ' ');
const facadeNames = new Set(['cladding', 'frontek', 'swisspearl', 'swiss pearl', 'spider system', 'curtain wall', 'natural stone', 'natural stones', 'porcelain']);

export function catalogKind(product: Pick<CatalogProduct, 'name' | 'category'>): CatalogKind {
  const name = key(product.name);
  if (['windows doors', 'windows and doors', 'reynaers system', 'aluman system', 'photocell doors', 'fiber cement', 'fibre cement'].includes(name)) return 'removed';
  if (name === 'skylight') return 'calculator';
  if (facadeNames.has(name)) return 'facade';
  if (['photocell door', 'a swing door', 'swing door'].includes(name) || name.startsWith('photocell door ')) return 'standalone';
  if (['louver', 'louvres', 'louvers', 'lift slide', 'lift and slide'].includes(name)) return 'opening';
  if (['sandblasted glass', 'low e glass', 'saint gobain glass'].includes(name)) return 'glass';
  if (isRollerShutter(product) || isShutterBox(product) || isPushout(product) || ['tilt turn', 'tilt and turn', 'glass film shades', 'glass film shading', 'georgian bars', 'georgien bars'].includes(name) || name.startsWith('hydraulic door closer')) return 'addon';
  const category = product.category?.toLowerCase();
  if (category === 'facade_service' || category === 'cladding_material') return 'facade';
  if (category === 'standalone_product' || category === 'service') return 'standalone';
  if (category === 'opening_product') return 'opening';
  if (category === 'aluminum_system' || category === 'aluminum_section') return 'system';
  if (category === 'glass_option') return 'glass';
  if (category === 'addon' || category === 'add_on') return 'addon';
  return 'other';
}
export function isRollerShutter(product: Pick<CatalogProduct, 'name'>) { return /^roller shutters?(?:$| )/.test(key(product.name)) && !isShutterBox(product); }
export function isShutterBox(product: Pick<CatalogProduct, 'name'>) { return ['roller shutter box', 'shutter box'].includes(key(product.name)); }
export function isPushout(product: Pick<CatalogProduct, 'name'>) { return key(product.name) === 'curtain wall pushout'; }
export function isCurtainWall(product: Pick<CatalogProduct, 'name'>) { return key(product.name) === 'curtain wall'; }
export function isLouver(product: Pick<CatalogProduct, 'name'>) { return ['louver', 'louvres', 'louvers'].includes(key(product.name)); }
export function isAvailable(product: CatalogProduct) { return product.is_active && !['removed', 'calculator'].includes(catalogKind(product)); }
export function normalizeCatalogItem<T extends CatalogProduct>(product: T): T {
  const kind = catalogKind(product);
  const category = ({facade:'facade_service',standalone:'standalone_product',opening:'opening_product',glass:'glass_option',addon:'addon'} as Partial<Record<CatalogKind,string>>)[kind];
  return {...product, category:category ?? product.category, unit:isRollerShutter(product) ? 'item' : kind === 'facade' ? 'sqm' : product.unit, is_active:product.is_active && kind !== 'removed'};
}
export const catalogGroups: {kind:CatalogKind;label:string;description:string}[] = [
  {kind:'system',label:'Window & door systems',description:'Base products selected for measured window and door openings.'},
  {kind:'facade',label:'Facade services',description:'Standalone facade work priced per m² from the building areas entered in the quotation.'},
  {kind:'standalone',label:'Standalone products',description:'Products quoted separately, including photocell and swing doors.'},
  {kind:'opening',label:'Opening products',description:'Select these as the main product for a measured opening, not as an add-on.'},
  {kind:'glass',label:'Glass options',description:'Glass finishes selected and priced on compatible openings.'},
  {kind:'addon',label:'Add-ons',description:'Accessories attached only to compatible openings or facade services.'},
  {kind:'other',label:'Other catalog items',description:'Review the category before using these items in a quotation.'},
];
export function catalogUsage(product: Pick<CatalogProduct,'name'|'category'>) {
  const name=key(product.name);
  if(isShutterBox(product)) return 'Optional with roller shutters when the structure has no concealed shutter recess.';
  if(isRollerShutter(product)) return 'Window and door openings in all systems. Charged once per opening, with a separately priced motor.';
  if(isPushout(product)) return 'Curtain wall only. Enter the number of pushouts; each is charged separately.';
  if(['tilt turn','tilt and turn'].includes(name)) return 'Window add-on only.';
  if(name.startsWith('hydraulic door closer')) return 'Door add-on only.';
  if(['georgian bars','georgien bars'].includes(name)) return 'Window and door add-on, priced by length.';
  if(['sandblasted glass','saint gobain glass'].includes(name)) return 'Priced glass option for windows and doors.';
  if(name.startsWith('glass film')) return 'Glass add-on for glazed openings.';
  return catalogGroups.find(group=>group.kind===catalogKind(product))?.description ?? '';
}
export function compatibleAddon(product: CatalogProduct, structuralType: string | null, mainProduct?: CatalogProduct): boolean {
  if(!isAvailable(product) || catalogKind(product)!=='addon') return false;
  const curtain=structuralType==='Curtain Wall'||!!mainProduct&&isCurtainWall(mainProduct);
  if(isPushout(product)) return curtain;
  if(mainProduct&&isLouver(mainProduct)) return false;
  const window=structuralType==='Window', door=structuralType==='Door';
  const name=key(product.name);
  if(['tilt turn','tilt and turn'].includes(name)) return window;
  if(name.startsWith('hydraulic door closer')) return door;
  if(name.startsWith('glass film')) return window||door||curtain;
  return window||door;
}
export function compatibleGlass(product: CatalogProduct, structuralType: string | null, mainProduct?: CatalogProduct) {
  if(!isAvailable(product)||catalogKind(product)!=='glass'||mainProduct&&isLouver(mainProduct)) return false;
  return ['Window','Door'].includes(structuralType??'') || structuralType==='Curtain Wall'&&key(product.name)!=='sandblasted glass';
}
