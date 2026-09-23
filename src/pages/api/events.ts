import type { APIRoute } from "astro";
import { type PlanUpdate, bus } from "../../lib/events";

// The live half: every open plan page subscribes, and a change to any plan is
// broadcast to all of them. Each client filters on the slug it is showing.
//
// Deliberately takes NO query parameter. The CI deploy probe opens this
// endpoint bare and fails unless bytes arrive immediately, so the opening
// comment frame below is load-bearing, not decoration.
export const GET: APIRoute = () => {
  let onMessage: (update: PlanUpdate) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onMessage = (update) => {
        controller.enqueue(`data: ${JSON.stringify(update)}\n\n`);
      };
      bus.on("message", onMessage);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("message", onMessage);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
