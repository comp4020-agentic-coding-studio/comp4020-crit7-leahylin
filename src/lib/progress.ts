import type { Course, PlanItem, Requirement, RequirementCourse } from "./schema";

// The requirements engine: given a catalogue, a degree's rules and somebody's
// plan, say how far along each requirement is.
//
// Deliberately pure — no database handle, no request, no dates. Everything it
// needs arrives as arguments, so the interesting logic is testable directly
// rather than through HTTP, and the Astro pages stay thin.
//
// ALLOCATION, NOT COVERAGE
//
// The naive reading of these rules checks each one independently: "does the
// plan hold 12 units matching this?" That overstates progress, because one
// course then counts toward every rule whose pool contains it. MCOMP's
// "12 units of elective courses offered by ANU" restricts nothing at all, so
// under that reading two core courses would mark electives complete.
//
// So `kind` splits the rules in two:
//
//   allocating — spends units. Each course is assigned to at most ONE
//                allocating requirement, so a core course cannot also fill
//                the elective bucket. Units left over are surplus.
//   floor      — a minimum rather than an allocation ("at least 24 units of
//                8000-level COMP"). Counts matching courses and spends
//                nothing, so overlapping with allocating buckets is the
//                intended reading. A floor belonging to a specialisation is
//                SCOPED to it: it counts only courses credited to that
//                specialisation's own rules, because "the specialisation's
//                24 units must include 12 units of 8000-level courses" is a
//                claim about those 24 units, not about the whole plan.
//   total      — the degree's size. Counts everything, spends nothing, and is
//                the one bucket meant to be exceeded.
//   cap        — a CEILING, not a target: "a maximum of 12 units from this
//                list". Three of the seven specialisations pair a minimum
//                from one list with a maximum from another. A cap is the one
//                kind you can BREAK rather than merely leave unfinished, so
//                it reports `violated` and is satisfied by doing less.
//
// Assignment is cap-aware: while filling a rule, a course that would push
// one of its specialisation's ceilings past the limit is deferred and only
// taken if nothing else can fill the rule. Without that, taking 18 units from
// a 12-unit-maximum list and 12 from its paired minimum list reports BOTH
// rules broken, even though a valid 24-unit assignment exists — a false
// negative of exactly the kind allocation was introduced to remove.
//
// Assignment is otherwise greedy, most-restrictive-pool first, and atomic per course
// (a 6-unit course is never split across two buckets, because ANU doesn't do
// that). Greedy is not the same as optimal: a truly general answer is a
// bipartite matching, and a pathological degree could defeat this. Taking the
// tightest pools first is what keeps it correct for a well-formed structure
// like MCOMP's, where the narrow buckets — "MATH6005 or COMP6260" — get first
// claim on the courses only they can use.

/** Just the join-table columns the engine reads. */
export type PoolRow = Pick<RequirementCourse, "requirementId" | "courseId" | "role">;

/** Just the plan columns the engine reads — no plan id, so a caller can pass
 *  a hypothetical plan that was never stored. */
export type PlanEntry = Pick<PlanItem, "courseId" | "status">;

export type RequirementProgress = {
  key: string;
  label: string;
  detail: string | null;
  kind: Requirement["kind"];
  requiredUnits: number;

  /** Units that COUNT toward this rule: for an allocating rule, only the
   *  courses assigned to it; for a floor or total, everything matching. */
  completedUnits: number;
  plannedUnits: number;
  countedUnits: number;
  /** The course codes behind those units. */
  countedCodes: string[];

  /** For a cap: staying at or under the ceiling. For everything else:
   *  completed units alone meet the requirement. */
  satisfied: boolean;
  onTrack: boolean;
  exceeded: boolean;
  excessUnits: number;
  /** A ceiling actually broken. Only ever true for kind "cap" — the other
   *  kinds can be unfinished but not wrong. */
  violated: boolean;

  /** Context, not credit: everything in the plan this rule's pool could
   *  accept. For an allocating rule this can exceed countedUnits, and the
   *  gap is exactly what was spent elsewhere — which is what lets the UI
   *  explain "you have these, but they're counting toward core". */
  poolMatchedUnits: number;
  poolMatchedCodes: string[];

  /** How many catalogue courses this rule could ever draw on. */
  poolSize: number;
  /** True when the rule restricts nothing, so every course matches. */
  isOpenPool: boolean;
};

export type PlanProgress = {
  requirements: RequirementProgress[];
  /** True when the plan has declared a specialisation whose rules are
   *  seeded. When false, 24 of the degree's 96 units are unaccounted for and
   *  the page has to say so rather than implying the rest is all there is. */
  specialisationModelled: boolean;
  completedUnits: number;
  plannedUnits: number;
  totalUnits: number;
  /** Units in the plan that no allocating requirement had room for. Real
   *  surplus: they still count toward the total and any floor, but they buy
   *  no progress against the degree's structure. */
  surplusUnits: number;
  surplusCodes: string[];
};

function filterColumnsSet(requirement: Requirement): boolean {
  return (
    requirement.subjects !== null ||
    requirement.minLevel !== null ||
    requirement.maxLevel !== null
  );
}

function matchesFilter(course: Course, requirement: Requirement): boolean {
  if (requirement.subjects !== null) {
    const subjects = requirement.subjects
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!subjects.includes(course.subject)) return false;
  }
  if (requirement.minLevel !== null && course.level < requirement.minLevel) {
    return false;
  }
  if (requirement.maxLevel !== null && course.level > requirement.maxLevel) {
    return false;
  }
  return true;
}

/**
 * The candidate pool for one requirement, as course ids.
 *
 * Resolution order, which is what lets a single mechanism express every rule
 * shape in the degree:
 *   1. explicit `include` rows, if any exist  — "these four courses"
 *   2. otherwise the subject/level filter      — "any 8000-level COMP"
 *   3. otherwise every course                  — the total, open electives
 * and `exclude` rows are subtracted from whatever that produced, which is how
 * "any 8000-level COMP *excluding* the project courses" is expressed.
 */
export function resolvePool(
  requirement: Requirement,
  courses: Course[],
  pools: PoolRow[],
): Set<number> {
  const includes = new Set<number>();
  const excludes = new Set<number>();
  for (const row of pools) {
    if (row.requirementId !== requirement.id) continue;
    (row.role === "exclude" ? excludes : includes).add(row.courseId);
  }

  let candidates: number[];
  if (includes.size > 0) {
    candidates = [...includes];
  } else if (filterColumnsSet(requirement)) {
    candidates = courses
      .filter((course) => matchesFilter(course, requirement))
      .map((course) => course.id);
  } else {
    candidates = courses.map((course) => course.id);
  }

  return new Set(candidates.filter((id) => !excludes.has(id)));
}

/** True when a requirement restricts nothing: no explicit pool and no filter,
 *  so every course in the catalogue matches it. */
export function isOpenPool(requirement: Requirement, pools: PoolRow[]): boolean {
  if (filterColumnsSet(requirement)) return false;
  return !pools.some(
    (row) => row.requirementId === requirement.id && row.role === "include",
  );
}

type Resolved = {
  requirement: Requirement;
  pool: Set<number>;
  /** Plan entries this rule's pool accepts, allocated or not. */
  inPool: { entry: PlanEntry; course: Course }[];
  /** Plan entries actually credited to this rule. */
  credited: { entry: PlanEntry; course: Course }[];
};

function tally(rows: { entry: PlanEntry; course: Course }[]) {
  let completed = 0;
  let planned = 0;
  for (const { entry, course } of rows) {
    if (entry.status === "completed") completed += course.units;
    else planned += course.units;
  }
  return { completed, planned };
}

/**
 * Every requirement's progress, plus the plan-level totals.
 *
 * Allocating rules are resolved first, tightest pool first, each consuming
 * the courses it credits. Floors and totals are then measured over the whole
 * plan, ignoring what was consumed.
 */
export function evaluatePlan(
  courses: Course[],
  requirements: Requirement[],
  pools: PoolRow[],
  plan: PlanEntry[],
  declaredSpecialisationId: number | null = null,
): PlanProgress {
  const courseById = new Map(courses.map((course) => [course.id, course]));

  // Drop plan rows pointing outside the catalogue. The schema's foreign key
  // makes that impossible through the app, but the engine takes plain arrays.
  const entries = plan.flatMap((entry) => {
    const course = courseById.get(entry.courseId);
    return course ? [{ entry, course }] : [];
  });

  // A rule belonging to a specialisation applies only once that
  // specialisation is declared. Undeclared ones are dropped entirely rather
  // than shown unmet: six of MCOMP's seven specialisations are alternatives
  // you will never take, so listing their rules as outstanding would be
  // nonsense.
  const applicable = requirements.filter(
    (requirement) =>
      requirement.specialisationId === null ||
      requirement.specialisationId === declaredSpecialisationId,
  );

  const resolved: Resolved[] = applicable.map((requirement) => {
    const pool = resolvePool(requirement, courses, pools);
    return {
      requirement,
      pool,
      inPool: entries.filter((row) => pool.has(row.course.id)),
      credited: [],
    };
  });

  // --- allocating rules: tightest pool first, atomic, spend once ---------
  const unassigned = new Set(entries);
  const allocating = resolved
    .filter((r) => r.requirement.kind === "allocating")
    .sort(
      (a, b) =>
        a.pool.size - b.pool.size ||
        a.requirement.sortOrder - b.requirement.sortOrder ||
        a.requirement.key.localeCompare(b.requirement.key),
    );

  for (const rule of allocating) {
    // Completed before planned, so progress is credited as far as it
    // genuinely goes; then smaller courses first, so a 12-unit capstone
    // doesn't overshoot a 6-unit bucket that a 6-unit course would fit.
    const candidates = [...unassigned]
      .filter((row) => rule.pool.has(row.course.id))
      .sort(
        (a, b) =>
          Number(b.entry.status === "completed") - Number(a.entry.status === "completed") ||
          a.course.units - b.course.units ||
          a.course.code.localeCompare(b.course.code),
      );

    // The ceilings this rule's own specialisation imposes. A program-level
    // rule has none, and a cap never constrains another specialisation.
    const caps = resolved
      .filter(
        (other) =>
          other.requirement.kind === "cap" &&
          other.requirement.specialisationId !== null &&
          other.requirement.specialisationId === rule.requirement.specialisationId,
      )
      .map((other) => ({ pool: other.pool, limit: other.requirement.requiredUnits, used: 0 }));

    let credited = 0;
    const deferred: typeof candidates = [];

    const take = (row: (typeof candidates)[number]) => {
      rule.credited.push(row);
      unassigned.delete(row);
      credited += row.course.units;
      for (const cap of caps) {
        if (cap.pool.has(row.course.id)) cap.used += row.course.units;
      }
    };

    for (const row of candidates) {
      if (credited >= rule.requirement.requiredUnits) break;
      const wouldBreakACap = caps.some(
        (cap) => cap.pool.has(row.course.id) && cap.used + row.course.units > cap.limit,
      );
      if (wouldBreakACap) {
        deferred.push(row);
        continue;
      }
      take(row);
    }

    // Still short: the rule cannot be filled without breaking a ceiling, so
    // take the deferred courses anyway and let the cap report the breach.
    // Refusing them would hide units the plan really does contain.
    for (const row of deferred) {
      if (credited >= rule.requirement.requiredUnits) break;
      take(row);
    }
  }

  // --- floors and totals: measured, not allocated ------------------------
  for (const rule of resolved) {
    if (rule.requirement.kind === "allocating") continue;

    if (rule.requirement.specialisationId === null) {
      // Degree-wide: every matching course in the plan counts.
      rule.credited = rule.inPool;
      continue;
    }

    // Scoped to its specialisation: only what that specialisation's own
    // allocating rules actually credited, intersected with this floor's own
    // filter. Without the scope, a 8000-level compulsory core course would
    // count toward the specialisation's internal 8000-level minimum, which
    // it has nothing to do with.
    const sibling = new Set(
      resolved
        .filter(
          (other) =>
            other.requirement.kind === "allocating" &&
            other.requirement.specialisationId === rule.requirement.specialisationId,
        )
        .flatMap((other) => other.credited.map((row) => row.course.id)),
    );
    rule.credited = rule.inPool.filter((row) => sibling.has(row.course.id));
  }

  const progress = resolved
    .sort(
      (a, b) =>
        a.requirement.sortOrder - b.requirement.sortOrder ||
        a.requirement.key.localeCompare(b.requirement.key),
    )
    .map(({ requirement, pool, inPool, credited }): RequirementProgress => {
      const counted = tally(credited);
      const matched = tally(inPool);
      const countedUnits = counted.completed + counted.planned;
      const over = countedUnits > requirement.requiredUnits;
      // A cap inverts the question: it asks how little you took, so it is
      // satisfied until it is exceeded, and exceeding it is a fault rather
      // than surplus.
      const isCap = requirement.kind === "cap";
      return {
        key: requirement.key,
        label: requirement.label,
        detail: requirement.detail,
        kind: requirement.kind,
        requiredUnits: requirement.requiredUnits,
        completedUnits: counted.completed,
        plannedUnits: counted.planned,
        countedUnits,
        countedCodes: credited.map((row) => row.course.code).sort(),
        satisfied: isCap
          ? !over
          : counted.completed >= requirement.requiredUnits,
        onTrack: isCap ? !over : countedUnits >= requirement.requiredUnits,
        exceeded: over,
        excessUnits: Math.max(0, countedUnits - requirement.requiredUnits),
        violated: isCap && over,
        poolMatchedUnits: matched.completed + matched.planned,
        poolMatchedCodes: inPool.map((row) => row.course.code).sort(),
        poolSize: pool.size,
        isOpenPool: isOpenPool(requirement, pools),
      };
    });

  const whole = tally(entries);
  const surplus = tally([...unassigned]);
  const declared =
    declaredSpecialisationId !== null &&
    applicable.some((r) => r.specialisationId === declaredSpecialisationId);

  return {
    requirements: progress,
    specialisationModelled: declared,
    completedUnits: whole.completed,
    plannedUnits: whole.planned,
    totalUnits: whole.completed + whole.planned,
    surplusUnits: surplus.completed + surplus.planned,
    surplusCodes: [...unassigned].map((row) => row.course.code).sort(),
  };
}
