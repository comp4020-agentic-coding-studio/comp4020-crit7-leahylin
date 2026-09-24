import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  type PlanProgress,
  type RequirementProgress,
  evaluatePlan,
  resolvePool,
} from "./progress";
import {
  type ChosenItem,
  type SemesterGroup,
  semesterOptions,
  studyPlanBySemester,
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

export function listCourses(): Course[] {
  return db.select().from(courses).orderBy(asc(courses.code)).all();
}

export function listPlans(): Plan[] {
  return db.select().from(plans).orderBy(asc(plans.label)).all();
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

/** Re-file an existing plan item under a different semester without
 *  touching its completed/planned status. */
export function moveToSemester(planId: number, courseId: number, semester: string | null): void {
  db.update(planItems)
    .set({ semester })
    .where(and(eq(planItems.planId, planId), eq(planItems.courseId, courseId)))
    .run();
}

export { semesterOptions, studyPlanBySemester };
export type { ChosenItem, SemesterGroup };

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
    items.map((item) => ({ courseId: item.courseId, status: item.status })),
    plan.specialisationId,
  );

  const chosen: ChosenItem[] = items
    .flatMap((item) => {
      const course = byId.get(item.courseId);
      return course ? [{ course, status: item.status, semester: item.semester }] : [];
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

  return { progress, chosen, poolsByKey, specialisationIdByKey };
}

/** For one requirement, the courses in its pool not already in the plan —
 *  what "ANU Course Planner" offers to add under that category. Sorted by
 *  code, same as everywhere else courses are listed. */
export function availableForRequirement(
  requirement: Pick<RequirementProgress, "key">,
  catalogue: Course[],
  poolsByKey: Map<string, ReturnType<typeof resolvePool>>,
  chosenIds: Set<number>,
): Course[] {
  const pool = poolsByKey.get(requirement.key) ?? new Set<number>();
  return catalogue
    .filter((course) => pool.has(course.id) && !chosenIds.has(course.id))
    .sort((a, b) => a.code.localeCompare(b.code));
}


