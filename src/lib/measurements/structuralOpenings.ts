export const structuralOpeningTypes = [
  "Window",
  "Door",
  "Curtain Wall",
  "Skylight",
] as const;

export type StructuralOpeningType = (typeof structuralOpeningTypes)[number];

export function isStructuralOpeningType(
  value: string,
): value is StructuralOpeningType {
  return structuralOpeningTypes.some((type) => type === value);
}
