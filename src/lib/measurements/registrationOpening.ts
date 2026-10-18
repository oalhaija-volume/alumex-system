export const registrationRoomTypes = ["Living room", "Bedroom", "Kitchen", "Bathroom", "Dining room", "Office", "Hallway", "Staircase", "Balcony", "Storage room", "Other"] as const;
export const registrationStructureTypes = ["Window", "Door", "Louver", "Curtain Wall", "Skylight"] as const;
export type RegistrationStructure = typeof registrationStructureTypes[number];
export type SkylightCapture = { photo?: string; drawing?: string; sections: { label: string; width: number; length: number }[] };
export function normalizeSkylightCapture(value:unknown):SkylightCapture|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 const image=(value:unknown,kind:'photo'|'drawing')=>value===undefined||value===''||value===null?undefined:
  typeof value==='string'&&value.length<=(kind==='photo'?700000:350000)&&
  (kind==='photo'?/^(?:data:image\/jpeg;base64,\/9j\/|data:image\/png;base64,iVBORw0KGgo)[A-Za-z0-9+/]*={0,2}$/:/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/).test(value)?value:null;
 const photo=image(input.photo,'photo'),drawing=image(input.drawing,'drawing');
 if(photo===null||drawing===null||!Array.isArray(input.sections)||input.sections.length>30)return null;
 const sections:SkylightCapture['sections']=[];
 for(const section of input.sections){
  if(!section||typeof section.label!=='string'||!section.label.trim()||section.label.length>100||
   typeof section.width!=='number'||!Number.isFinite(section.width)||section.width<=0||section.width>100000||
   typeof section.length!=='number'||!Number.isFinite(section.length)||section.length<=0||section.length>100000)return null;
  sections.push({label:section.label.trim(),width:section.width,length:section.length});
 }
 return {...(photo?{photo}:{}),...(drawing?{drawing}:{}),sections};
}
export type CurtainWallCapture = { photo?:string; note:string };
export function normalizeCurtainWallCapture(value:unknown):CurtainWallCapture|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(input.note!==undefined&&typeof input.note!=='string')return null;
 const note=typeof input.note==='string'?input.note.trim():'';
 if(note.length>2000)return null;
 const media=normalizeSkylightCapture({photo:input.photo,sections:[]});
 if(!media)return null;
 return {...(media.photo?{photo:media.photo}:{}),note};
}
export type RegistrationOpening = { hasRollerShutter?:boolean; workArea?:"facade"|"internal"; facadeNumber?:number; curtainWall?:CurtainWallCapture; hasCurtainWallCapture?:boolean; hasArch?:boolean; skylight?:SkylightCapture; hasSkylightCapture?:boolean; id: string; floor: string; room: typeof registrationRoomTypes[number]; otherRoom: string; width: number; height: number; quantity?: number; structuralType: RegistrationStructure; openingType: "Sliding" | "Hinged" | null };
export function normalizeRegistrationOpening(value: unknown): RegistrationOpening | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) return null;
  if (typeof input.width !== "number" || !Number.isFinite(input.width) || input.width <= 0 || input.width > 100000 || typeof input.height !== "number" || !Number.isFinite(input.height) || input.height <= 0 || input.height > 100000) return null;
  if (!registrationStructureTypes.includes(input.structuralType as RegistrationStructure)) return null;
  const quantity = input.quantity === undefined ? 1 : input.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return null;
  const floor = typeof input.floor === "string" ? input.floor.trim() : "";
  const workArea=input.workArea===undefined||input.workArea===null?undefined:input.workArea;
  if(workArea!==undefined&&workArea!=='facade'&&workArea!=='internal')return null;
  const facadeNumber=input.facadeNumber===undefined||input.facadeNumber===null?undefined:input.facadeNumber;
  if(workArea==='facade'?(typeof facadeNumber!=='number'||!Number.isInteger(facadeNumber)||facadeNumber<1||facadeNumber>1000):facadeNumber!==undefined)return null;
  const room = (workArea==='facade'?'Other':input.room) as typeof registrationRoomTypes[number];
  const otherRoom = workArea==='facade'?`Facade ${facadeNumber}`:room === "Other" && typeof input.otherRoom === "string" ? input.otherRoom.trim() : "";
  if (!floor || floor.length > 100 || !registrationRoomTypes.includes(room) || (room === "Other" && (!otherRoom || otherRoom.length > 100))) return null;
  const structuralType = input.structuralType as RegistrationStructure;
  if(input.hasRollerShutter!==undefined&&(typeof input.hasRollerShutter!=='boolean'||(input.hasRollerShutter&&structuralType!=='Window')))return null;
  if(input.hasArch!==undefined&&(typeof input.hasArch!=='boolean'||(input.hasArch&&!['Window','Door'].includes(structuralType))))return null;
  const skylight=input.skylight===undefined||input.skylight===null?undefined:normalizeSkylightCapture(input.skylight);
  if(skylight===null||(skylight&&structuralType!=='Skylight'))return null;
  const curtainWall=input.curtainWall===undefined||input.curtainWall===null?undefined:normalizeCurtainWallCapture(input.curtainWall);
  if(curtainWall===null||(curtainWall&&structuralType!=='Curtain Wall'))return null;
  const openingType = structuralType === "Louver" ? "Hinged" : structuralType === "Skylight" || structuralType === "Curtain Wall" ? null : input.openingType;
  if (openingType !== null && openingType !== "Sliding" && openingType !== "Hinged") return null;
  if ((structuralType === "Window" || structuralType === "Door") && openingType === null) return null;
  return { ...(input.hasRollerShutter===undefined?{}:{hasRollerShutter:input.hasRollerShutter as boolean}),...(workArea?{workArea,...(workArea==='facade'?{facadeNumber:facadeNumber as number}:{})}:{}),...(input.hasArch===undefined?{}:{hasArch:input.hasArch as boolean}),...(skylight?{skylight}:{}),...(curtainWall?{curtainWall}:{}),id:input.id, quantity, width:input.width, height:input.height, floor, room, otherRoom, structuralType, openingType };
}

// Edits replace measurement fields only; saved opening media stays attached to its opening.
export function normalizeOpeningEdit(value: unknown): {opening:RegistrationOpening;previous:RegistrationOpening}|null {
  if(!value||typeof value!=='object')return null;
  const input=value as Record<string,unknown>;
  const measurements=(value:unknown)=>value&&typeof value==='object'
    ? normalizeRegistrationOpening({...value,skylight:undefined,curtainWall:undefined}) : null;
  const opening=measurements(input.opening),previous=measurements(input.previous);
  return opening&&previous&&opening.id===previous.id?{opening,previous}:null;
}
export function sameOpeningMeasurements(left:RegistrationOpening,right:RegistrationOpening):boolean {
  const normalized=normalizeOpeningEdit({opening:{...left,hasArch:left.hasArch??false,hasRollerShutter:left.hasRollerShutter??false},previous:{...right,hasArch:right.hasArch??false,hasRollerShutter:right.hasRollerShutter??false}});
  return !!normalized&&JSON.stringify({...normalized.opening,hasArch:normalized.opening.hasArch??false})===JSON.stringify({...normalized.previous,hasArch:normalized.previous.hasArch??false});
}
