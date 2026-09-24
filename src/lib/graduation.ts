// When the plan says the student finishes: the end of the last semester
// that has a course in it — but only once the plan actually meets the
// degree, and only if every course still to do has a semester. Otherwise it
// says what's missing instead of guessing. Pure, like semester.ts.

import type { SemesterGroup } from "./semester";
import { semesterOptions, semesterUnits } from "./semester";

export type Graduation =
  /** Every requirement met by completed courses. */
  | { kind: "complete" }
  /** The plan meets the degree and everything left is scheduled. */
  | { kind: "expected"; semester: string }
  /** The plan meets the degree, but some planned courses have no semester.
   *  `atLeast` is the latest semester scheduled so far, if any. */
  | { kind: "unscheduled"; unscheduledUnits: number; atLeast: string | null }
  /** The plan doesn't meet every requirement yet. `standardEnd` is when
   *  the standard four semesters from the intake end. */
  | { kind: "incomplete"; standardEnd: string };

export function expectedGraduation(input: {
  /** Every requirement met by completed courses (degreeComplete). */
  complete: boolean;
  /** Every requirement met once planned courses count too (degreeOnTrack). */
  onTrack: boolean;
  /** The study plan by semester (studyPlanBySemester, not everySemester:
   *  empty semesters don't matter here). */
  groups: SemesterGroup[];
  intake: string;
}): Graduation {
  if (input.complete) return { kind: "complete" };
  const standard = semesterOptions(input.intake);
  if (!input.onTrack) {
    return { kind: "incomplete", standardEnd: standard[standard.length - 1] };
  }
  const scheduled = input.groups
    .filter((group) => group.semester !== null && group.items.length > 0)
    .map((group) => group.semester as string)
    .sort((a, b) => a.localeCompare(b));
  const latest = scheduled.at(-1) ?? null;
  const loose = input.groups.find((group) => group.semester === null);
  // Only a course still to do needs a semester; a completed one with none
  // is done whenever it was taken.
  const stillToDo = loose ? loose.items.filter((item) => item.status === "planned") : [];
  if (stillToDo.length > 0) {
    return { kind: "unscheduled", unscheduledUnits: semesterUnits(stillToDo), atLeast: latest };
  }
  // On track with nothing scheduled can only mean everything is done bar
  // the paperwork; complete covers that, so a latest semester exists here.
  return latest
    ? { kind: "expected", semester: latest }
    : { kind: "incomplete", standardEnd: standard[standard.length - 1] };
}
