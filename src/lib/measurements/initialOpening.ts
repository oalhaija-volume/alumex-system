export function isInitialOpeningValid(opening: {
  width: number;
  height: number;
  quantity: number;
  siteReadiness?: string;
}) {
  return Number.isInteger(opening.quantity) && opening.quantity > 0 &&
    (opening.siteReadiness === "not_ready" ||
      (Number.isFinite(opening.width) && opening.width > 0 &&
        Number.isFinite(opening.height) && opening.height > 0));
}
