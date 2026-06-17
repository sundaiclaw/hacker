import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertProducerScope } from "@/lib/observability-access";
import { authenticateProducerRequest, buildErrorHeaders, ObservabilityHttpError } from "@/lib/observability-auth";
import { ingestTelemetry } from "@/lib/observability";
import { telemetryEnvelopeSchema } from "@/lib/runtime-telemetry-schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const envelope = telemetryEnvelopeSchema.parse(body);
    const authContext = await authenticateProducerRequest(request.headers);
    assertProducerScope(authContext, envelope.source);
    const summary = await ingestTelemetry(envelope);

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid telemetry payload",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

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
