import { describe, expect, it } from "vitest";
import { expectedGraduation } from "../src/lib/graduation";
import type { Course } from "../src/lib/schema";
import { type ChosenItem, studyPlanBySemester } from "../src/lib/semester";

// Pure module, no database — same reasoning as spec/semester.test.ts.

const course = (code: string, units = 6): Course => ({
  id: code.length + units,
  code,
  title: code,
  units,
  subject: code.slice(0, 4),
  level: Number(code[4]) * 1000,
});
const item = (code: string, semester: string | null, status: ChosenItem["status"] = "planned", units = 6): ChosenItem => ({
  course: course(code, units),
  status,
  semester,
});
const run = (items: ChosenItem[], onTrack = true, complete = false, intake = "2025 Semester 1") =>
  expectedGraduation({ complete, onTrack, groups: studyPlanBySemester(items), intake });

describe("expectedGraduation", () => {
  it("is the end of the last semester with a course in it, once the plan meets the degree", () => {
    expect(run([item("COMP6250", "2025 Semester 1", "completed"), item("COMP8600", "2026 Semester 1")]))
      .toEqual({ kind: "expected", semester: "2026 Semester 1" });
  });

  it("counts COMP8715's second semester as the last one it runs in", () => {
    expect(run([item("COMP6250", "2025 Semester 2"), item("COMP8715", "2026 Semester 1", "planned", 12)]))
      .toEqual({ kind: "expected", semester: "2026 Semester 2" });
  });

  it("isn't known while a course still to do has no semester, and says how much", () => {
    expect(run([item("COMP6250", "2025 Semester 2"), item("COMP8600", null), item("COMP8620", null)]))
      .toEqual({ kind: "unscheduled", unscheduledUnits: 12, atLeast: "2025 Semester 2" });
  });

  it("doesn't wait on a completed course that has no semester", () => {
    expect(run([item("COMP6250", null, "completed"), item("COMP8600", "2026 Semester 2")]))
      .toEqual({ kind: "expected", semester: "2026 Semester 2" });
  });

  it("isn't known while the plan doesn't meet the degree, and gives the standard end from the intake", () => {
    expect(run([item("COMP6250", "2025 Semester 1")], false))
      .toEqual({ kind: "incomplete", standardEnd: "2026 Semester 2" });
    expect(run([item("COMP6250", "2025 Semester 2")], false, false, "2025 Semester 2"))
      .toEqual({ kind: "incomplete", standardEnd: "2027 Semester 1" });
  });

  it("says complete once the degree is done", () => {
    expect(run([item("COMP6250", "2025 Semester 1", "completed")], true, true)).toEqual({ kind: "complete" });
  });
});
