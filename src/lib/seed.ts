import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  courses,
  planItems,
  plans,
  requirementCourses,
  requirements,
} from "./schema";
import {
  COURSES,
  DEMO_PLAN,
  REQUIREMENTS,
  levelOf,
  subjectOf,
} from "./seed-data";

/**
 * Writes the degree's reference data into whatever database it's handed.
 *
 * Called from src/lib/db.ts on every boot, which is not a convenience: the
 * spec harness (spec/global-setup.ts) points DATABASE_PATH at a fresh temp
 * file per run, so every test starts on an empty database and nothing else
 * would ever put the MCOMP rules there.
 *
 * Three constraints shape how this is written, each verified against this
 * repo's exact dependency versions rather than assumed:
 *
 *  1. It must be idempotent. Reference data is re-asserted on every boot,
 *     including boots against the Fly volume that already holds it. Every
 *     insert is `onConflictDoNothing` against a real UNIQUE constraint on a
 *     natural key (course code, requirement key, plan slug), so re-seeding
 *     is a no-op per row. A "skip it all if the table is non-empty" guard
 *     would be cheaper but wrong — it silently refuses to add the 25th
 *     course to a database that already holds 24.
 *
 *  2. Insert order is load-bearing. better-sqlite3 is compiled with
 *     SQLITE_DEFAULT_FOREIGN_KEYS=1, so foreign keys are enforced even
 *     though db.ts only sets journal_mode, and a transaction does not defer
 *     the checks. Parents before children: courses and requirements before
 *     requirement_courses, plans before plan_items.
 *
 *  3. The transaction callback must stay synchronous. drizzle's
 *     better-sqlite3 driver delegates to better-sqlite3's native
 *     transaction(), which rejects a callback returning a promise
 *     ("Transaction function cannot return a promise").
 */
export function seed(db: BetterSQLite3Database): void {
  db.transaction((tx) => {
    // --- reference data: the degree ------------------------------------
    tx.insert(courses)
      .values(
        COURSES.map((course) => ({
          code: course.code,
          title: course.title,
          units: course.units,
          // Derived from the code so the two can't drift apart.
          subject: subjectOf(course.code),
          level: levelOf(course.code),
        })),
      )
      .onConflictDoNothing()
      .run();

    tx.insert(requirements)
      .values(
        REQUIREMENTS.map((requirement) => ({
          key: requirement.key,
          label: requirement.label,
          detail: requirement.detail,
          requiredUnits: requirement.requiredUnits,
          sortOrder: requirement.sortOrder,
          subjects: requirement.subjects ?? null,
          minLevel: requirement.minLevel ?? null,
          maxLevel: requirement.maxLevel ?? null,
        })),
      )
      .onConflictDoNothing()
      .run();

    // The join rows need primary keys, and an insert that conflicted
    // returns nothing at all — `.returning().get()` is `undefined` on the
    // second boot rather than the existing row. So read the ids back.
    const courseIdByCode = new Map(
      tx
        .select({ id: courses.id, code: courses.code })
        .from(courses)
        .all()
        .map((row) => [row.code, row.id] as const),
    );
    const requirementIdByKey = new Map(
      tx
        .select({ id: requirements.id, key: requirements.key })
        .from(requirements)
        .all()
        .map((row) => [row.key, row.id] as const),
    );

    const poolRows: {
      requirementId: number;
      courseId: number;
      role: "include" | "exclude";
    }[] = [];

    for (const requirement of REQUIREMENTS) {
      const requirementId = requirementIdByKey.get(requirement.key);
      if (requirementId === undefined) continue;

      for (const [role, codes] of [
        ["include", requirement.include],
        ["exclude", requirement.exclude],
      ] as const) {
        for (const code of codes ?? []) {
          const courseId = courseIdByCode.get(code);
          // A rule naming a course that isn't in the catalogue is a bug in
          // the seed data, not a runtime condition — fail loudly rather
          // than quietly seeding a requirement with a hole in its pool.
          if (courseId === undefined) {
            throw new Error(
              `seed: requirement "${requirement.key}" names ${code}, which is not in the catalogue`,
            );
          }
          poolRows.push({ requirementId, courseId, role });
        }
      }
    }

    if (poolRows.length > 0) {
      tx.insert(requirementCourses).values(poolRows).onConflictDoNothing().run();
    }

    // --- user data: kept deliberately separate -------------------------
    // Everything above describes the degree and is identical in every
    // database. This is the one row that belongs to a user, and it exists
    // only so /plan/demo/ resolves for the invariants.
    tx.insert(plans).values(DEMO_PLAN).onConflictDoNothing().run();
  });
}

/** Row counts, for proving a second boot changed nothing. */
export function seedCounts(db: BetterSQLite3Database): Record<string, number> {
  return {
    courses: db.select().from(courses).all().length,
    requirements: db.select().from(requirements).all().length,
    requirementCourses: db.select().from(requirementCourses).all().length,
    plans: db.select().from(plans).all().length,
    planItems: db.select().from(planItems).all().length,
  };
}
