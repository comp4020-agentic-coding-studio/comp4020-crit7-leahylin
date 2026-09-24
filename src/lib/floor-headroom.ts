// Keeping the Course Planner from offering a course that would make one of a
// specialisation's minimums impossible to meet. Pure and free of the
// database, same reasoning as category-groups.ts and semester.ts, so the
// arithmetic is testable directly.
//
// The case it exists for: a specialisation is 24 units and needs at least 12
// of them at 8000 level. So at most 24 - 12 = 12 of its units can be below
// 8000 level. Once two 6-unit courses below 8000 level already count toward
// it, a third would leave only 6 units for the 12-unit minimum, and the
// specialisation could no longer be completed however the rest was chosen.
// The picker stops offering those courses at that point instead of letting
// the student find out in Degree Progress afterwards.
//
// Only what the Course Planner OFFERS is narrowed. The engine still accepts
// and reports any plan, so a course added some other way is shown honestly
// as breaking the minimum rather than hidden.

export type HeadroomFloor = {
  key: string;
  /** The minimum, e.g. 12 units of 8000-level. */
  requiredUnits: number;
  /** How much of the minimum the specialisation's courses already meet. */
  countedUnits: number;
  /** Course ids that count toward the minimum. */
  pool: Set<number>;
};

export type SpecialisationUnits = {
  /** The specialisation's size: its allocating rules' units added up. */
  requiredUnits: number;
  /** Units the plan already credits to those rules. */
  countedUnits: number;
};

export type Candidate = { id: number; units: number };

export type Headroom<C extends Candidate> = {
  /** The candidates still worth offering, in the order given. */
  allowed: C[];
  /** The minimums that ruled at least one candidate out, each with how many
   *  of the specialisation's units already sit outside it, so the page can
   *  say why the list got shorter. */
  limiting: { floor: HeadroomFloor; unitsOutside: number; limit: number }[];
};

export function withinFloorHeadroom<C extends Candidate>(
  candidates: C[],
  floors: HeadroomFloor[],
  specialisation: SpecialisationUnits,
): Headroom<C> {
  const budgets = floors.map((floor) => {
    // The most the specialisation can hold OUTSIDE this minimum...
    const limit = Math.max(0, specialisation.requiredUnits - floor.requiredUnits);
    // ...and how much of that it has already used.
    const unitsOutside = Math.max(0, specialisation.countedUnits - floor.countedUnits);
    return { floor, limit, unitsOutside };
  });

  const limitingKeys = new Set<string>();
  const allowed = candidates.filter((course) =>
    budgets.every(({ floor, limit, unitsOutside }) => {
      if (floor.pool.has(course.id)) return true;
      const fits = unitsOutside + course.units <= limit;
      if (!fits) limitingKeys.add(floor.key);
      return fits;
    }),
  );

  return {
    allowed,
    limiting: budgets.filter(({ floor }) => limitingKeys.has(floor.key)),
  };
}
