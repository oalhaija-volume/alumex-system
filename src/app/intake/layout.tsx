import { RegistrationShell } from "@/components/intake/RegistrationShell";
import { getIntakeAccess } from "@/lib/intake/server";
import { redirect } from "next/navigation";

export default async function IntakeLayout({ children }: { children: React.ReactNode }) {
  const auth = await getIntakeAccess();
  if (!auth.ok) redirect("/unauthorized");
  return <RegistrationShell role={auth.role} mobileOutdoor={auth.mobileOutdoor}>{children}</RegistrationShell>;
}
