import { RegistrationShell } from "@/components/intake/RegistrationShell";
import { requireRole } from "@/lib/auth/adminServer";
import { redirect } from "next/navigation";

export default async function IntakeLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireRole(["Admin", "Indoor Sales", "Outdoor Sales"]);
  if (!auth.ok) redirect("/unauthorized");
  return <RegistrationShell role={auth.role}>{children}</RegistrationShell>;
}
