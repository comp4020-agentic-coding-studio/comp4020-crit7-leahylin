import type { APIRoute } from "astro";
import { createPlan, setIntake } from "../../lib/db";

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
  // The starting semester can be chosen up front, the same way the plan
  // page sets it later. Anything unrecognised is ignored and the plan
  // starts 2025 Semester 1. The form's degree field has one option
  // (7706XMCOMP, the only degree modelled), so there's nothing to read.
  setIntake(plan.id, String(form.get("intake") ?? ""));
  return redirect(`/plan/${plan.slug}/`, 303);
};
