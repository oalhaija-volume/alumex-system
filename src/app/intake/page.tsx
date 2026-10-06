import { OutdoorIntake } from "@/components/intake/OutdoorIntake";
import { requireRole } from "@/lib/auth/adminServer";
import { redirect } from "next/navigation";

export default async function IntakePage() {
  const auth = await requireRole(["Admin", "Indoor Sales", "Outdoor Sales"]);
  if (!auth.ok) redirect("/unauthorized");
  return <OutdoorIntake />;
}
