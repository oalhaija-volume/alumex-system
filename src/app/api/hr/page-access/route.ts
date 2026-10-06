import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";

export async function GET() {
  const auth = await requireRole(["Admin", "HR"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ access: [] });
}

export async function PUT() {
  const auth = await requireRole(["Admin", "HR"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(
    { error: "Employee access is managed by role. Update the employee’s role in HR." },
    { status: 409 },
  );
}
