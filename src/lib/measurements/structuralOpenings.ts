export const structuralOpeningTypes = [
  "Window",
  "Door",
  "Curtain Wall",
  "Skylight",
  "Louver",
] as const;

export type StructuralOpeningType = (typeof structuralOpeningTypes)[number];

export function isStructuralOpeningType(
  value: string,
): value is StructuralOpeningType {
  return structuralOpeningTypes.some((type) => type === value);
}

const openingCodePrefixes: Record<StructuralOpeningType, string> = {
  Window: "W",
  Door: "D",
  "Curtain Wall": "CW",
  Skylight: "SK",
  Louver: "L",
};

export function openingCodePrefix(type: StructuralOpeningType) {
  return openingCodePrefixes[type];
}

export function nextStructuralOpeningCode(
  type: StructuralOpeningType,
  existingCodes: string[],
) {
  const prefix = openingCodePrefix(type);
  const codePattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const nextNumber =
    existingCodes.reduce((highest, code) => {
      const match = code.trim().match(codePattern);
      return match ? Math.max(highest, Number(match[1]) || 0) : highest;
    }, 0) + 1;

  return `${prefix}-${String(nextNumber).padStart(2, "0")}`;
}
