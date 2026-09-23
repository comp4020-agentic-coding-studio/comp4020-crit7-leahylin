import { EventEmitter } from "node:events";

export const bus = new EventEmitter();
bus.setMaxListeners(0);

/** What a live update carries: which plan changed. Clients watching another
 *  plan ignore it. */
export type PlanUpdate = { slug: string };

export function publishPlanUpdate(slug: string): void {
  bus.emit("message", { slug } satisfies PlanUpdate);
}
