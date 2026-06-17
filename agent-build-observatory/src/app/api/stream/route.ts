import { buildLiveState, createSnapshotMessage, diffLiveState } from "@/lib/observability-live";
import { authenticateViewerRequest, buildErrorHeaders, ObservabilityHttpError } from "@/lib/observability-auth";
import type { DashboardFilters } from "@/lib/observability-db";
import { parseSourceModeFilter } from "@/lib/observability-source";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authContext = await authenticateViewerRequest(request.headers);
    const filters = parseDashboardFilters(new URL(request.url).searchParams);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let current = await buildLiveState({ authContext, filters });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(createSnapshotMessage(current))}\n\n`));

        const interval = setInterval(async () => {
          try {
            const next = await buildLiveState({ authContext, filters });
            const messages = diffLiveState(current, next);

            if (messages.length === 0) {
              controller.enqueue(encoder.encode(`: keepalive\n\n`));
              return;
            }

            for (const message of messages) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
            }

            current = next;
          } catch {
            controller.enqueue(encoder.encode(`event: error\ndata: {"error":"stream_update_failed"}\n\n`));
          }
        }, 2500);

        request.signal.addEventListener("abort", () => {
          clearInterval(interval);
          controller.close();
        });
      },
      cancel() {
        // no-op
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    if (error instanceof ObservabilityHttpError) {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), {
        status: error.status,
        headers: {
          "Content-Type": "application/json",
          ...(buildErrorHeaders(error) as Record<string, string> | undefined),
        },
      });
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const status = collectFilterValues(searchParams, "status");
  const stage = collectFilterValues(searchParams, "stage");
  const owner = collectFilterValues(searchParams, "owner");
  const source = collectFilterValues(searchParams, "source")
    .map((value) => parseSourceModeFilter(value))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    statuses: status.length > 0 ? status : undefined,
    stages: stage.length > 0 ? stage : undefined,
    owners: owner.length > 0 ? owner : undefined,
    sourceModes: source.length > 0 ? source : undefined,
  };
}

function collectFilterValues(searchParams: URLSearchParams, key: string) {
  return [...new Set(searchParams.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
}
