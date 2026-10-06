export function applyProjectSystem<T extends {
  lineType?: string;
  productSystem: string;
  unitPrice: number;
}>(lines: T[], system: { product_name: string; unit_price: number } | undefined): T[] {
  return lines.map(line => (line.lineType ?? "base") === "base"
    ? { ...line, productSystem: system?.product_name ?? "", unitPrice: system?.unit_price ?? 0 }
    : line);
}
