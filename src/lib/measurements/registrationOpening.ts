export const registrationRoomTypes = ["Living room", "Bedroom", "Kitchen", "Bathroom", "Dining room", "Office", "Hallway", "Staircase", "Balcony", "Storage room", "Other"] as const;
export const registrationStructureTypes = ["Window", "Door", "Louver", "Curtain Wall", "Skylight"] as const;
export type RegistrationStructure = typeof registrationStructureTypes[number];
export type RegistrationOpening = { id: string; floor: string; room: typeof registrationRoomTypes[number]; otherRoom: string; width: number; height: number; structuralType: RegistrationStructure; openingType: "Sliding" | "Hinged" | null };
export function normalizeRegistrationOpening(value: unknown): RegistrationOpening | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) return null;
  if (typeof input.width !== "number" || !Number.isFinite(input.width) || input.width <= 0 || input.width > 100000 || typeof input.height !== "number" || !Number.isFinite(input.height) || input.height <= 0 || input.height > 100000) return null;
  if (!registrationStructureTypes.includes(input.structuralType as RegistrationStructure)) return null;
  const floor = typeof input.floor === "string" ? input.floor.trim() : "";
  const room = input.room as typeof registrationRoomTypes[number];
  const otherRoom = room === "Other" && typeof input.otherRoom === "string" ? input.otherRoom.trim() : "";
  if (!floor || floor.length > 100 || !registrationRoomTypes.includes(room) || (room === "Other" && (!otherRoom || otherRoom.length > 100))) return null;
  const structuralType = input.structuralType as RegistrationStructure;
  const openingType = structuralType === "Louver" ? "Hinged" : structuralType === "Skylight" || structuralType === "Curtain Wall" ? null : input.openingType;
  if (openingType !== null && openingType !== "Sliding" && openingType !== "Hinged") return null;
  if ((structuralType === "Window" || structuralType === "Door") && openingType === null) return null;
  return { id:input.id, width:input.width, height:input.height, floor, room, otherRoom, structuralType, openingType };
}
