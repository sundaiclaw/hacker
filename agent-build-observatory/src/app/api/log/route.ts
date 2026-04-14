import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { appendEvent } from "@/lib/observability";
import { observabilityEventInputSchema } from "@/lib/observability-schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = observabilityEventInputSchema.parse(body);
    const event = await appendEvent(parsed);
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

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
