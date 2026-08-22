import type { AppRole } from "@/lib/auth/roles";

export type StructureReadiness = "ready" | "partially_ready" | "not_ready";

export function readinessNeedsFollowUp(readiness: StructureReadiness) {
  return readiness !== "ready";
}

export function intakeMovesDirectlyToMeasurements({
  role,
  source,
  readiness,
}: {
  role: AppRole | null;
  source: string;
  readiness: StructureReadiness;
}) {
  return (
    readiness !== "not_ready" &&
    (role === "Outdoor Sales" ||
      (role === "Admin" && source === "outdoor_sales"))
  );
}
