import type { APIRoute } from "astro";
import { addToPlan, getPlan, moveToSemester, removeFromPlan } from "../../lib/db";
import { publishPlanUpdate } from "../../lib/events";

// Add a course to a plan, move it between completed and planned, or drop it.
// One endpoint for all three because they are the same row: adding a course
// that is already there updates its status (see UNIQUE (plan_id, course_id)).
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  const plan = getPlan(slug);
  if (!plan) return redirect("/", 303);

  const courseId = Number(form.get("courseId"));
  const action = String(form.get("action") ?? "add");
  // "" means "not yet scheduled" on the wire, null in the database.
  const rawSemester = form.get("semester");
  const semester = rawSemester ? String(rawSemester) : null;

  if (Number.isInteger(courseId) && courseId > 0) {
    if (action === "remove") {
      removeFromPlan(plan.id, courseId);
    } else if (action === "move") {
      moveToSemester(plan.id, courseId, semester);
    } else {
      const status = form.get("status") === "completed" ? "completed" : "planned";
      addToPlan(plan.id, courseId, status, semester);
    }
    // Tell every other open tab showing this plan to refresh.
    publishPlanUpdate(plan.slug);
  }

  return redirect(`/plan/${plan.slug}/`, 303);
};
