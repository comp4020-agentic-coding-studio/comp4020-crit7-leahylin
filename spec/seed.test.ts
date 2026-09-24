import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import {
  courses,
  planItems,
  plans,
  requirementCourses,
  requirements,
} from "../src/lib/schema";
import { seed, seedCounts } from "../src/lib/seed";

// The seed against a real, migrated database, in memory. CLAUDE.md's first
// rule is about what a boot does to a database that already has data in it:
// reference data is corrected, user data is left alone. The HTTP specs can't
// see that — global-setup hands every run a fresh database — so it's here.

function freshDb() {
  const db = drizzle(new Database(":memory:"));
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db);
  return db;
}

describe("seed on a database that already holds data", () => {
  it("removes a requirement that's no longer in the seed data, and its pool, but keeps the user's plan", () => {
    const db = freshDb();
    const before = seedCounts(db);

    // A rule that used to be seeded (like Data Science's old 24-unit list)
    // and a plan with a course in it.
    const stale = db
      .insert(requirements)
      .values({ key: "stale-rule", label: "Gone", requiredUnits: 24, kind: "allocating" })
      .returning()
      .get();
    const course = db.select().from(courses).where(eq(courses.code, "COMP6250")).get();
    if (!course) throw new Error("COMP6250 not seeded");
    db.insert(requirementCourses)
      .values({ requirementId: stale.id, courseId: course.id, role: "include" })
      .run();
    const plan = db.insert(plans).values({ slug: "mine", label: "Mine" }).returning().get();
    db.insert(planItems).values({ planId: plan.id, courseId: course.id, status: "completed" }).run();

    seed(db);

    expect(db.select().from(requirements).where(eq(requirements.key, "stale-rule")).get()).toBeUndefined();
    expect(
      db.select().from(requirementCourses).where(eq(requirementCourses.requirementId, stale.id)).all(),
    ).toEqual([]);
    // Reference data back to exactly what a fresh seed gives; the user's
    // plan and its course untouched.
    const after = seedCounts(db);
    expect(after.requirements).toBe(before.requirements);
    expect(after.requirementCourses).toBe(before.requirementCourses);
    expect(after.plans).toBe(before.plans + 1);
    expect(after.planItems).toBe(before.planItems + 1);
  });

  it("changes nothing when run twice", () => {
    const db = freshDb();
    const once = seedCounts(db);
    seed(db);
    expect(seedCounts(db)).toEqual(once);
  });

  it("seeds Data Science as its two blocks, not the old single list", () => {
    const db = freshDb();
    const keys = db
      .select({ key: requirements.key, kind: requirements.kind, units: requirements.requiredUnits })
      .from(requirements)
      .all()
      .filter((r) => r.key.startsWith("dtsc-"))
      .sort((a, b) => a.key.localeCompare(b.key));
    expect(keys).toEqual([
      { key: "dtsc-compulsory", kind: "allocating", units: 18 },
      { key: "dtsc-elective", kind: "allocating", units: 6 },
      { key: "dtsc-min-8000", kind: "floor", units: 12 },
    ]);
  });
});
