import { describe, expect, it } from "vitest";
import {
  type ChosenItem,
  canStartIn,
  everySemester,
  followingSemester,
  semestersBetween,
  shiftSemester,
  nextSemester,
  semesterUnits,
  semesterOptions,
  startSemesters,
  studyPlanBySemester,
  unitsPerSemester,
} from "../src/lib/semester";
import type { Course } from "../src/lib/schema";

// Pure module, no database — see the note in src/lib/semester.ts.

const course = (code: string, units = 6): Course => ({
  id: code.length, // irrelevant to these tests, just needs to exist
  code,
  title: code,
  units,
  subject: code.slice(0, 4),
  level: Number(code[4]) * 1000,
});

function item(code: string, semester: string | null, status: ChosenItem["status"] = "completed"): ChosenItem {
  return { course: course(code), status, semester };
}

describe("semesterOptions", () => {
  it("offers the two-year MCOMP's four semesters for a 2025 Semester 1 intake", () => {
    // Fixed, not generated from today's date — this models one cohort's
    // degree timeline, not an open-ended calendar, so a course can only be
    // filed under a semester that cohort's plan could actually span.
    expect(semesterOptions()).toEqual([
      "2025 Semester 1", "2025 Semester 2", "2026 Semester 1", "2026 Semester 2",
    ]);
  });
});

describe("studyPlanBySemester", () => {
  it("groups items by their semester", () => {
    const groups = studyPlanBySemester([
      item("COMP6250", "2026 Semester 1"),
      item("COMP6442", "2026 Semester 1"),
      item("COMP6710", "2026 Semester 2"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((i) => i.course.code)).toEqual(["COMP6250", "COMP6442"]);
    expect(groups[1].items.map((i) => i.course.code)).toEqual(["COMP6710"]);
  });

  it("orders scheduled groups chronologically, not by insertion or alphabetically", () => {
    // Deliberately fed out of order and with year-rollover in the mix, so a
    // version that dropped the sort — or sorted insertion order, or sorted
    // only within a year — would be caught rather than pass by coincidence.
    const groups = studyPlanBySemester([
      item("A", "2027 Semester 1"),
      item("B", "2026 Semester 2"),
      item("C", "2026 Semester 1"),
      item("D", "2028 Semester 1"),
    ]);
    expect(groups.map((g) => g.semester)).toEqual([
      "2026 Semester 1", "2026 Semester 2", "2027 Semester 1", "2028 Semester 1",
    ]);
  });

  it("puts the unscheduled group last, after every real semester", () => {
    const groups = studyPlanBySemester([
      item("A", null),
      item("B", "2026 Semester 1"),
    ]);
    expect(groups.map((g) => g.semester)).toEqual(["2026 Semester 1", null]);
  });

  it("produces no group at all for a semester with nothing in it", () => {
    const groups = studyPlanBySemester([item("A", "2026 Semester 1")]);
    expect(groups.some((g) => g.semester === "2027 Semester 1")).toBe(false);
  });

  it("returns nothing for an empty plan", () => {
    expect(studyPlanBySemester([])).toEqual([]);
  });
});

// COMP8715 is the real two-semester course (6+6); COMP8830 is the real
// single-semester 12-unit one it's easiest to confuse it with.
describe("a two-semester course (COMP8715)", () => {
  const project = { course: course("COMP8715", 12), status: "planned" as const };
  const internship = { course: course("COMP8830", 12), status: "planned" as const };

  it("appears in the semester it starts in and the one after, 6 units in each", () => {
    const groups = studyPlanBySemester([{ ...project, semester: "2025 Semester 1" }]);
    expect(groups.map((g) => [g.semester, g.items.map((i) => i.part)])).toEqual([
      ["2025 Semester 1", [1]],
      ["2025 Semester 2", [2]],
    ]);
    // Both rows remember where it starts, which is what the plan stores.
    expect(groups.flatMap((g) => g.items.map((i) => i.semester))).toEqual([
      "2025 Semester 1", "2025 Semester 1",
    ]);
    expect(unitsPerSemester(project.course)).toBe(6);
  });

  it("carries across a year boundary", () => {
    const groups = studyPlanBySemester([{ ...project, semester: "2025 Semester 2" }]);
    expect(groups.map((g) => g.semester)).toEqual(["2025 Semester 2", "2026 Semester 1"]);
  });

  it("shows each semester's own status: the first done doesn't make the second done", () => {
    const groups = studyPlanBySemester([
      { ...project, status: "completed", secondStatus: "planned", semester: "2025 Semester 1" },
    ]);
    expect(groups.map((g) => [g.semester, g.items[0].status])).toEqual([
      ["2025 Semester 1", "completed"],
      ["2025 Semester 2", "planned"],
    ]);
  });

  it("stays one row while it isn't scheduled", () => {
    const groups = studyPlanBySemester([{ ...project, semester: null }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items[0].part).toBeUndefined();
  });

  it("leaves a one-semester 12-unit course (COMP8830) in one semester, 12 units", () => {
    const groups = studyPlanBySemester([{ ...internship, semester: "2025 Semester 1" }]);
    expect(groups.map((g) => g.semester)).toEqual(["2025 Semester 1"]);
    expect(groups[0].items[0].part).toBeUndefined();
    expect(unitsPerSemester(internship.course)).toBe(12);
  });

  it("sorts a continuing course in among that semester's others by code", () => {
    const groups = studyPlanBySemester([
      { ...project, semester: "2025 Semester 1" },
      item("COMP6250", "2025 Semester 2"),
      item("COMP8600", "2025 Semester 2"),
    ]);
    const second = groups.find((g) => g.semester === "2025 Semester 2");
    expect(second?.items.map((i) => i.course.code)).toEqual(["COMP6250", "COMP8600", "COMP8715"]);
  });

  it("can't start in the plan's last semester, but can start in any other", () => {
    expect(nextSemester("2026 Semester 2")).toBeNull();
    expect(nextSemester("2025 Semester 2")).toBe("2026 Semester 1");
    expect(startSemesters(project.course)).toEqual([
      "2025 Semester 1", "2025 Semester 2", "2026 Semester 1",
    ]);
    expect(canStartIn(project.course, "2026 Semester 2")).toBe(false);
    expect(canStartIn(project.course, "2026 Semester 1")).toBe(true);
    expect(canStartIn(project.course, null)).toBe(true);
    // Every other course can go in any semester, the last one included.
    expect(startSemesters(internship.course)).toEqual(semesterOptions());
    expect(canStartIn(internship.course, "2026 Semester 2")).toBe(true);
  });
});

describe("everySemester and semesterUnits", () => {
  it("lists every semester in order, empty ones included, and unscheduled last only if used", () => {
    const listed = everySemester(studyPlanBySemester([item("COMP6250", "2026 Semester 1")]));
    expect(listed.map((g) => [g.semester, g.items.length])).toEqual([
      ["2025 Semester 1", 0], ["2025 Semester 2", 0],
      ["2026 Semester 1", 1], ["2026 Semester 2", 0],
    ]);
    const withLoose = everySemester(studyPlanBySemester([item("COMP6250", null)]));
    expect(withLoose.at(-1)?.semester).toBeNull();
    expect(withLoose).toHaveLength(5);
  });

  it("counts each half of a two-semester course at half its units", () => {
    const groups = studyPlanBySemester([
      { course: course("COMP8715", 12), status: "planned", semester: "2025 Semester 1" },
      item("COMP6250", "2025 Semester 1"),
    ]);
    expect(groups.map((g) => [g.semester, semesterUnits(g.items)])).toEqual([
      ["2025 Semester 1", 12],
      ["2025 Semester 2", 6],
    ]);
  });
});

describe("a plan's semesters follow its intake", () => {
  const project = course("COMP8715", 12);

  it("gives a Semester 1 intake 2025 S1 to 2026 S2, and a Semester 2 intake 2025 S2 to 2027 S1", () => {
    expect(semesterOptions("2025 Semester 1")).toEqual([
      "2025 Semester 1", "2025 Semester 2", "2026 Semester 1", "2026 Semester 2",
    ]);
    expect(semesterOptions("2025 Semester 2")).toEqual([
      "2025 Semester 2", "2026 Semester 1", "2026 Semester 2", "2027 Semester 1",
    ]);
    // No intake given is the Semester 1 intake, what older plans assumed.
    expect(semesterOptions()).toEqual(semesterOptions("2025 Semester 1"));
  });

  it("moves semester labels across year boundaries both ways", () => {
    expect(followingSemester("2025 Semester 2")).toBe("2026 Semester 1");
    expect(shiftSemester("2026 Semester 1", -1)).toBe("2025 Semester 2");
    expect(shiftSemester("2025 Semester 1", 3)).toBe("2026 Semester 2");
    expect(semestersBetween("2025 Semester 1", "2025 Semester 2")).toBe(1);
    expect(semestersBetween("2025 Semester 2", "2025 Semester 1")).toBe(-1);
    expect(shiftSemester("not a semester", 1)).toBeNull();
  });

  it("keeps COMP8715 out of the last semester of whichever span the plan has", () => {
    expect(canStartIn(project, "2027 Semester 1", "2025 Semester 2")).toBe(false);
    expect(canStartIn(project, "2026 Semester 2", "2025 Semester 2")).toBe(true);
    expect(canStartIn(project, "2026 Semester 2", "2025 Semester 1")).toBe(false);
  });

  it("refuses a semester outside the plan's span for any course", () => {
    const ordinary = course("COMP6250");
    expect(canStartIn(ordinary, "2025 Semester 1", "2025 Semester 2")).toBe(false);
    expect(canStartIn(ordinary, "2027 Semester 1", "2025 Semester 1")).toBe(false);
    expect(canStartIn(ordinary, "2027 Semester 1", "2025 Semester 2")).toBe(true);
  });

  it("still lists a course filed outside the span, in order, rather than dropping it", () => {
    const groups = everySemester(
      studyPlanBySemester([item("COMP6250", "2025 Semester 1")]),
      "2025 Semester 2",
    );
    expect(groups[0].semester).toBe("2025 Semester 1");
    expect(groups[0].items.map((i) => i.course.code)).toEqual(["COMP6250"]);
    expect(groups).toHaveLength(5);
  });

  it("lists every semester of the intake's span, empty or not", () => {
    expect(everySemester([], "2025 Semester 2").map((g) => g.semester)).toEqual(
      semesterOptions("2025 Semester 2"),
    );
  });
});
