import type { Course, PlanItem } from "./schema";
import { TWO_SEMESTER_COURSES } from "./seed-data";

// Semester grouping and the generated dropdown that constrains it. Pure and
// with no database in it, same reasoning as progress.ts: this is display and
// organisation logic, not requirement logic, so it can be tested directly
// without the migrate()/seed() side effects that importing src/lib/db.ts
// triggers.

/** The semesters a plan can start in: the 2025 intakes, first or second
 *  semester. The first is the default, and what every plan made before the
 *  intake could be chosen was planned against. */
export const INTAKES = ["2025 Semester 1", "2025 Semester 2"] as const;
export type Intake = (typeof INTAKES)[number];
export const DEFAULT_INTAKE: Intake = INTAKES[0];

/** The Master of Computing is four semesters full time, and a plan spans
 *  exactly those four. */
const STANDARD_SEMESTERS = 4;

export function isIntake(value: string): value is Intake {
  return (INTAKES as readonly string[]).includes(value);
}

/** The calendar semester after this one: "2025 Semester 2" -> "2026
 *  Semester 1". Null for anything not in "YYYY Semester N" form. */
export function followingSemester(semester: string): string | null {
  return shiftSemester(semester, 1);
}

/** Move a semester label `by` semesters, forward or back. */
export function shiftSemester(semester: string, by: number): string | null {
  const match = /^(\d{4}) Semester ([12])$/.exec(semester);
  if (!match) return null;
  const index = Number(match[1]) * 2 + Number(match[2]) - 1 + by;
  return `${Math.floor(index / 2)} Semester ${(index % 2) + 1}`;
}

/** How many semesters apart two labels are (b minus a). */
export function semestersBetween(a: string, b: string): number {
  const ordinal = (s: string) => {
    const match = /^(\d{4}) Semester ([12])$/.exec(s);
    return match ? Number(match[1]) * 2 + Number(match[2]) - 1 : Number.NaN;
  };
  return ordinal(b) - ordinal(a);
}

/** The semesters a plan can use, from its intake: the four of the standard
 *  full-time duration. A 2025 Semester 1 intake gives 2025 Semester 1
 *  through 2026 Semester 2; a Semester 2 intake, 2025 Semester 2 through
 *  2027 Semester 1. Fixed by the intake rather than today's date:
 *  this models one student's timeline, not an open-ended calendar. Every
 *  label sorts correctly as a plain string, which is what makes
 *  studyPlanBySemester's ordering below just a sort. */
export function semesterOptions(intake: string = DEFAULT_INTAKE): string[] {
  return Array.from(
    { length: STANDARD_SEMESTERS },
    (_, i) => shiftSemester(intake, i) ?? intake,
  );
}

export type ChosenItem = {
  course: Course;
  /** For a two-semester course, the status of its FIRST semester. */
  status: PlanItem["status"];
  semester: string | null;
  /** For a two-semester course, the status of its second semester. */
  secondStatus?: PlanItem["status"];
};

/** A row in one semester's group. A two-semester course has two of these,
 *  one per semester it runs in; `part` says which, and `semester` on the
 *  item is always the semester it STARTS in (what the plan stores). */
export type SemesterRow = ChosenItem & { part?: 1 | 2 };

export type SemesterGroup = { semester: string | null; items: SemesterRow[] };

/** ANU's standard full-time load for one semester. More than this is an
 *  overload, which needs approval. */
export const FULL_TIME_LOAD = 24;

/** Units a semester's rows add up to, counting each semester of a
 *  two-semester course at half its units. */
export function semesterUnits(rows: SemesterRow[]): number {
  return rows.reduce((sum, row) => sum + unitsPerSemester(row.course), 0);
}

/** Every semester the plan can span, in order, each with whatever is filed
 *  under it (possibly nothing), then "Not yet scheduled" only if something
 *  is. An empty semester is still worth showing: it's a gap in the plan.
 *  A course filed under a semester outside the span (the app never writes
 *  one, but data can outlive the rules) still gets its semester listed, in
 *  order, rather than silently vanishing from the page. */
export function everySemester(
  groups: SemesterGroup[],
  intake: string = DEFAULT_INTAKE,
): SemesterGroup[] {
  const bySemester = new Map(groups.map((group) => [group.semester, group.items]));
  const span = semesterOptions(intake);
  const outside = groups
    .map((group) => group.semester)
    .filter((semester): semester is string => semester !== null && !span.includes(semester));
  const listed = [...span, ...outside]
    .sort((a, b) => a.localeCompare(b))
    .map((semester) => ({ semester, items: bySemester.get(semester) ?? [] }));
  const unscheduled = bySemester.get(null);
  return unscheduled ? [...listed, { semester: null, items: unscheduled }] : listed;
}

/** True for a course taken over two consecutive semesters (COMP8715). */
export function isTwoSemester(course: Pick<Course, "code">): boolean {
  return TWO_SEMESTER_COURSES.has(course.code);
}

/** The plan's semester after this one, or null if it is the plan's last. */
export function nextSemester(semester: string, intake: string = DEFAULT_INTAKE): string | null {
  const all = semesterOptions(intake);
  const index = all.indexOf(semester);
  return index === -1 ? null : (all[index + 1] ?? null);
}

/** The semesters a course can be scheduled to START in: any of the plan's,
 *  except that a two-semester course needs a following one to finish in. */
export function startSemesters(
  course: Pick<Course, "code">,
  intake: string = DEFAULT_INTAKE,
): string[] {
  const all = semesterOptions(intake);
  return isTwoSemester(course) ? all.filter((s) => nextSemester(s, intake) !== null) : all;
}

/** Whether a course may be stored against this semester in a plan with
 *  this intake. Not yet scheduled (null) is always allowed; a semester
 *  outside the plan's span never is. */
export function canStartIn(
  course: Pick<Course, "code">,
  semester: string | null,
  intake: string = DEFAULT_INTAKE,
): boolean {
  return semester === null || startSemesters(course, intake).includes(semester);
}

/** Units a course carries in ONE semester it runs in. */
export function unitsPerSemester(course: Pick<Course, "code" | "units">): number {
  return isTwoSemester(course) ? course.units / 2 : course.units;
}

/** The study plan, grouped by semester — "Not yet scheduled" (null) last,
 *  everything else in the chronological order a plain string sort already
 *  gets right for the generated label format. */
export function studyPlanBySemester(chosen: ChosenItem[]): SemesterGroup[] {
  const groups = new Map<string | null, SemesterRow[]>();
  const put = (semester: string | null, row: SemesterRow) => {
    const bucket = groups.get(semester);
    if (bucket) bucket.push(row);
    else groups.set(semester, [row]);
  };
  for (const item of chosen) {
    // A scheduled two-semester course shows up in both semesters it runs
    // in. Unscheduled, it is still one course waiting for a start.
    // Its second half is the calendar semester after its first; the plan's
    // span never lets it start where that would fall outside.
    const following = item.semester === null ? null : followingSemester(item.semester);
    if (isTwoSemester(item.course) && item.semester !== null) {
      put(item.semester, { ...item, part: 1 });
      if (following) {
        put(following, { ...item, status: item.secondStatus ?? item.status, part: 2 });
      }
    } else {
      put(item.semester, item);
    }
  }
  // Within a semester, keep the incoming order (by course code).
  for (const rows of groups.values()) {
    rows.sort((a, b) => a.course.code.localeCompare(b.course.code));
  }

  const scheduled = [...groups.entries()]
    .filter((entry): entry is [string, SemesterRow[]] => entry[0] !== null)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([semester, items]) => ({ semester, items }));

  const unscheduled = groups.get(null);
  return unscheduled ? [...scheduled, { semester: null, items: unscheduled }] : scheduled;
}
