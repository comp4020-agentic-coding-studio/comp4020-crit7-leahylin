import { inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  courses,
  planItems,
  plans,
  requirementCourses,
  requirements,
  specialisations,
} from "./schema";
import {
  COURSES,
  DEMO_PLAN,
  REQUIREMENTS,
  SPECIALISATIONS,
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
 *  1. Reference data UPSERTS; user data does not. This distinction is the
 *     whole game, and getting it wrong is invisible locally.
 *
 *     The degree's definition is authoritative in code, so courses and
 *     requirements are written with `onConflictDoUpdate` on their natural
 *     key: a boot against a database that already holds them corrects them.
 *     `onConflictDoNothing` was the first attempt and was a real bug —
 *     adding the `kind` column left every existing row on its 'allocating'
 *     default, so the deployed app (whose volume outlives the deploy) would
 *     have treated the 96-unit total and the 8000-level floor as allocating
 *     buckets, while a fresh local database looked perfectly correct.
 *
 *     Pool rows are rebuilt rather than upserted, because their columns ARE
 *     their key: an upsert cannot notice a course that was REMOVED from a
 *     requirement's pool, and a stale include row silently widens a rule.
 *
 *     The demo plan stays `onConflictDoNothing`: it belongs to a user, and
 *     re-asserting it every boot would undo their edits.
 *
 *     A "skip it all if the table is non-empty" guard would be cheaper than
 *     any of this and wrong in the same direction — it silently refuses to
 *     add the 25th course to a database that already holds 24.
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
      .onConflictDoUpdate({
        target: courses.code,
        set: {
          title: sql`excluded.title`,
          units: sql`excluded.units`,
          subject: sql`excluded.subject`,
          level: sql`excluded.level`,
        },
      })
      .run();

    tx.insert(specialisations)
      .values(SPECIALISATIONS)
      .onConflictDoUpdate({
        target: specialisations.slug,
        set: {
          label: sql`excluded.label`,
          code: sql`excluded.code`,
          modelled: sql`excluded.modelled`,
        },
      })
      .run();

    // Needed before the requirements insert, because each rule that belongs
    // to a specialisation carries its id.
    const specialisationIdBySlug = new Map(
      tx
        .select({ id: specialisations.id, slug: specialisations.slug })
        .from(specialisations)
        .all()
        .map((row) => [row.slug, row.id] as const),
    );

    tx.insert(requirements)
      .values(
        REQUIREMENTS.map((requirement) => ({
          key: requirement.key,
          label: requirement.label,
          detail: requirement.detail,
          requiredUnits: requirement.requiredUnits,
          sortOrder: requirement.sortOrder,
          kind: requirement.kind ?? "allocating",
          subjects: requirement.subjects ?? null,
          minLevel: requirement.minLevel ?? null,
          maxLevel: requirement.maxLevel ?? null,
          specialisationId:
            requirement.specialisation === undefined
              ? null
              : (specialisationIdBySlug.get(requirement.specialisation) ??
                (() => {
                  throw new Error(
                    `seed: requirement "${requirement.key}" names specialisation ` +
                      `"${requirement.specialisation}", which is not seeded`,
                  );
                })()),
        })),
      )
      .onConflictDoUpdate({
        target: requirements.key,
        set: {
          label: sql`excluded.label`,
          detail: sql`excluded.detail`,
          kind: sql`excluded.kind`,
          requiredUnits: sql`excluded.required_units`,
          sortOrder: sql`excluded.sort_order`,
          subjects: sql`excluded.subjects`,
          minLevel: sql`excluded.min_level`,
          maxLevel: sql`excluded.max_level`,
          specialisationId: sql`excluded.specialisation_id`,
        },
      })
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

    // Rebuilt, not upserted: a pool row's columns are its whole identity,
    // so an upsert can add a course to a pool but never remove one.
    const seededRequirementIds = [...requirementIdByKey.values()];
    if (seededRequirementIds.length > 0) {
      tx.delete(requirementCourses)
        .where(inArray(requirementCourses.requirementId, seededRequirementIds))
        .run();
    }
    if (poolRows.length > 0) {
      tx.insert(requirementCourses).values(poolRows).run();
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
    specialisations: db.select().from(specialisations).all().length,
    courses: db.select().from(courses).all().length,
    requirements: db.select().from(requirements).all().length,
    requirementCourses: db.select().from(requirementCourses).all().length,
    plans: db.select().from(plans).all().length,
    planItems: db.select().from(planItems).all().length,
  };
}
