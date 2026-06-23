export type PackingQuotationItem = {
  id: string;
  opening_code: string;
  floor: string | null;
  room: string | null;
  width: number | string;
  height: number | string;
  quantity: number;
  product_system: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
};

export type PackingVehicle = {
  id: string;
  vehicle_name: string;
  cubic_size: number | string;
  plate_number: string | null;
};

export type PackingItemEstimate = {
  id: string;
  openingCode: string;
  location: string;
  productSystem: string;
  glassType: string;
  widthMeters: number;
  heightMeters: number;
  quantity: number;
  sectionDepthMm: number;
  estimatedCubicMeters: number;
};

export type VehicleLoadRecommendation = {
  vehicleId: string;
  vehicleName: string;
  plateNumber: string;
  capacityCubicMeters: number;
  assignedCubicMeters: number;
  utilizationPercent: number;
};

export type PackingRecommendation = {
  totalCubicMeters: number;
  packingAllowancePercent: number;
  items: PackingItemEstimate[];
  recommendedVehicles: VehicleLoadRecommendation[];
  unassignedCubicMeters: number;
  message: string;
};

const packingAllowance = 1.18;
const protectivePackingDepthMm = 40;

const sectionDepthDefaults: Array<{
  match: RegExp;
  depthMm: number;
}> = [
  { match: /curtain|facade|front/i, depthMm: 100 },
  { match: /door/i, depthMm: 85 },
  { match: /sliding/i, depthMm: 75 },
  { match: /hinged|casement|window/i, depthMm: 60 },
];

function numberValue(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function sectionDepthForSystem(productSystem: string | null) {
  const system = productSystem ?? "";
  return (
    sectionDepthDefaults.find((entry) => entry.match.test(system))?.depthMm ?? 65
  );
}

function roundVolume(value: number) {
  return Math.round(value * 100) / 100;
}

export function estimatePackingItems(items: PackingQuotationItem[]) {
  return items.map<PackingItemEstimate>((item) => {
    const widthMeters = numberValue(item.width) / 100;
    const heightMeters = numberValue(item.height) / 100;
    const quantity = Math.max(Number(item.quantity ?? 0), 0);
    const sectionDepthMm = sectionDepthForSystem(item.product_system);
    const packedDepthMeters =
      (sectionDepthMm + protectivePackingDepthMm) / 1000;
    const estimatedCubicMeters = roundVolume(
      widthMeters * heightMeters * packedDepthMeters * quantity * packingAllowance,
    );
    const location = [item.floor, item.room].filter(Boolean).join(" / ");

    return {
      id: item.id,
      openingCode: item.opening_code,
      location,
      productSystem: item.product_system ?? "Unspecified system",
      glassType: item.glass_type ?? "Unspecified glass",
      widthMeters,
      heightMeters,
      quantity,
      sectionDepthMm,
      estimatedCubicMeters,
    };
  });
}

export function recommendVehiclesForPacking({
  items,
  vehicles,
}: {
  items: PackingQuotationItem[];
  vehicles: PackingVehicle[];
}): PackingRecommendation {
  const estimatedItems = estimatePackingItems(items);
  const totalCubicMeters = roundVolume(
    estimatedItems.reduce((sum, item) => sum + item.estimatedCubicMeters, 0),
  );
  const activeVehicles = vehicles
    .map((vehicle) => ({
      ...vehicle,
      capacity: numberValue(vehicle.cubic_size),
    }))
    .filter((vehicle) => vehicle.capacity > 0)
    .sort((left, right) => left.capacity - right.capacity);

  if (totalCubicMeters <= 0) {
    return {
      totalCubicMeters,
      packingAllowancePercent: Math.round((packingAllowance - 1) * 100),
      items: estimatedItems,
      recommendedVehicles: [],
      unassignedCubicMeters: 0,
      message: "No quotation goods were found for packing.",
    };
  }

  const singleVehicle = activeVehicles.find(
    (vehicle) => vehicle.capacity >= totalCubicMeters,
  );

  if (singleVehicle) {
    return {
      totalCubicMeters,
      packingAllowancePercent: Math.round((packingAllowance - 1) * 100),
      items: estimatedItems,
      recommendedVehicles: [
        {
          vehicleId: singleVehicle.id,
          vehicleName: singleVehicle.vehicle_name,
          plateNumber: singleVehicle.plate_number ?? "",
          capacityCubicMeters: singleVehicle.capacity,
          assignedCubicMeters: totalCubicMeters,
          utilizationPercent: Math.round(
            (totalCubicMeters / singleVehicle.capacity) * 100,
          ),
        },
      ],
      unassignedCubicMeters: 0,
      message: "Recommended single-truck fit.",
    };
  }

  let remaining = totalCubicMeters;
  const recommendations: VehicleLoadRecommendation[] = [];

  [...activeVehicles]
    .sort((left, right) => right.capacity - left.capacity)
    .forEach((vehicle) => {
      if (remaining <= 0) {
        return;
      }

      const assigned = roundVolume(Math.min(vehicle.capacity, remaining));
      remaining = roundVolume(remaining - assigned);
      recommendations.push({
        vehicleId: vehicle.id,
        vehicleName: vehicle.vehicle_name,
        plateNumber: vehicle.plate_number ?? "",
        capacityCubicMeters: vehicle.capacity,
        assignedCubicMeters: assigned,
        utilizationPercent: Math.round((assigned / vehicle.capacity) * 100),
      });
    });

  return {
    totalCubicMeters,
    packingAllowancePercent: Math.round((packingAllowance - 1) * 100),
    items: estimatedItems,
    recommendedVehicles: recommendations,
    unassignedCubicMeters: Math.max(remaining, 0),
    message:
      remaining > 0
        ? "Available trucks do not cover the full estimated load."
        : "Recommended multi-truck split.",
  };
}
