export const buildingTypes = ['commercial_building','residential_building','villa_house'] as const;
export type BuildingType = typeof buildingTypes[number];
export const buildingTypeLabels:Record<BuildingType,string> = {
 commercial_building:'Commercial building',
 residential_building:'Residential building',
 villa_house:'Villa / House',
};
export function normalizeBuildingType(value:unknown,required=false):BuildingType|null {
 if(!required&&(value===undefined||value===null||value===''))return null;
 if(typeof value!=='string'||!buildingTypes.includes(value as BuildingType))throw new Error('Choose the building type: commercial building, residential building, or villa / house.');
 return value as BuildingType;
}
