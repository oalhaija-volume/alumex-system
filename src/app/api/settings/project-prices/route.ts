import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Project pricing has been superseded. Use /api/settings/product-prices.",
    },
    { status: 410 },
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      error:
        "Project pricing has been superseded. Use /api/settings/product-prices.",
    },
    { status: 410 },
  );
}
