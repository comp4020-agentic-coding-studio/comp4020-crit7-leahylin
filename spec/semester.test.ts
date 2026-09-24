import { describe, expect, it } from "vitest";
import {
  type ChosenItem,
  semesterOptions,
  studyPlanBySemester,
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
  it("generates two semesters a year for four years from a fixed date", () => {
    expect(semesterOptions(new Date("2026-03-01"))).toEqual([
      "2026 Semester 1", "2026 Semester 2",
      "2027 Semester 1", "2027 Semester 2",
      "2028 Semester 1", "2028 Semester 2",
      "2029 Semester 1", "2029 Semester 2",
    ]);
  });

  it("starts from whatever year 'now' is, not a hardcoded one", () => {
    expect(semesterOptions(new Date("2031-11-01"))[0]).toBe("2031 Semester 1");
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
