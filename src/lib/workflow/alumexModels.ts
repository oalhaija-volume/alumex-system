import { catalogKind, isAvailable, type CatalogProduct } from './catalogRules';

export type AlumexSystemModel = 'A16'|'A16 Pro'|'A16 Pro+'|'4500'|'4500 Pro';
type ModelOpening = { opening_type:string|null; opening_direction:string|null };
const slidingModels:readonly AlumexSystemModel[] = Object.freeze(['A16','A16 Pro','A16 Pro+']);
const hingedModels:readonly AlumexSystemModel[] = Object.freeze(['4500','4500 Pro']);
const noModels:readonly AlumexSystemModel[] = Object.freeze([]);

// Models describe the chosen Alumex system. Catalog rates and quotation-specific
// rates stay attached to the original product rather than to a new price row.
export function alumexSystemModelOptions(opening:ModelOpening,product:CatalogProduct|null|undefined):readonly AlumexSystemModel[] {
 if(!product||!isAvailable(product)||catalogKind(product)!=='system'||product.unit!=='sqm'||!/^alumex\b/i.test(product.name.trim())||!['Window','Door'].includes(opening.opening_type??''))return noModels;
 if(/\bsliding\b/i.test(product.name)&&opening.opening_direction!=='Sliding'||/\bhinged\b/i.test(product.name)&&opening.opening_direction!=='Hinged')return noModels;
 return opening.opening_direction==='Sliding'?slidingModels:opening.opening_direction==='Hinged'?hingedModels:noModels;
}

export function validateAlumexSystemModel(selected:unknown,opening:ModelOpening,product:CatalogProduct|null|undefined):AlumexSystemModel|undefined {
 if(selected===undefined)return undefined;
 if(typeof selected!=='string'||!alumexSystemModelOptions(opening,product).includes(selected as AlumexSystemModel))throw new Error('Choose an Alumex model compatible with this opening and system.');
 return selected as AlumexSystemModel;
}

export function alumexSystemLabel(systemName:string,systemModel?:AlumexSystemModel):string {
 return systemModel===undefined?systemName:`ALUMEX ${systemModel}`;
}
