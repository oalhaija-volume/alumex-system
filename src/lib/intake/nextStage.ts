import type { AppRole } from "@/lib/auth/roles";

export function intakeMovesDirectlyToMeasurements({
  role,
  source,
  readiness,
}: {
  role: AppRole | null;
  source: string;
  readiness: "ready" | "not_ready";
}) {
  return (
    readiness === "ready" &&
    (role === "Outdoor Sales" ||
      (role === "Admin" && source === "outdoor_sales"))
  );
}
