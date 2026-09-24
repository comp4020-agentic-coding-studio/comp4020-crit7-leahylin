// What each Course Planner box offers and says, worked out from the plan's
// progress. Pure — no database — so the page only lays it out, and the
// decisions (what's offered where, when a box closes, how a specialisation's
// rules share one box) can be tested directly.

import { foldSpecialisationFloors } from "./category-groups";
import { type Headroom, withinFloorHeadroom } from "./floor-headroom";
import type { RequirementProgress } from "./progress";
import type { Course } from "./schema";

/** For one requirement, the courses in its pool not already in the plan —
 *  what "ANU Course Planner" offers to add under that category. Sorted by
 *  code, same as everywhere else courses are listed. */
export function availableForRequirement(
  requirement: Pick<RequirementProgress, "key">,
  catalogue: Course[],
  poolsByKey: Map<string, Set<number>>,
  chosenIds: Set<number>,
): Course[] {
  const pool = poolsByKey.get(requirement.key) ?? new Set<number>();
  return catalogue
    .filter((course) => pool.has(course.id) && !chosenIds.has(course.id))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Everything one Course Planner category renders. */
export type CategoryView = {
  requirement: RequirementProgress;
  /** The specialisation minimums shown with this category. */
  foldedFloors: RequirementProgress[];
  headroom: Headroom<Course>;
  /** What can still be added here. */
  options: Course[];
  /** Nothing left to add: full, or nothing left in its pool. */
  boxClosed: boolean;
  allFoldedFloorsMet: boolean;
  /** Closed with its minimums met: shown as one line. */
  settled: boolean;
  ruleText: string;
  selectId: string;
  semesterId: string;
};

export type PlannerBlock =
  | { kind: "single"; view: CategoryView }
  | {
      kind: "group";
      key: string;
      title: string;
      /** The overall list's own rule ("24 units drawn from the two lists
       *  below"), which describes the whole box rather than one part. */
      rule: string | null;
      views: (CategoryView & { label: string })[];
    };

export type PlannerInput = {
  /** Every requirement the plan is checked against, total included. */
  requirements: RequirementProgress[];
  catalogue: Course[];
  chosenIds: Set<number>;
  poolsByKey: Map<string, Set<number>>;
  specialisationIdByKey: Map<string, number | null>;
  levelFloorKeys: Set<string>;
  specialisationLabel: (id: number) => string | undefined;
};

const noCourses: Set<number> = new Set();

/** "Specialisation: foundation systems maximum" -> "Foundation systems
 *  maximum": inside a box already titled with the specialisation, the
 *  prefix only repeats it. */
function partLabel(label: string): string {
  const bare = label.replace(/^Specialisation:\s*/, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

// A declared specialisation whose rules span more than one category (a
// course list plus a "maximum from this sub-list", or Professional
// Computing's compulsory / elective / further-8000 split) gets ONE box, with
// a dropdown per part, instead of a box per rule. Each course is offered in
// exactly one of them: a course on a "maximum" sub-list is offered under
// that sub-list, not also under the overall list. Specialisations with a
// single category keep their single box as before.

/** The Course Planner's boxes, in order. */
export function plannerBlocks(input: PlannerInput): PlannerBlock[] {
  const {
    catalogue,
    chosenIds,
    poolsByKey,
    specialisationIdByKey,
    levelFloorKeys,
    specialisationLabel,
  } = input;
  const progress = { requirements: input.requirements };

  // Every non-total requirement doubles as a Course Planner category: its
  // own pool, its own "what's left to add" selector.
  const categories = input.requirements.filter((r) => r.kind !== "total");
  // A specialisation's own minimums fold into its first category, one box
  // up (see category-groups.ts).
  const { visible, foldedInto: floorsFoldedIntoKey } = foldSpecialisationFloors(
    categories,
    specialisationIdByKey,
  );
  // A floor left unfolded — the degree-wide "8000-level COMP minimum" — has
  // no pool to add from: it measures what the other categories hold, and
  // Degree Progress already says whether it's met. It gets no box.
  const plannerCategories = visible.filter((requirement) => requirement.kind !== "floor");
  type Category = RequirementProgress;

  /** Everything one category renders. `hidden` is courses offered by a
   *  sibling in the same specialisation box instead. */
  function categoryView(requirement: Category, hidden: Set<number> = noCourses): CategoryView {
    const foldedFloors = floorsFoldedIntoKey.get(requirement.key) ?? [];
    // Once a category already has enough units in the plan, there's
    // no point still offering the rest of its pool. Foundational's
    // pool is 12 units of either/or courses for a 6-unit requirement,
    // so after MATH6005 alone the picker would otherwise keep
    // dangling COMP6260 as if it still mattered here; it doesn't —
    // adding it would just be routed to whichever other category can
    // still use it (or become surplus), not to this one.
    //
    // Deliberately NOT requirement.onTrack: for a cap that field means
    // "not yet over its ceiling", which is true at zero units chosen —
    // it would hide the picker before the student has picked anything.
    // countedUnits >= requiredUnits means the same thing as onTrack
    // for every OTHER kind, and means "at the ceiling" for a cap,
    // which is the "full" this is actually asking about.
    const isFull = requirement.countedUnits >= requirement.requiredUnits;
    const inPool = isFull
      ? []
      : availableForRequirement(
          requirement,
          catalogue,
          poolsByKey,
          chosenIds,
        ).filter((course) => !hidden.has(course.id));
    // A specialisation's 8000-level minimum caps how much of it can be
    // below 8000 level (24 - 12 = 12 units, i.e. two 6-unit courses).
    // Once that is used up, stop offering courses that would take the
    // minimum out of reach. See src/lib/floor-headroom.ts.
    const specialisationId = specialisationIdByKey.get(requirement.key);
    const levelFloors = foldedFloors.filter((floor) =>
      levelFloorKeys.has(floor.key),
    );
    const siblings = progress.requirements.filter(
      (other) =>
        other.kind === "allocating" &&
        specialisationId != null &&
        specialisationIdByKey.get(other.key) === specialisationId,
    );
    const headroom = withinFloorHeadroom(
      inPool,
      levelFloors.map((floor) => ({
        key: floor.key,
        requiredUnits: floor.requiredUnits,
        countedUnits: floor.countedUnits,
        pool: poolsByKey.get(floor.key) ?? noCourses,
      })),
      {
        requiredUnits: siblings.reduce((n, r) => n + r.requiredUnits, 0),
        countedUnits: siblings.reduce((n, r) => n + r.countedUnits, 0),
      },
    );
    const options = headroom.allowed;
    // Once this box has nothing left to accept — its own pool is full
    // or exhausted — there's exactly one true thing left to say about
    // it, not two: either every folded floor is also covered ("done"),
    // or at least one isn't ("not yet met" — and there's nothing more
    // to add here that would fix it, so no picker either). Vacuously
    // true with no folded floors, which is every OTHER category, so
    // this reduces to the original single-note behaviour for them.
    const boxClosed = isFull || options.length === 0;
    const allFoldedFloorsMet = foldedFloors.every(
      (floor) => floor.onTrack,
    );
    // Nothing left to do here: a closed box whose floors are met. It
    // collapses to a single line so the categories that still need
    // something stand out.
    const settled = boxClosed && allFoldedFloorsMet;
    const ruleText = [requirement.detail, ...foldedFloors.map((f) => f.detail)]
      .filter(Boolean)
      .join(" ");
    const selectId = `add-${requirement.key}`;
    const semesterId = `${selectId}-semester`;
    return {
      requirement,
      foldedFloors,
      headroom,
      options,
      boxClosed,
      allFoldedFloorsMet,
      settled,
      ruleText,
      selectId,
      semesterId,
    };
  }

  const blocks: PlannerBlock[] = [];
  {
    const bySpecialisation = new Map<number, Category[]>();
    for (const requirement of plannerCategories) {
      const id = specialisationIdByKey.get(requirement.key);
      if (id == null) continue;
      bySpecialisation.set(id, [...(bySpecialisation.get(id) ?? []), requirement]);
    }
    const grouped = new Set<number>();
    for (const requirement of plannerCategories) {
      const id = specialisationIdByKey.get(requirement.key);
      const parts = id == null ? undefined : bySpecialisation.get(id);
      if (id == null || !parts || parts.length < 2) {
        blocks.push({ kind: "single", view: categoryView(requirement) });
        continue;
      }
      if (grouped.has(id)) continue;
      grouped.add(id);
      const boxRules: string[] = [];
      const capPools = parts
        .filter((part) => part.kind === "cap")
        .map((part) => poolsByKey.get(part.key) ?? noCourses);
      const views = parts.map((part) => {
        // The overall list leaves its sub-lists' courses to them.
        const hidden: Set<number> =
          part.kind === "cap" ? noCourses : new Set(capPools.flatMap((pool) => [...pool]));
        const view = categoryView(part, hidden);
        // What's left of the overall list is often exactly its folded
        // "minimum from this list" rules put together (Computer Systems'
        // advanced list; Human-Centred's compulsory course plus its advanced
        // list): name the part after them, not the whole list it came from.
        const remaining = [...(poolsByKey.get(part.key) ?? noCourses)].filter((c) => !hidden.has(c));
        const listFloors = view.foldedFloors.filter((floor) => {
          const pool = poolsByKey.get(floor.key);
          return pool !== undefined && !levelFloorKeys.has(floor.key) && [...pool].every((c) => remaining.includes(c));
        });
        const covered = new Set(listFloors.flatMap((floor) => [...(poolsByKey.get(floor.key) ?? noCourses)]));
        const namedByFloors =
          hidden.size > 0 && listFloors.length > 0 && remaining.every((c) => covered.has(c));
        const label = namedByFloors
          ? listFloors.map((floor, i) => (i === 0 ? partLabel(floor.label) : partLabel(floor.label).toLowerCase())).join(" and ")
          : partLabel(part.label);
        // Rules about the whole specialisation go up to the box: the overall
        // list's own rule when its sub-lists have been taken out of it ("24
        // units drawn from the two lists below"), and the 8000-level minimum,
        // which is about all 24 units. A part keeps what's about its courses.
        const wholeBox = view.foldedFloors.filter((floor) => levelFloorKeys.has(floor.key));
        if (hidden.size > 0 && part.detail) boxRules.push(part.detail);
        boxRules.push(...wholeBox.map((floor) => floor.detail).filter((d): d is string => !!d));
        const own = [
          hidden.size > 0 ? null : part.detail,
          ...view.foldedFloors
            .filter((floor) => !levelFloorKeys.has(floor.key))
            .map((floor) => floor.detail),
        ]
          .filter(Boolean)
          .join(" ");
        return { ...view, label, ruleText: own };
      });
      blocks.push({
        kind: "group",
        key: String(id),
        title: `Specialisation: ${specialisationLabel(id) ?? "courses"}`,
        rule: boxRules.length > 0 ? boxRules.join(" ") : null,
        views,
      });
    }
  }
  return blocks;
}
