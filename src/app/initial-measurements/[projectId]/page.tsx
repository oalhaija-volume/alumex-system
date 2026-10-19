import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/adminServer";
import { RegistrationShell } from "@/components/intake/RegistrationShell";
import { InitialMeasurements } from "@/components/measurements/InitialMeasurements";
export default async function InitialMeasurementsPage({params}:{params:Promise<{projectId:string}>}) {
  const auth = await requireRole(["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Sales Manager", "Outdoor Sales"]);
  if (!auth.ok) redirect("/unauthorized");
  const {projectId} = await params;
  return <RegistrationShell role={auth.role} mobileOutdoor={auth.mobileOutdoor}><InitialMeasurements projectId={projectId} role={auth.role} /></RegistrationShell>;
}
