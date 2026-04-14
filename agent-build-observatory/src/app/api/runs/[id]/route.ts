import { NextRequest, NextResponse } from "next/server";
import { getRunDetail } from "@/lib/observability";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const detail = await getRunDetail(id);

  if (!detail) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
