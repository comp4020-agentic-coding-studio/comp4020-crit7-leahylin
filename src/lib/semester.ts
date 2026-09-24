import type { Course, PlanItem } from "./schema";

// Semester grouping and the generated dropdown that constrains it. Pure and
// with no database in it, same reasoning as progress.ts: this is display and
// organisation logic, not requirement logic, so it can be tested directly
// without the migrate()/seed() side effects that importing src/lib/db.ts
// triggers.

/** The four semesters of the Master of Computing's two-year full-time
 *  duration for a 2025 intake: 2025 Semester 1 through 2026 Semester 2.
 *  Fixed rather than generated from today's date — this app models one
 *  cohort's degree timeline, not an open-ended calendar, so the dropdown
 *  should offer exactly the semesters that cohort's plan can span, no more.
 *  Every value here already sorts correctly as a plain string ("2025
 *  Semester 1" < "2025 Semester 2" < "2026 Semester 1"), which is what
 *  makes studyPlanBySemester's ordering below just a sort. */
export function semesterOptions(): string[] {
  return ["2025 Semester 1", "2025 Semester 2", "2026 Semester 1", "2026 Semester 2"];
}

export type ChosenItem = {
  course: Course;
  status: PlanItem["status"];
  semester: string | null;
};

export type SemesterGroup = { semester: string | null; items: ChosenItem[] };

/** The study plan, grouped by semester — "Not yet scheduled" (null) last,
 *  everything else in the chronological order a plain string sort already
 *  gets right for the generated label format. */
export function studyPlanBySemester(chosen: ChosenItem[]): SemesterGroup[] {
  const groups = new Map<string | null, ChosenItem[]>();
  for (const item of chosen) {
    const bucket = groups.get(item.semester);
    if (bucket) bucket.push(item);
    else groups.set(item.semester, [item]);
  }

  const scheduled = [...groups.entries()]
    .filter((entry): entry is [string, ChosenItem[]] => entry[0] !== null)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([semester, items]) => ({ semester, items }));

  const unscheduled = groups.get(null);
  return unscheduled ? [...scheduled, { semester: null, items: unscheduled }] : scheduled;
}
