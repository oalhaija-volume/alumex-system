import type { Metadata } from "next";
import { SkylightCalculator } from "@/components/skylight/SkylightCalculator";

export const metadata: Metadata = {
  title: "Skylight Calculator | Alumex Experts",
  description: "Alumex skylight cost calculator and quotation.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function SkylightPage() {
  return <SkylightCalculator />;
}
