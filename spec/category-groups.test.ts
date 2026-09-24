import { describe, expect, it } from "vitest";
import { type Foldable, foldSpecialisationFloors } from "../src/lib/category-groups";

// Pure module, no database — same reasoning as spec/semester.test.ts.

function req(key: string, kind: string): Foldable {
  return { key, kind };
}

describe("foldSpecialisationFloors", () => {
  it("folds a specialisation's floor into its umbrella bucket (the Machine Learning shape)", () => {
    const categories = [req("mchl-courses", "allocating"), req("mchl-min-8000", "floor")];
    const specialisationIdByKey = new Map([
      ["mchl-courses", 1],
      ["mchl-min-8000", 1],
    ]);

    const { visible, foldedInto } = foldSpecialisationFloors(categories, specialisationIdByKey);
    expect(visible.map((r) => r.key)).toEqual(["mchl-courses"]);
    expect(foldedInto.get("mchl-courses")?.map((r) => r.key)).toEqual(["mchl-min-8000"]);
  });

  it("folds every floor a specialisation has into the same umbrella (the Human-Centred shape)", () => {
    const categories = [
      req("hccm-courses", "allocating"),
      req("hccm-compulsory", "floor"),
      req("hccm-advanced", "floor"),
      req("hccm-creative", "cap"),
      req("hccm-min-8000", "floor"),
    ];
    const specialisationIdByKey = new Map(categories.map((r) => [r.key, 1]));

    const { visible, foldedInto } = foldSpecialisationFloors(categories, specialisationIdByKey);
    // The cap keeps its own section — it has a real, distinct pool of its
    // own to add from, unlike a floor.
    expect(visible.map((r) => r.key)).toEqual(["hccm-courses", "hccm-creative"]);
    expect(foldedInto.get("hccm-courses")?.map((r) => r.key)).toEqual([
      "hccm-compulsory", "hccm-advanced", "hccm-min-8000",
    ]);
  });

  it("never folds a floor with no specialisation (the degree-wide floor)", () => {
    const categories = [req("mcomp-core", "allocating"), req("mcomp-min-8000-comp", "floor")];
    const specialisationIdByKey = new Map<string, number | null>([
      ["mcomp-core", null],
      ["mcomp-min-8000-comp", null],
    ]);

    const { visible, foldedInto } = foldSpecialisationFloors(categories, specialisationIdByKey);
    expect(visible.map((r) => r.key)).toEqual(["mcomp-core", "mcomp-min-8000-comp"]);
    expect(foldedInto.size).toBe(0);
  });

  it("does not merge two different specialisations' floors together", () => {
    // Never happens in practice (only one specialisation is ever declared),
    // but the function takes whatever it's given, so it must not use the
    // first-seen primary for every specialisation indiscriminately.
    const categories = [
      req("mchl-courses", "allocating"),
      req("artif-courses", "allocating"),
      req("mchl-min-8000", "floor"),
      req("artif-min-8000", "floor"),
    ];
    const specialisationIdByKey = new Map([
      ["mchl-courses", 1], ["artif-courses", 2],
      ["mchl-min-8000", 1], ["artif-min-8000", 2],
    ]);

    const { foldedInto } = foldSpecialisationFloors(categories, specialisationIdByKey);
    expect(foldedInto.get("mchl-courses")?.map((r) => r.key)).toEqual(["mchl-min-8000"]);
    expect(foldedInto.get("artif-courses")?.map((r) => r.key)).toEqual(["artif-min-8000"]);
  });

  it("does not let a floor fold into itself when it happens to be listed first", () => {
    // Current seed data never produces this shape — every specialisation's
    // first row is its allocating umbrella — but nothing enforces that at
    // the type level. If a floor were first, it would become its own
    // "primary", and folding it into itself would make it vanish from the
    // page with no box at all, rather than falling back to a standalone one.
    const categories = [req("weird-floor", "floor"), req("weird-courses", "allocating")];
    const specialisationIdByKey = new Map([
      ["weird-floor", 9],
      ["weird-courses", 9],
    ]);

    const { visible, foldedInto } = foldSpecialisationFloors(categories, specialisationIdByKey);
    expect(visible.map((r) => r.key)).toEqual(["weird-floor", "weird-courses"]);
    expect(foldedInto.size).toBe(0);
  });

  it("preserves the given order among visible categories", () => {
    const categories = [
      req("mcomp-core", "allocating"),
      req("mcomp-foundational", "allocating"),
      req("mchl-courses", "allocating"),
      req("mchl-min-8000", "floor"),
      req("mcomp-project", "allocating"),
    ];
    const specialisationIdByKey = new Map<string, number | null>([
      ["mcomp-core", null], ["mcomp-foundational", null],
      ["mchl-courses", 1], ["mchl-min-8000", 1],
      ["mcomp-project", null],
    ]);

    const { visible } = foldSpecialisationFloors(categories, specialisationIdByKey);
    expect(visible.map((r) => r.key)).toEqual([
      "mcomp-core", "mcomp-foundational", "mchl-courses", "mcomp-project",
    ]);
  });
});
