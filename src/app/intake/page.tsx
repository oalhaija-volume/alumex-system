import { OutdoorIntake } from "@/components/intake/OutdoorIntake";
import { getIntakeAccess, getIntakeEmployeeState } from "@/lib/intake/server";
import { redirect } from "next/navigation";

export default async function IntakePage() {
  const auth = await getIntakeAccess();
  if (!auth.ok) redirect("/unauthorized");
  return <OutdoorIntake initialEmployeeState={await getIntakeEmployeeState(auth)} />;
}
