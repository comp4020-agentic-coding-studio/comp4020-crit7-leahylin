import { describe, expect, it } from "vitest";
import { type HeadroomFloor, withinFloorHeadroom } from "../src/lib/floor-headroom";

// Pure module, no database — same reasoning as spec/semester.test.ts. The
// real-data version of this (Machine Learning, over HTTP) is in
// spec/study-plan.test.ts; these pin the arithmetic's edges, which the
// seeded degree only reaches one or two of.

const EIGHT_THOUSAND = new Set([8600, 8650, 8880]);
const at8000 = (countedUnits: number): HeadroomFloor => ({
  key: "min-8000",
  requiredUnits: 12,
  countedUnits,
  pool: EIGHT_THOUSAND,
});
const spec24 = (countedUnits: number) => ({ requiredUnits: 24, countedUnits });

const low = { id: 6261, units: 6 };
const lowToo = { id: 6528, units: 6 };
const high = { id: 8600, units: 6 };

describe("withinFloorHeadroom", () => {
  it("still offers a course below 8000 level while only one counts (6 of 12 allowed)", () => {
    const { allowed, limiting } = withinFloorHeadroom([low, high], [at8000(0)], spec24(6));
    expect(allowed).toEqual([low, high]);
    expect(limiting).toEqual([]);
  });

  it("stops offering courses below 8000 level once two already count (12 of 12 used)", () => {
    const { allowed, limiting } = withinFloorHeadroom([low, lowToo, high], [at8000(0)], spec24(12));
    expect(allowed).toEqual([high]);
    expect(limiting.map((l) => [l.floor.key, l.unitsOutside, l.limit])).toEqual([["min-8000", 12, 12]]);
  });

  it("counts only the units OUTSIDE the minimum as used: two 8000-level courses leave room for two below", () => {
    // 12 units counted, but all of them are 8000-level, so nothing below
    // 8000 level has been spent yet.
    const { allowed } = withinFloorHeadroom([low], [at8000(12)], spec24(12));
    expect(allowed).toEqual([low]);
  });

  it("rules out a course that would overshoot even when some room is left", () => {
    // 6 of 12 used; a 12-unit course below 8000 level would make it 18.
    const big = { id: 6999, units: 12 };
    const { allowed } = withinFloorHeadroom([big, low], [at8000(0)], spec24(6));
    expect(allowed).toEqual([low]);
  });

  it("changes nothing with no minimum to protect", () => {
    const { allowed, limiting } = withinFloorHeadroom([low, lowToo], [], spec24(18));
    expect(allowed).toEqual([low, lowToo]);
    expect(limiting).toEqual([]);
  });
});
