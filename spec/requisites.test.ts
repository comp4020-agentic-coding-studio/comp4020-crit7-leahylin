import { describe, expect, it } from "vitest";
import { REQUISITES, type Requirement } from "../src/lib/requisite-data";
import { type PlannedCourse, describe as say, requisiteWarnings } from "../src/lib/requisites";
import { COURSES, TWO_SEMESTER_COURSES, levelOf, subjectOf } from "../src/lib/seed-data";

// Pure module, run against the real transcribed data, so these check the
// degree as modelled, not just the mechanism.

const unitsOf = new Map(COURSES.map((c) => [c.code, c.units]));
function at(code: string, semester: string | null, status: PlannedCourse["status"] = "planned"): PlannedCourse {
  return {
    code,
    subject: subjectOf(code),
    level: levelOf(code),
    units: unitsOf.get(code) ?? 6,
    status,
    semester,
    twoSemester: TWO_SEMESTER_COURSES.has(code),
  };
}
const kinds = (plan: PlannedCourse[], code: string) =>
  (requisiteWarnings(plan).get(code) ?? []).map((w) => w.kind);
const texts = (plan: PlannedCourse[], code: string) =>
  (requisiteWarnings(plan).get(code) ?? []).map((w) => w.text);

describe("the transcribed requisites", () => {
  const catalogue = new Set(COURSES.map((c) => c.code));
  const named = (r: Requirement): string[] =>
    typeof r === "string" ? [r] : "all" in r ? r.all.flatMap(named) : "any" in r ? r.any.flatMap(named) : [];

  it("cover every course in the catalogue", () => {
    for (const code of catalogue) expect(REQUISITES[code], code).toBeDefined();
  });

  it("name only courses in the catalogue", () => {
    for (const [code, rules] of Object.entries(REQUISITES)) {
      const codes = [
        ...(rules.prerequisite ? named(rules.prerequisite) : []),
        ...(rules.corequisite ? named(rules.corequisite) : []),
        ...(rules.incompatible ?? []),
      ];
      for (const other of codes) expect(catalogue.has(other), `${code} names ${other}`).toBe(true);
    }
  });
});

describe("requisiteWarnings", () => {
  it("warns when COMP8715 comes before COMP8260, and not once it follows it", () => {
    const nothingYet = [at("COMP8715", "2025 Semester 2")];
    expect(texts(nothingYet, "COMP8715")).toContain("Needs COMP6442 and COMP8260 in an earlier semester.");
    // With COMP6442 already before it, only what's still missing is named.
    const early = [at("COMP6442", "2025 Semester 1"), at("COMP8715", "2025 Semester 2")];
    expect(texts(early, "COMP8715")).toContain("Needs COMP8260 in an earlier semester.");
    const inOrder = [
      at("COMP6442", "2025 Semester 1"),
      at("COMP8260", "2025 Semester 2"),
      at("COMP8715", "2026 Semester 1"),
    ];
    expect(kinds(inOrder, "COMP8715")).not.toContain("prerequisite");
  });

  it("doesn't count a prerequisite taken in the same semester", () => {
    const same = [at("COMP6710", "2025 Semester 1"), at("MATH6005", "2025 Semester 1"), at("COMP6442", "2025 Semester 1")];
    expect(kinds(same, "COMP6442")).toContain("prerequisite");
  });

  it("does count a corequisite taken in the same semester", () => {
    const plan = [at("COMP6710", "2025 Semester 1"), at("MATH6005", "2025 Semester 2"), at("COMP6442", "2025 Semester 2")];
    expect(kinds(plan, "COMP6442")).not.toContain("corequisite");
    const late = [at("COMP6710", "2025 Semester 1"), at("MATH6005", "2026 Semester 1"), at("COMP6442", "2025 Semester 2")];
    expect(kinds(late, "COMP6442")).toContain("corequisite");
  });

  it("counts a completed course with no semester as already done", () => {
    const plan = [at("COMP6710", null, "completed"), at("COMP6260", "2025 Semester 2"), at("COMP6442", "2025 Semester 2")];
    expect(kinds(plan, "COMP6442")).not.toContain("prerequisite");
  });

  it("counts a two-semester course as done only after its second semester", () => {
    // COMP8715 is no one's prerequisite here, so test the mechanism on a
    // synthetic rule: X needs COMP8715.
    const data = { ...REQUISITES, COMP8600: { prerequisite: "COMP8715", offered2025: [1, 2] as (1 | 2)[] } };
    const clash = [at("COMP8715", "2025 Semester 1"), at("COMP8600", "2025 Semester 2")];
    expect(requisiteWarnings(clash, data).get("COMP8600")?.map((w) => w.kind)).toContain("prerequisite");
    const after = [at("COMP8715", "2025 Semester 1"), at("COMP8600", "2026 Semester 1")];
    expect(requisiteWarnings(after, data).get("COMP8600")?.map((w) => w.kind) ?? []).not.toContain("prerequisite");
  });

  it("follows a nested either/or: COMP8600 needs COMP6670, or COMP6710 + COMP8410 + STAT6039", () => {
    const viaMl = [at("COMP6670", "2025 Semester 2"), at("COMP8600", "2026 Semester 1")];
    expect(kinds(viaMl, "COMP8600")).not.toContain("prerequisite");
    const halfOfOther = [at("COMP6710", "2025 Semester 1"), at("COMP8410", "2025 Semester 1"), at("COMP8600", "2026 Semester 1")];
    expect(texts(halfOfOther, "COMP8600")).toContain(
      "Needs one of COMP6670 or COMP6710 + COMP8410 + STAT6039 in an earlier semester.",
    );
  });

  it("counts units for '12 units of 6000-level COMP'", () => {
    const six = [at("COMP6710", "2025 Semester 1"), at("COMP8011", "2025 Semester 2")];
    expect(kinds(six, "COMP8011")).toContain("prerequisite");
    const twelve = [at("COMP6710", "2025 Semester 1"), at("COMP6250", "2025 Semester 1"), at("COMP8011", "2025 Semester 2")];
    expect(kinds(twelve, "COMP8011")).not.toContain("prerequisite");
    // 12 COMP units, but only 6 of them at 6000 level: not enough.
    const mixed = [at("COMP6710", "2025 Semester 1"), at("COMP8260", "2025 Semester 1"), at("COMP8011", "2025 Semester 2")];
    expect(kinds(mixed, "COMP8011")).toContain("prerequisite");
  });

  it("flags incompatible courses on both sides", () => {
    const both = [at("COMP8715", null), at("COMP8830", null)];
    expect(texts(both, "COMP8715")).toContain("Can't be taken as well as COMP8830.");
    expect(texts(both, "COMP8830")).toContain("Can't be taken as well as COMP8715.");
  });

  it("warns about a semester the course didn't run in, in 2025", () => {
    expect(texts([at("COMP8260", "2025 Semester 1")], "COMP8260")).toContain("In 2025 this ran in Second Semester only.");
    expect(kinds([at("COMP8260", "2025 Semester 2")], "COMP8260")).not.toContain("offering");
    expect(texts([at("COMP8691", "2026 Semester 1")], "COMP8691")).toContain("Not offered at all in 2025.");
    expect(texts([at("COMP8691", "2026 Semester 2")], "COMP8691").join(" ")).toContain("Second Semester 2026");
  });

  it("doesn't second-guess a completed course, but still shows an incompatibility", () => {
    const done = [at("COMP8260", "2025 Semester 1", "completed"), at("COMP8715", "2025 Semester 1", "completed"), at("COMP8830", null, "completed")];
    expect(kinds(done, "COMP8260")).toEqual([]);
    expect(kinds(done, "COMP8715")).toEqual(["incompatible"]);
  });

  it("shows what can't be checked as a note, on a planned course", () => {
    expect(kinds([at("ENGN8100", "2025 Semester 1")], "ENGN8100")).toEqual(["note"]);
  });

  it("says nothing about an unscheduled course's order", () => {
    expect(kinds([at("COMP8715", null)], "COMP8715")).toEqual(["note"]);
  });
});

describe("describe", () => {
  it("reads requisites the way a person would", () => {
    expect(say({ all: ["COMP6442", "COMP8260"] })).toBe("COMP6442 and COMP8260");
    expect(say({ any: ["COMP6390", "COMP6720"] })).toBe("one of COMP6390 or COMP6720");
    expect(say({ units: 12, subject: "COMP", level: 6000 })).toBe("12 units of 6000-level COMP");
  });
});
