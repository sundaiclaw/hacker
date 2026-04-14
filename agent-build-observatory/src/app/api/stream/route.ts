import { getDashboardData } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = async () => {
        if (closed) return;
        const data = await getDashboardData();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      void send();
      const interval = setInterval(() => void send(), 2500);

      return () => {
        closed = true;
        clearInterval(interval);
      };
    },
    cancel() {
      // noop
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
