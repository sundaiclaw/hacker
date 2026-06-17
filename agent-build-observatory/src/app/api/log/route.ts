import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertProducerScope } from "@/lib/observability-access";
import { authenticateProducerRequest, buildErrorHeaders, ObservabilityHttpError } from "@/lib/observability-auth";
import { appendEvent } from "@/lib/observability";
import { observabilityEventInputSchema } from "@/lib/observability-schema";
import { normalizeSourceIdentity } from "@/lib/observability-source";

const legacyHostedIdentity = {
  projectId: "legacy-project",
  environmentId: "legacy",
  runtimeId: "legacy-runtime",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = observabilityEventInputSchema.parse(body);
    const authContext = await authenticateProducerRequest(request.headers);
    const scope = normalizeSourceIdentity(parsed, legacyHostedIdentity);
    assertProducerScope(authContext, scope);
    const event = await appendEvent({
      ...parsed,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      runtimeId: scope.runtimeId,
      sourceMode: "hosted",
    });
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid observability event",
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
