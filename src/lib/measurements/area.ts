export type CentimeterOpeningDimensions = {
  width: number;
  height: number;
  quantity: number;
};

export function centimetersToSquareMeters(
  opening: CentimeterOpeningDimensions,
) {
  const widthCentimeters = Math.max(Number(opening.width) || 0, 0);
  const heightCentimeters = Math.max(Number(opening.height) || 0, 0);
  const quantity = Math.max(Number(opening.quantity) || 0, 0);

  return (widthCentimeters * heightCentimeters * quantity) / 10_000;
}
