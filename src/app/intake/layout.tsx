import { RegistrationShell } from "@/components/intake/RegistrationShell";

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <RegistrationShell>{children}</RegistrationShell>;
}
