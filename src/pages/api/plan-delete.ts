import type { APIRoute } from "astro";
import { deletePlan } from "../../lib/db";
import { publishPlanUpdate } from "../../lib/events";

// Delete a plan from the list on the home page. A plain form POST and a 303
// back home, like every other change in this app, so it works without
// JavaScript. Confirming is the form's job: the button that posts here only
// appears after "Delete" is opened on the plan's card.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  if (deletePlan(slug)) {
    // A tab still showing this plan reloads, and finds it gone.
    publishPlanUpdate(slug);
  }
  return redirect("/", 303);
};
