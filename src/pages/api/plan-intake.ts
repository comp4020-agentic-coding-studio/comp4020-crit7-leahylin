import type { APIRoute } from "astro";
import { getPlan, setIntake } from "../../lib/db";
import { publishPlanUpdate } from "../../lib/events";

// Set when a plan starts. The study plan moves with it (see setIntake), so
// changing a 2025 Semester 1 start to Semester 2 moves every scheduled
// course one semester later.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  const plan = getPlan(slug);
  if (!plan) return redirect("/", 303);
  setIntake(plan.id, String(form.get("intake") ?? ""));
  publishPlanUpdate(plan.slug);
  return redirect(`/plan/${plan.slug}/`, 303);
};
