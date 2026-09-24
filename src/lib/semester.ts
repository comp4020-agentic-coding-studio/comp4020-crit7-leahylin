import type { Course, PlanItem } from "./schema";

// Semester grouping and the generated dropdown that constrains it. Pure and
// with no database in it, same reasoning as progress.ts: this is display and
// organisation logic, not requirement logic, so it can be tested directly
// without the migrate()/seed() side effects that importing src/lib/db.ts
// triggers.

/** The semester labels a student can file a course under: the current year
 *  through three years ahead, two semesters each. Generated rather than
 *  stored, so the list quietly rolls forward every year with nothing to
 *  seed or migrate — and every value it can produce sorts correctly as a
 *  plain string ("2026 Semester 1" < "2026 Semester 2" < "2027 Semester 1"),
 *  which is what makes studyPlanBySemester's ordering below just a sort. */
export function semesterOptions(now: Date = new Date()): string[] {
  const startYear = now.getFullYear();
  const options: string[] = [];
  for (let year = startYear; year <= startYear + 3; year += 1) {
    options.push(`${year} Semester 1`, `${year} Semester 2`);
  }
  return options;
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
