import { describe, expect, it } from "vitest";
import {
  type PlanEntry,
  type PoolRow,
  type RequirementProgress,
  evaluatePlan,
  resolvePool,
} from "../src/lib/progress";
import type { Course, Requirement } from "../src/lib/schema";
import {
  COURSES,
  REQUIREMENTS,
  SPECIALISATIONS,
  levelOf,
  subjectOf,
} from "../src/lib/seed-data";

// These tests drive the engine with the REAL seeded MCOMP rules, not toy
// fixtures, so they check the degree as modelled and not merely the
// mechanism. The engine is pure, so none of this needs the database or the
// server.
//
// Ids are assigned here the way the seed's natural keys would resolve them;
// the engine only ever compares ids it was given.

const courses: Course[] = COURSES.map((course, index) => ({
  id: index + 1,
  code: course.code,
  title: course.title,
  units: course.units,
  subject: subjectOf(course.code),
  level: levelOf(course.code),
}));

const specialisationId = new Map(
  SPECIALISATIONS.map((specialisation, index) => [specialisation.slug, index + 1] as const),
);
const PCOM = specialisationId.get("professional-computing") ?? 0;
const UNMODELLED = specialisationId.get("machine-learning") ?? 0;

const requirements: Requirement[] = REQUIREMENTS.map((requirement, index) => ({
  id: index + 1,
  key: requirement.key,
  label: requirement.label,
  detail: requirement.detail,
  kind: requirement.kind ?? "allocating",
  requiredUnits: requirement.requiredUnits,
  sortOrder: requirement.sortOrder,
  subjects: requirement.subjects ?? null,
  minLevel: requirement.minLevel ?? null,
  maxLevel: requirement.maxLevel ?? null,
  specialisationId:
    requirement.specialisation === undefined
      ? null
      : (specialisationId.get(requirement.specialisation) ?? null),
}));

function courseId(code: string): number {
  const found = courses.find((course) => course.code === code);
  if (!found) throw new Error(`${code} is not in the seeded catalogue`);
  return found.id;
}

function requirementByKey(key: string): Requirement {
  const found = requirements.find((requirement) => requirement.key === key);
  if (!found) throw new Error(`no seeded requirement "${key}"`);
  return found;
}

const pools: PoolRow[] = REQUIREMENTS.flatMap((requirement, index) => [
  ...(requirement.include ?? []).map((code) => ({
    requirementId: index + 1,
    courseId: courseId(code),
    role: "include" as const,
  })),
  ...(requirement.exclude ?? []).map((code) => ({
    requirementId: index + 1,
    courseId: courseId(code),
    role: "exclude" as const,
  })),
]);

/** A plan, written as course codes. Anything not marked is completed. */
function plan(...entries: (string | [string, "completed" | "planned"])[]): PlanEntry[] {
  return entries.map((entry) => {
    const [code, status] = typeof entry === "string" ? [entry, "completed" as const] : entry;
    return { courseId: courseId(code), status };
  });
}

/** Evaluate a plan and index the requirements by key. */
function run(entries: PlanEntry[], declared: number | null = null) {
  const result = evaluatePlan(courses, requirements, pools, entries, declared);
  const byKey = new Map(result.requirements.map((r) => [r.key, r]));
  return {
    ...result,
    has: (key: string) => byKey.has(key),
    keys: () => [...byKey.keys()],
    get(key: string): RequirementProgress {
      const found = byKey.get(key);
      if (!found) throw new Error(`no requirement "${key}" in the result`);
      return found;
    },
  };
}

const CORE = ["COMP6250", "COMP6442", "COMP6710", "COMP8260"];
const EIGHT_THOUSANDS = ["COMP8600", "COMP8620", "COMP8650", "COMP8410", "COMP8430"];

describe("the seeded MCOMP rules are internally consistent", () => {
  it("names only courses that exist in the catalogue", () => {
    for (const requirement of REQUIREMENTS) {
      for (const code of [...(requirement.include ?? []), ...(requirement.exclude ?? [])]) {
        expect(() => courseId(code), `${requirement.key} names ${code}`).not.toThrow();
      }
    }
  });

  it("gives the compulsory core a pool worth exactly what it requires", () => {
    // This is what makes "take all four of these" fall out of the generic
    // "N units from a pool" mechanism with no special case for it.
    const core = requirementByKey("mcomp-core");
    const pool = resolvePool(core, courses, pools);
    const poolUnits = courses
      .filter((course) => pool.has(course.id))
      .reduce((sum, course) => sum + course.units, 0);
    expect(poolUnits).toBe(core.requiredUnits);
  });

  it("gives the either/or rules a pool worth more than they require", () => {
    for (const key of ["mcomp-foundational", "mcomp-project"]) {
      const requirement = requirementByKey(key);
      const pool = resolvePool(requirement, courses, pools);
      const poolUnits = courses
        .filter((course) => pool.has(course.id))
        .reduce((sum, course) => sum + course.units, 0);
      expect(poolUnits, key).toBeGreaterThan(requirement.requiredUnits);
    }
  });

  it("leaves the 8000-level COMP floor reachable without project courses", () => {
    const requirement = requirementByKey("mcomp-min-8000-comp");
    const pool = resolvePool(requirement, courses, pools);
    const nonProjectUnits = courses
      .filter((course) => pool.has(course.id))
      .filter((course) => !["COMP8715", "COMP8830", "COMP8800"].includes(course.code))
      .reduce((sum, course) => sum + course.units, 0);
    expect(nonProjectUnits).toBeGreaterThanOrEqual(requirement.requiredUnits);
  });

  it("marks one total rule, and one floor per scope", () => {
    expect(requirements.filter((r) => r.kind === "total")).toHaveLength(1);
    // One floor across the degree, plus one inside each modelled
    // specialisation — the two are read differently, see the scoping tests.
    const floors = requirements.filter((r) => r.kind === "floor");
    expect(floors.filter((r) => r.specialisationId === null)).toHaveLength(1);
    expect(floors.filter((r) => r.specialisationId !== null)).toHaveLength(
      SPECIALISATIONS.filter((specialisation) => specialisation.modelled).length,
    );
  });

  it("gives every modelled specialisation exactly 24 units of allocating rules", () => {
    for (const specialisation of SPECIALISATIONS.filter((s) => s.modelled)) {
      const id = specialisationId.get(specialisation.slug);
      const units = requirements
        .filter((r) => r.specialisationId === id && r.kind === "allocating")
        .reduce((sum, r) => sum + r.requiredUnits, 0);
      expect(units, specialisation.slug).toBe(24);
    }
  });

  it("seeds no rules for a specialisation it admits it has not modelled", () => {
    for (const specialisation of SPECIALISATIONS.filter((s) => !s.modelled)) {
      const id = specialisationId.get(specialisation.slug);
      expect(
        requirements.filter((r) => r.specialisationId === id),
        specialisation.slug,
      ).toHaveLength(0);
    }
  });
});

describe("allocation — a course is spent once", () => {
  it("does not let core courses also fill the open elective bucket", () => {
    // The whole reason `kind` exists. Under coverage semantics the elective
    // rule ("any course offered by ANU") would read 12/12 satisfied here.
    const result = run(plan("COMP6250", "COMP6442"));
    expect(result.get("mcomp-core").completedUnits).toBe(12);
    expect(result.get("mcomp-electives").completedUnits).toBe(0);
    expect(result.get("mcomp-electives").satisfied).toBe(false);
  });

  it("still reports what the elective pool could have accepted", () => {
    // countedUnits is what it earns; poolMatchedUnits is what it can see.
    // The gap is precisely the units spent elsewhere, which is how the UI
    // can say "you have these, but they're counting toward core".
    const result = run(plan("COMP6250", "COMP6442"));
    const electives = result.get("mcomp-electives");
    expect(electives.countedUnits).toBe(0);
    expect(electives.poolMatchedUnits).toBe(12);
    expect(electives.poolMatchedCodes).toEqual(["COMP6250", "COMP6442"]);
  });

  it("gives the tightest pool first claim on a contested course", () => {
    // MATH6005 is the only course here that the foundational rule accepts,
    // while the elective rule would take anything. Most-restrictive-first
    // is what stops electives eating it.
    const result = run(plan("MATH6005"));
    expect(result.get("mcomp-foundational").countedCodes).toEqual(["MATH6005"]);
    expect(result.get("mcomp-electives").countedUnits).toBe(0);
  });

  it("assigns a course to exactly one allocating rule", () => {
    const result = run(plan(...CORE, "MATH6005", "COMP8715", ...EIGHT_THOUSANDS));
    const allocated = result.requirements
      .filter((r) => r.kind === "allocating")
      .flatMap((r) => r.countedCodes);
    expect(allocated).toHaveLength(new Set(allocated).size);
  });

  it("reports leftover units as surplus rather than crediting them twice", () => {
    // The allocating buckets are worth 72 units until the 24-unit
    // specialisation lands, so a 96-unit plan must show 24 units of surplus.
    const entries = plan(
      ...CORE, "MATH6005", "COMP8715", ...EIGHT_THOUSANDS,
      "COMP6120", "ENGN8100", "COMP6240", "COMP6331",
    );
    const result = run(entries);
    expect(result.totalUnits).toBe(96);
    const allocatingUnits = result.requirements
      .filter((r) => r.kind === "allocating")
      .reduce((sum, r) => sum + r.countedUnits, 0);
    expect(allocatingUnits).toBe(72);
    expect(result.surplusUnits).toBe(24);
  });

  it("never splits a course across two buckets", () => {
    const result = run(plan("COMP8715"));
    // 12-unit capstone against a 12-unit project rule: all or nothing.
    expect(result.get("mcomp-project").countedUnits).toBe(12);
    expect(result.surplusUnits).toBe(0);
  });
});

describe("floors and totals overlap on purpose", () => {
  it("counts a capstone toward the project rule and the 8000-level floor at once", () => {
    // Not double-counting in the bad sense: the floor is a minimum across
    // the whole degree, not a separate allocation of units.
    const result = run(plan("COMP8715"));
    expect(result.get("mcomp-project").completedUnits).toBe(12);
    expect(result.get("mcomp-min-8000-comp").completedUnits).toBe(12);
    expect(result.get("mcomp-total").completedUnits).toBe(12);
    expect(result.get("mcomp-core").completedUnits).toBe(0);
  });

  it("counts surplus units toward the total and the floor", () => {
    const result = run(plan(...CORE, "MATH6005", "COMP8715", ...EIGHT_THOUSANDS,
      "COMP6120", "ENGN8100", "COMP6240", "COMP6331"));
    expect(result.surplusUnits).toBe(24);
    // Surplus still contributes to the degree's size.
    expect(result.get("mcomp-total").completedUnits).toBe(96);
  });
});

describe("explicit pools", () => {
  it("counts the four core courses and satisfies the core", () => {
    const result = run(plan(...CORE));
    expect(result.get("mcomp-core").completedUnits).toBe(24);
    expect(result.get("mcomp-core").satisfied).toBe(true);
    expect(result.get("mcomp-core").exceeded).toBe(false);
  });

  it("ignores a course outside the pool", () => {
    // COMP8600 is a real 8000-level COMP course, but it is not core.
    const result = run(plan("COMP6250", "COMP8600"));
    expect(result.get("mcomp-core").completedUnits).toBe(6);
    expect(result.get("mcomp-core").countedCodes).toEqual(["COMP6250"]);
  });

  it("is not satisfied by three of the four core courses", () => {
    const result = run(plan("COMP6250", "COMP6442", "COMP6710"));
    expect(result.get("mcomp-core").completedUnits).toBe(18);
    expect(result.get("mcomp-core").satisfied).toBe(false);
    expect(result.get("mcomp-core").onTrack).toBe(false);
  });

  it("treats the foundational rule as either/or", () => {
    for (const code of ["MATH6005", "COMP6260"]) {
      expect(run(plan(code)).get("mcomp-foundational").satisfied, code).toBe(true);
    }
  });
});

describe("filter pools", () => {
  it("counts an 8000-level COMP course toward the floor", () => {
    expect(run(plan("COMP8715")).get("mcomp-min-8000-comp").completedUnits).toBe(12);
  });

  it("does not count a 6000-level COMP course toward it", () => {
    expect(run(plan("COMP6710")).get("mcomp-min-8000-comp").completedUnits).toBe(0);
  });

  it("does not count an 8000-level course from another subject area", () => {
    // ENGN8100 is 8000-level but not COMP — the rule names both dimensions,
    // so a filter on level alone would wrongly accept this.
    expect(run(plan("ENGN8100")).get("mcomp-min-8000-comp").completedUnits).toBe(0);
  });

  it("accepts COMP and ENGN for further computing, and nothing else", () => {
    // Read poolMatchedUnits, not countedUnits: a tighter allocating rule may
    // legitimately have claimed the course first.
    expect(run(plan("COMP6710")).get("mcomp-further-computing").poolMatchedUnits).toBe(6);
    expect(run(plan("ENGN8100")).get("mcomp-further-computing").poolMatchedUnits).toBe(6);
    // MGMT7020 sits inside the 6000-8999 window but the wrong subject.
    expect(run(plan("MGMT7020")).get("mcomp-further-computing").poolMatchedUnits).toBe(0);
    expect(run(plan("LAWS8445")).get("mcomp-further-computing").poolMatchedUnits).toBe(0);
  });
});

describe("completed versus planned", () => {
  it("separates the two and only satisfies on completed units", () => {
    const result = run(plan("COMP6250", "COMP6442", ["COMP6710", "planned"], ["COMP8260", "planned"]));
    const core = result.get("mcomp-core");
    expect(core.completedUnits).toBe(12);
    expect(core.plannedUnits).toBe(12);
    expect(core.countedUnits).toBe(24);
    expect(core.satisfied).toBe(false);
    expect(core.onTrack).toBe(true);
  });

  it("credits completed courses before planned ones", () => {
    // Only one of these can fill the 6-unit foundational rule, and the
    // completed one must win or the rule understates real progress.
    // COMP6260 is deliberately the PLANNED one here: it sorts first
    // alphabetically, so a version that ignored status would pick it and
    // this test would catch that rather than passing by luck.
    const result = run(plan(["COMP6260", "planned"], "MATH6005"));
    expect(result.get("mcomp-foundational").countedCodes).toEqual(["MATH6005"]);
    expect(result.get("mcomp-foundational").completedUnits).toBe(6);
    expect(result.get("mcomp-foundational").satisfied).toBe(true);
  });
});

describe("the 96-unit total", () => {
  const full = [...CORE, "MATH6005", "COMP8715", ...EIGHT_THOUSANDS,
    "COMP6120", "ENGN8100", "COMP6240", "COMP6331"];

  it("counts every course regardless of subject or level", () => {
    expect(run(plan("COMP6250", "MGMT7020", "LAWS8445")).get("mcomp-total").completedUnits).toBe(18);
  });

  it("is not exceeded by a plan of exactly 96 units", () => {
    const result = run(plan(...full)).get("mcomp-total");
    expect(result.completedUnits).toBe(96);
    expect(result.onTrack).toBe(true);
    expect(result.exceeded).toBe(false);
    expect(result.excessUnits).toBe(0);
  });

  it("reports the excess when a plan goes over 96 units", () => {
    const result = run(plan(...full, "COMP6390")).get("mcomp-total");
    expect(result.completedUnits).toBe(102);
    expect(result.exceeded).toBe(true);
    expect(result.excessUnits).toBe(6);
  });
});

describe("exclusions", () => {
  // The Professional Computing specialisation's last 6 units are "any 8000
  // level COMP coded course excluding project courses". Those requirements
  // arrive with the specialisation migration, so this mirrors the rule
  // against the same catalogue to prove the mechanism `role` exists for.
  const anyEightThousandComp: Requirement = {
    id: 900,
    key: "pcom-8000-comp",
    label: "Any 8000-level COMP, excluding project courses",
    detail: null,
    kind: "allocating",
    requiredUnits: 6,
    sortOrder: 900,
    subjects: "COMP",
    minLevel: 8000,
    maxLevel: 8999,
    specialisationId: null,
  };
  const exclusions: PoolRow[] = ["COMP8715", "COMP8800", "COMP8830"].map((code) => ({
    requirementId: 900,
    courseId: courseId(code),
    role: "exclude" as const,
  }));

  const only = (rule: Requirement, rows: PoolRow[], entries: PlanEntry[]) =>
    evaluatePlan(courses, [rule], rows, entries).requirements[0];

  it("subtracts the excluded courses from a filter pool", () => {
    const result = only(anyEightThousandComp, exclusions, plan("COMP8830"));
    expect(result?.countedUnits).toBe(0);
    expect(result?.countedCodes).toEqual([]);
  });

  it("still accepts a non-excluded course from the same pool", () => {
    const result = only(anyEightThousandComp, exclusions, plan("COMP8600"));
    expect(result?.completedUnits).toBe(6);
    expect(result?.satisfied).toBe(true);
  });

  it("shrinks the pool by exactly the excluded courses", () => {
    const without = resolvePool(anyEightThousandComp, courses, exclusions);
    const unrestricted = resolvePool(anyEightThousandComp, courses, []);
    expect(unrestricted.size - without.size).toBe(3);
  });

  it("prefers a smaller course over one that would overshoot", () => {
    // A 6-unit rule whose pool holds both a 6-unit and a 12-unit course.
    // Taking the 12-unit course would satisfy the rule while overshooting
    // by 6 units and burning a capstone the project rule may need. No real
    // MCOMP bucket pits these against each other, hence the fixture.
    const sixUnitRule: Requirement = {
      ...anyEightThousandComp,
      id: 902,
      key: "fixture-six-units",
      requiredUnits: 6,
    };
    const result = only(
      sixUnitRule,
      ["COMP8800", "COMP8600"].map((code) => ({
        requirementId: 902,
        courseId: courseId(code),
        role: "include" as const,
      })),
      plan("COMP8800", "COMP8600"),
    );
    expect(result?.countedCodes).toEqual(["COMP8600"]);
    expect(result?.countedUnits).toBe(6);
    expect(result?.exceeded).toBe(false);
  });

  it("lets an explicit include list override a filter", () => {
    const rule = { ...anyEightThousandComp, id: 901 };
    const result = only(
      rule,
      [{ requirementId: 901, courseId: courseId("COMP6710"), role: "include" }],
      plan("COMP6710", "COMP8600"),
    );
    // COMP6710 is 6000-level, so the filter alone would reject it; the
    // explicit pool wins, and COMP8600 falls out of scope.
    expect(result?.completedUnits).toBe(6);
    expect(result?.countedCodes).toEqual(["COMP6710"]);
  });
});


describe("specialisations", () => {
  const PCOM_PLAN = ["COMP6120", "ENGN8100", "COMP6240", "COMP8600"];

  it("hides a specialisation's rules until it is declared", () => {
    const undeclared = run(plan("COMP6120"));
    expect(undeclared.has("pcom-core")).toBe(false);
    expect(undeclared.specialisationModelled).toBe(false);
    // The program-level rules are all still there.
    expect(undeclared.has("mcomp-core")).toBe(true);
  });

  it("shows them once it is declared", () => {
    const declared = run(plan("COMP6120"), PCOM);
    expect(declared.has("pcom-core")).toBe(true);
    expect(declared.has("pcom-elective")).toBe(true);
    expect(declared.has("pcom-8000-comp")).toBe(true);
    expect(declared.has("pcom-min-8000")).toBe(true);
    expect(declared.specialisationModelled).toBe(true);
  });

  it("reports an unmodelled specialisation as declared but ruleless", () => {
    // Six of the seven could not be sourced. Declaring one must not look
    // like a modelled specialisation with nothing done.
    const result = run(plan("COMP6120"), UNMODELLED);
    expect(result.specialisationModelled).toBe(false);
    expect(result.keys().every((key) => !key.startsWith("pcom-"))).toBe(true);
  });

  it("brings the degree's allocating rules to exactly 96 units once declared", () => {
    // 72 units of program rules + 24 of specialisation. This is the sum the
    // generic "24 units from a specialisation" bucket used to stand in for.
    const declared = run([], PCOM);
    const allocating = declared.requirements
      .filter((r) => r.kind === "allocating")
      .reduce((sum, r) => sum + r.requiredUnits, 0);
    expect(allocating).toBe(96);
  });

  it("credits the specialisation's own rules", () => {
    const result = run(plan(...PCOM_PLAN), PCOM);
    expect(result.get("pcom-core").completedUnits).toBe(12);
    expect(result.get("pcom-elective").completedUnits).toBe(6);
    expect(result.get("pcom-8000-comp").completedUnits).toBe(6);
  });

  it("excludes the project courses from the specialisation's 8000-level COMP rule", () => {
    // "any 8000 level COMP coded course excluding COMP8715, COMP8800 and
    // COMP8830" — the rule the exclude role exists for.
    expect(run(plan("COMP8830"), PCOM).get("pcom-8000-comp").countedUnits).toBe(0);
    expect(run(plan("COMP8800"), PCOM).get("pcom-8000-comp").countedUnits).toBe(0);
    expect(run(plan("COMP8600"), PCOM).get("pcom-8000-comp").completedUnits).toBe(6);
  });

  it("scopes the specialisation's 8000-level floor to its own courses", () => {
    // ENGN8100 (credited to pcom-core) and COMP8600 (to pcom-8000-comp) are
    // both 8000-level, so the floor is exactly met.
    const result = run(plan(...PCOM_PLAN), PCOM);
    expect(result.get("pcom-min-8000").countedUnits).toBe(12);
    expect(result.get("pcom-min-8000").satisfied).toBe(true);
  });

  it("does not let an 8000-level core course count toward that floor", () => {
    // COMP8260 is 8000-level and compulsory, but it belongs to the program's
    // core, not to the specialisation's 24 units. A degree-wide floor would
    // wrongly count it; this one is scoped.
    const withCore = run(plan(...PCOM_PLAN, "COMP8260"), PCOM);
    expect(withCore.get("mcomp-core").countedCodes).toContain("COMP8260");
    expect(withCore.get("pcom-min-8000").countedUnits).toBe(12);
    expect(withCore.get("pcom-min-8000").countedCodes).toEqual(["COMP8600", "ENGN8100"]);
  });

  it("still counts that core course toward the degree-wide 8000-level floor", () => {
    // The contrast: the program's floor is not scoped, so it takes both.
    const result = run(plan(...PCOM_PLAN, "COMP8260"), PCOM);
    expect(result.get("mcomp-min-8000-comp").countedCodes).toEqual(["COMP8260", "COMP8600"]);
  });
});

describe("evaluatePlan", () => {
  it("returns the program's requirements in display order when nothing is declared", () => {
    const programRules = REQUIREMENTS.filter((r) => r.specialisation === undefined);
    const result = run(plan("COMP6250"));
    expect(result.requirements).toHaveLength(programRules.length);
    expect(result.requirements.map((r) => r.key)).toEqual(
      [...programRules].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.key),
    );
  });

  it("returns the program's and the specialisation's once one is declared", () => {
    const result = run(plan("COMP6250"), PCOM);
    expect(result.requirements).toHaveLength(REQUIREMENTS.length);
    expect(result.requirements.map((r) => r.key)).toEqual(
      [...REQUIREMENTS].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.key),
    );
  });

  it("reports an empty plan as nothing satisfied and nothing surplus", () => {
    const result = run([]);
    expect(result.requirements.every((r) => r.countedUnits === 0)).toBe(true);
    expect(result.requirements.some((r) => r.satisfied)).toBe(false);
    expect(result.totalUnits).toBe(0);
    expect(result.surplusUnits).toBe(0);
  });

  it("ignores a plan row pointing outside the catalogue", () => {
    const result = evaluatePlan(courses, requirements, pools, [
      { courseId: 99_999, status: "completed" },
    ]);
    expect(result.totalUnits).toBe(0);
  });
});
