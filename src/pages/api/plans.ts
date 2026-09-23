import type { APIRoute } from "astro";
import { createPlan } from "../../lib/db";

// A plain HTML form POSTs here and gets a 303 back, so creating a plan works
// with no client-side JavaScript at all.
//
// Plan creation lives here rather than on `/` on purpose: a CI probe POSTs to
// `/` to check the app knows it is behind HTTPS, and another POSTs
// cross-origin expecting a 403. Keeping `/` free of a POST handler keeps both
// probes meaningful.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const label = String(form.get("label") ?? "").trim();
  if (!label) return redirect("/", 303);

  const plan = createPlan(label.slice(0, 80));
  return redirect(`/plan/${plan.slug}/`, 303);
};
