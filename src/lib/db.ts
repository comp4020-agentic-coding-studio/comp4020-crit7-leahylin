import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  type PlanProgress,
  evaluatePlan,
  resolvePool,
} from "./progress";
import {
  type ChosenItem,
  type SemesterGroup,
  type SemesterRow,
  canStartIn,
  everySemester,
  FULL_TIME_LOAD,
  INTAKES,
  isIntake,
  isTwoSemester,
  semestersBetween,
  shiftSemester,
  semesterOptions,
  semesterUnits,
  startSemesters,
  studyPlanBySemester,
  unitsPerSemester,
} from "./semester";
import {
  type Course,
  type Plan,
  type Specialisation,
  courses,
  planItems,
  plans,
  requirementCourses,
  requirements,
  specialisations,
} from "./schema";
import { DEMO_PLAN } from "./seed-data";
import { seed } from "./seed";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// Then the degree itself. The MCOMP rules are reference data — they describe
// the degree rather than belonging to any user — so they are asserted here
// rather than entered through the app. This has to happen on every boot, not
// once: spec/global-setup.ts hands each test run a fresh empty database, so
// this is the only thing that ever puts the rules in it.
seed(db);

export type { Course, Plan, Specialisation };

export function listSpecialisations(): Specialisation[] {
  return db.select().from(specialisations).orderBy(asc(specialisations.label)).all();
}

export function getSpecialisation(id: number): Specialisation | undefined {
  return db.select().from(specialisations).where(eq(specialisations.id, id)).get();
}

/** Declare a specialisation, or pass null to withdraw the declaration. */
export function declareSpecialisation(planId: number, specialisationId: number | null): void {
  db.update(plans).set({ specialisationId }).where(eq(plans.id, planId)).run();
}

export function getCourse(id: number): Course | undefined {
  return listCourses().find((course) => course.id === id);
}

export function listCourses(): Course[] {
  return db.select().from(courses).orderBy(asc(courses.code)).all();
}

export function listPlans(): Plan[] {
  return db.select().from(plans).orderBy(asc(plans.label)).all();
}

/** Change when a plan starts, moving everything already scheduled by the
 *  same number of semesters so the study plan keeps its shape: a course in
 *  the first semester stays in the first semester. Unscheduled courses stay
 *  unscheduled. Ignores anything that isn't one of INTAKES. */
export function setIntake(planId: number, intake: string): void {
  if (!isIntake(intake)) return;
  const plan = db.select().from(plans).where(eq(plans.id, planId)).get();
  if (!plan || plan.intake === intake) return;
  const by = semestersBetween(plan.intake, intake);
  // Synchronous callback: better-sqlite3's transactions reject a promise.
  db.transaction((tx) => {
    tx.update(plans).set({ intake }).where(eq(plans.id, planId)).run();
    const items = tx.select().from(planItems).where(eq(planItems.planId, planId)).all();
    for (const item of items) {
      if (item.semester === null) continue;
      tx.update(planItems)
        .set({ semester: shiftSemester(item.semester, by) })
        .where(eq(planItems.id, item.id))
        .run();
    }
  });
}

/** The demo plan is re-created at every boot (the route invariants need
 *  /plan/demo/ to exist), so deleting it would only make it reappear. */
export function canDeletePlan(slug: string): boolean {
  return slug !== DEMO_PLAN.slug;
}

/** Delete a plan and, through ON DELETE CASCADE, every course in it.
 *  Returns false, deleting nothing, for the demo plan or an unknown slug. */
export function deletePlan(slug: string): boolean {
  if (!canDeletePlan(slug)) return false;
  return db.delete(plans).where(eq(plans.slug, slug)).run().changes > 0;
}

export function getPlan(slug: string): Plan | undefined {
  return db.select().from(plans).where(eq(plans.slug, slug)).get();
}

/** URL-safe slug from a human label, uniquified against what's stored. */
export function slugFor(label: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "plan";
  let slug = base;
  for (let n = 2; getPlan(slug) !== undefined; n += 1) {
    slug = `${base}-${n}`;
  }
  return slug;
}

export function createPlan(label: string): Plan {
  return db.insert(plans).values({ slug: slugFor(label), label }).returning().get();
}

export function addToPlan(
  planId: number,
  courseId: number,
  status: "completed" | "planned",
  semester: string | null,
): void {
  // UNIQUE (plan_id, course_id) means re-adding a course moves it between
  // completed and planned (and updates its semester) rather than stacking a
  // second copy of its units.
  db.insert(planItems)
    .values({ planId, courseId, status, semester })
    .onConflictDoUpdate({
      target: [planItems.planId, planItems.courseId],
      set: { status, semester },
    })
    .run();
}

/** Set the status of ONE semester of a two-semester course. Part 1 is the
 *  row's `status`, part 2 its `second_status`. Changing part 1 first pins
 *  part 2 to what it currently shows (a null second status follows the
 *  first), so marking the first semester done never marks the second. */
export function setPartStatus(
  planId: number,
  courseId: number,
  part: 1 | 2,
  status: "completed" | "planned",
): void {
  const where = and(eq(planItems.planId, planId), eq(planItems.courseId, courseId));
  if (part === 2) {
    db.update(planItems).set({ secondStatus: status }).where(where).run();
  } else {
    // In an UPDATE, the right-hand side reads the row's OLD values, so the
    // second status is pinned before the first one changes.
    db.update(planItems)
      .set({
        status,
        secondStatus: sql`coalesce(${planItems.secondStatus}, ${planItems.status})`,
      })
      .where(where)
      .run();
  }
}

/** Re-file an existing plan item under a different semester without
 *  touching its completed/planned status. */
export function moveToSemester(planId: number, courseId: number, semester: string | null): void {
  db.update(planItems)
    .set({ semester })
    .where(and(eq(planItems.planId, planId), eq(planItems.courseId, courseId)))
    .run();
}

export { canStartIn, everySemester, FULL_TIME_LOAD, INTAKES, isTwoSemester, semesterOptions, semesterUnits, startSemesters, studyPlanBySemester, unitsPerSemester };
export type { ChosenItem, SemesterGroup, SemesterRow };

export function removeFromPlan(planId: number, courseId: number): void {
  db.delete(planItems)
    .where(and(eq(planItems.planId, planId), eq(planItems.courseId, courseId)))
    .run();
}

/** Everything a plan page renders: the plan, its courses, and the verdict. */
export function planProgress(plan: Plan): {
  progress: PlanProgress;
  chosen: ChosenItem[];
  /** Every requirement's own candidate pool, keyed by the requirement's
   *  natural key (RequirementProgress carries the key, not the numeric id,
   *  so this is what a page can actually look a pool up by). */
  poolsByKey: Map<string, ReturnType<typeof resolvePool>>;
  /** Which specialisation (if any) owns each requirement, by key.
   *  RequirementProgress doesn't carry this — it's a display grouping
   *  concern, not something the engine needs — so a page that wants to fold
   *  a specialisation's floor checks into its own umbrella category (rather
   *  than giving the floor a disconnected box of its own) looks it up here. */
  specialisationIdByKey: Map<string, number | null>;
  /** The floors that are a LEVEL minimum ("at least 12 units of 8000-level
   *  courses"), by key. RequirementProgress doesn't carry the level filter,
   *  so a page that treats these minimums specially looks them up here. */
  levelFloorKeys: Set<string>;
} {
  const catalogue = listCourses();
  const byId = new Map(catalogue.map((course) => [course.id, course]));
  const items = db.select().from(planItems).where(eq(planItems.planId, plan.id)).all();
  const allRequirements = db.select().from(requirements).all();
  const poolRows = db.select().from(requirementCourses).all();

  const progress = evaluatePlan(
    catalogue,
    allRequirements,
    poolRows,
    items.map((item) => {
      const course = byId.get(item.courseId);
      if (!course || !isTwoSemester(course)) {
        return { courseId: item.courseId, status: item.status };
      }
      // Each semester of a two-semester course is half its units, completed
      // or not on its own. A null second status means "same as the first".
      const half = course.units / 2;
      const second = item.secondStatus ?? item.status;
      const completedUnits =
        (item.status === "completed" ? half : 0) + (second === "completed" ? half : 0);
      return { courseId: item.courseId, status: item.status, completedUnits };
    }),
    plan.specialisationId,
  );

  const chosen: ChosenItem[] = items
    .flatMap((item) => {
      const course = byId.get(item.courseId);
      if (!course) return [];
      return [
        {
          course,
          status: item.status,
          semester: item.semester,
          ...(isTwoSemester(course)
            ? { secondStatus: item.secondStatus ?? item.status }
            : {}),
        },
      ];
    })
    .sort((a, b) => a.course.code.localeCompare(b.course.code));

  const poolsByKey = new Map(
    allRequirements.map((requirement) => [
      requirement.key,
      resolvePool(requirement, catalogue, poolRows),
    ]),
  );

  const specialisationIdByKey = new Map(
    allRequirements.map((requirement) => [requirement.key, requirement.specialisationId]),
  );

  const levelFloorKeys = new Set(
    allRequirements
      .filter((requirement) => requirement.kind === "floor" && requirement.minLevel !== null)
      .map((requirement) => requirement.key),
  );

  return { progress, chosen, poolsByKey, specialisationIdByKey, levelFloorKeys };
}

export { availableForRequirement } from "./course-planner";


