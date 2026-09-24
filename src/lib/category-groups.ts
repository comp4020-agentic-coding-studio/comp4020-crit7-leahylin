// Grouping requirements into Course Planner sections is a display concern,
// not something the requirements engine needs to know about — same reasoning
// as src/lib/semester.ts. Pure and free of Astro so the edge cases (not just
// the common shapes) are directly testable.

/** Only the fields the grouping needs — RequirementProgress satisfies this,
 *  and a test can build a plain object without constructing a whole one. */
export type Foldable = { key: string; kind: string };

export type FoldResult<T extends Foldable> = {
  /** What actually gets its own Course Planner section, in the same order
   *  they were given. */
  visible: T[];
  /** Every specialisation floor that got folded away, keyed by the
   *  "primary" requirement's key it was folded INTO. */
  foldedInto: Map<string, T[]>;
};

/**
 * A specialisation's own floor requirements (its internal minimums) have no
 * pool of their own to add from — same as the degree-wide floor — but
 * unlike the degree-wide one, they DO have a natural home: the same
 * specialisation's umbrella "X courses" bucket, one section up. This folds
 * each floor into that bucket instead of giving it a disconnected section:
 * the first requirement encountered for a given specialisation (by
 * whatever order `requirements` is already in — sortOrder, in practice) is
 * its "primary", and every OTHER floor sharing that specialisation folds
 * into it.
 *
 * A requirement with no specialisation (specialisationIdByKey returns null
 * or the key is absent) never folds — that's the degree-wide floor, and it
 * keeps its own one-line box regardless of kind.
 *
 * Defensive, not just decorative: if a floor ever turned out to be the
 * FIRST requirement listed for its specialisation (current seed data never
 * produces this — every specialisation's first row is its allocating
 * umbrella — but nothing enforces that ordering at the type level), it
 * would become its own "primary" and the self-fold check below stops it
 * from folding into itself, which would otherwise make it vanish from the
 * page with no box at all instead of falling back to its own standalone one.
 */
export function foldSpecialisationFloors<T extends Foldable>(
  categories: T[],
  specialisationIdByKey: Map<string, number | null>,
): FoldResult<T> {
  const primaryKeyBySpecialisation = new Map<number, string>();
  for (const requirement of categories) {
    const specialisationId = specialisationIdByKey.get(requirement.key);
    if (specialisationId != null && !primaryKeyBySpecialisation.has(specialisationId)) {
      primaryKeyBySpecialisation.set(specialisationId, requirement.key);
    }
  }

  const foldedInto = new Map<string, T[]>();
  for (const requirement of categories) {
    if (requirement.kind !== "floor") continue;
    const specialisationId = specialisationIdByKey.get(requirement.key);
    // The loop above never inserts a null/undefined key, so a requirement
    // with no specialisation (the degree-wide floor) already resolves to
    // undefined here — no separate check needed to exclude it.
    const primaryKey =
      specialisationId == null ? undefined : primaryKeyBySpecialisation.get(specialisationId);
    if (!primaryKey || primaryKey === requirement.key) continue;
    const list = foldedInto.get(primaryKey) ?? [];
    list.push(requirement);
    foldedInto.set(primaryKey, list);
  }

  const foldedKeys = new Set([...foldedInto.values()].flat().map((r) => r.key));
  const visible = categories.filter((requirement) => !foldedKeys.has(requirement.key));
  return { visible, foldedInto };
}
