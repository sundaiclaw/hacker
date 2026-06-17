import { NextRequest, NextResponse } from "next/server";
import { authenticateViewerRequest, buildErrorHeaders, ObservabilityHttpError } from "@/lib/observability-auth";
import { getRunDetail } from "@/lib/observability";

export async function GET(
  request: NextRequest | Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await authenticateViewerRequest(request.headers);
    const { id } = await context.params;
    const detail = await getRunDetail(id, { authContext });

    if (!detail) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof ObservabilityHttpError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: buildErrorHeaders(error) }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
