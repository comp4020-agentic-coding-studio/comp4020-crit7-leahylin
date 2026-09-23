import type { APIRoute } from "astro";
import { declareSpecialisation, getPlan, getSpecialisation } from "../../lib/db";
import { publishPlanUpdate } from "../../lib/events";

// Declaring a specialisation is a compulsory part of MCOMP, and it changes
// which requirements apply — so it is a write on the plan, not a view filter.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const plan = getPlan(String(form.get("slug") ?? ""));
  if (!plan) return redirect("/", 303);

  const raw = String(form.get("specialisationId") ?? "");
  // The empty option means "withdraw the declaration", which has to be
  // possible: declaring one hides the others' rules, so a wrong choice must
  // be undoable.
  const id = raw === "" ? null : Number(raw);

  if (id === null || (Number.isInteger(id) && getSpecialisation(id) !== undefined)) {
    declareSpecialisation(plan.id, id);
    publishPlanUpdate(plan.slug);
  }

  return redirect(`/plan/${plan.slug}/`, 303);
};
