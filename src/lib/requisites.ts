// Checking a study plan against each course's requisites and 2025
// semesters (src/lib/requisite-data.ts). Pure, like semester.ts. It warns
// rather than refuses: a student may have an equivalent from elsewhere, or a
// permission code, and Programs and Courses leaves room for both.

import { REQUISITES, type Requirement, type Requisites } from "./requisite-data";
import { followingSemester } from "./semester";

export type PlannedCourse = {
  code: string;
  subject: string;
  level: number;
  units: number;
  /** Completed only once every semester of it is. */
  status: "completed" | "planned";
  /** The semester it starts in, or null if not yet scheduled. */
  semester: string | null;
  /** Runs over two consecutive semesters (COMP8715). */
  twoSemester: boolean;
};

export type Warning = {
  /** prerequisite, corequisite, incompatible and offering are problems
   *  with the plan; note is something the planner can't check. */
  kind: "prerequisite" | "corequisite" | "incompatible" | "offering" | "note";
  text: string;
};

/** When a course is behind the student: "done" for a completed course with
 *  no semester recorded, its last semester if scheduled, null if not. */
function finishes(course: PlannedCourse): string | "done" | null {
  if (course.semester === null) return course.status === "completed" ? "done" : null;
  return course.twoSemester ? (followingSemester(course.semester) ?? course.semester) : course.semester;
}

function met(
  requirement: Requirement,
  plan: PlannedCourse[],
  counts: (course: PlannedCourse) => boolean,
): boolean {
  if (typeof requirement === "string") {
    const course = plan.find((c) => c.code === requirement);
    return course !== undefined && counts(course);
  }
  if ("all" in requirement) return requirement.all.every((r) => met(r, plan, counts));
  if ("any" in requirement) return requirement.any.some((r) => met(r, plan, counts));
  const units = plan
    .filter((c) => c.subject === requirement.subject && c.level === requirement.level && counts(c))
    .reduce((sum, c) => sum + c.units, 0);
  return units >= requirement.units;
}

/** The part of a requisite still missing: for "all of these", just the ones
 *  not yet met, so a warning names what's actually left to do. */
function missing(
  requirement: Requirement,
  plan: PlannedCourse[],
  counts: (course: PlannedCourse) => boolean,
): Requirement {
  if (typeof requirement === "object" && "all" in requirement) {
    const left = requirement.all.filter((r) => !met(r, plan, counts));
    return left.length === 1 ? left[0] : { all: left };
  }
  return requirement;
}

/** A requisite in words: "COMP6442 and COMP8260", "COMP6670, or COMP6710 +
 *  COMP8410 + STAT6039", "12 units of 6000-level COMP". */
export function describe(requirement: Requirement, nested = false): string {
  if (typeof requirement === "string") return requirement;
  if ("units" in requirement) {
    return `${requirement.units} units of ${requirement.level}-level ${requirement.subject}`;
  }
  if ("all" in requirement) {
    const parts = requirement.all.map((r) => describe(r, true));
    return nested ? parts.join(" + ") : joinWords(parts, "and");
  }
  const parts = requirement.any.map((r) => describe(r, true));
  const text = joinWords(parts, "or");
  return nested ? `(${text})` : requirement.any.length > 1 ? `one of ${text}` : text;
}

function joinWords(parts: string[], word: string): string {
  return parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`;
}

const SEMESTER_NAME = { 1: "First Semester", 2: "Second Semester" } as const;

/** Every warning for every course in the plan, by course code. A course
 *  already completed isn't second-guessed on its prerequisites or semester:
 *  it happened. */
export function requisiteWarnings(
  plan: PlannedCourse[],
  data: Record<string, Requisites> = REQUISITES,
): Map<string, Warning[]> {
  const warnings = new Map<string, Warning[]>();
  for (const course of plan) {
    const rules = data[course.code];
    if (!rules) continue;
    const list: Warning[] = [];
    const others = plan.filter((c) => c.code !== course.code);

    if (course.status === "planned" && course.semester !== null) {
      const start = course.semester;
      if (rules.prerequisite) {
        const earlier = (c: PlannedCourse) => {
          const end = finishes(c);
          return end === "done" || (end !== null && end < start);
        };
        if (!met(rules.prerequisite, others, earlier)) {
          const left = missing(rules.prerequisite, others, earlier);
          list.push({ kind: "prerequisite", text: `Needs ${describe(left)} in an earlier semester.` });
        }
      }
      if (rules.corequisite) {
        const byNow = (c: PlannedCourse) =>
          finishes(c) === "done" || (c.semester !== null && c.semester <= start);
        if (!met(rules.corequisite, others, byNow)) {
          const left = missing(rules.corequisite, others, byNow);
          list.push({
            kind: "corequisite",
            text: `Needs ${describe(left)} in an earlier semester or the same one.`,
          });
        }
      }
      const semesterNumber = Number(start.slice(-1)) as 1 | 2;
      if (rules.offered2025 !== null) {
        if (rules.offered2025.length === 0) {
          list.push({ kind: "offering", text: "Not offered at all in 2025." });
        } else if (!rules.offered2025.includes(semesterNumber)) {
          const only = rules.offered2025.map((n) => SEMESTER_NAME[n]).join(" and ");
          list.push({ kind: "offering", text: `In 2025 this ran in ${only} only.` });
        }
      }
    }

    for (const code of rules.incompatible ?? []) {
      if (others.some((c) => c.code === code)) {
        list.push({ kind: "incompatible", text: `Can't be taken as well as ${code}.` });
      }
    }
    if (rules.note && course.status === "planned") list.push({ kind: "note", text: rules.note });

    if (list.length > 0) warnings.set(course.code, list);
  }
  return warnings;
}
