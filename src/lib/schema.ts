import { sql } from "drizzle-orm";
import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// --- the degree, as reference data -------------------------------------
// courses, requirements and the pools that join them are seeded from ANU
// Programs and Courses at boot (src/lib/seed.ts), not entered by users.

// The seven specialisations MCOMP offers, one of which is compulsory. Only
// Professional Computing has its requirements modelled here — the other six
// are declarable but carry no rules, and `modelled` is what lets the UI say
// so instead of showing a misleadingly empty panel.
export const specialisations = sqliteTable("specialisations", {
  id: int().primaryKey({ autoIncrement: true }),
  slug: text().notNull().unique(),
  label: text().notNull(),
  /** The ANU specialisation code, where confirmed (e.g. PCOM-SPEC). */
  code: text(),
  modelled: int({ mode: "boolean" }).notNull().default(false),
});

export const courses = sqliteTable("courses", {
  id: int().primaryKey({ autoIncrement: true }),
  // The natural key, and what makes the seed idempotent.
  code: text().notNull().unique(),
  title: text().notNull(),
  units: int().notNull(),
  // Stored rather than parsed out of the code on every read, because the
  // level-filtered requirements ("a minimum of 24 units of 8000-level COMP")
  // compare against it constantly.
  level: int().notNull(),
  subject: text().notNull(),
});

// Every requirement is the same shape: "N units from a candidate pool".
// Compulsory core is not a special case — it is "24 units from a pool of
// four 6-unit courses", satisfiable only by taking all four.
//
// A pool is resolved in this order (see src/lib/progress.ts):
//   1. explicit `include` rows in requirement_courses, if any exist
//   2. otherwise the subjects/minLevel/maxLevel filter, if any is set
//   3. otherwise every course (the total, and the open electives)
// and `exclude` rows are always subtracted from whatever that produced.
export const requirements = sqliteTable("requirements", {
  id: int().primaryKey({ autoIncrement: true }),
  // Stable hand-written key so the seed can upsert without duplicating.
  key: text().notNull().unique(),
  label: text().notNull(),
  // The rule in the words Programs and Courses uses, shown in the UI so a
  // reader can check the app against the source.
  detail: text(),
  requiredUnits: int("required_units").notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  // How this requirement consumes units, which is the difference between
  // reporting coverage and reporting a real audit:
  //
  //   allocating — spends units. Each course counts toward at most one
  //                allocating requirement, so a core course cannot also
  //                fill the open elective bucket.
  //   floor      — a minimum across the whole degree ("at least 24 units of
  //                8000-level COMP"). Counts every matching course and
  //                spends nothing; overlapping with allocating buckets is
  //                the intended reading, not a bug.
  //   total      — the degree's size. Counts everything, spends nothing,
  //                and is the one bucket meant to be exceeded.
  //   cap        — a CEILING: "a maximum of 12 units from this list". Spends
  //                nothing, and unlike every other kind it is not something
  //                to fill but something to stay under, so it is the one
  //                kind that can be violated outright.
  kind: text({ enum: ["allocating", "floor", "total", "cap"] })
    .notNull()
    .default("allocating"),
  // The filter half of a pool. All nullable; null means unconstrained.
  // `subjects` is a comma-separated list ("COMP,ENGN") — a deliberate
  // simplification over a fourth table for at most two values.
  subjects: text(),
  minLevel: int("min_level"),
  maxLevel: int("max_level"),
  // Null for a program-level rule. Set for a rule that only applies once
  // that specialisation is declared — the engine drops the others entirely
  // rather than showing them unmet.
  //
  // Nullable with no default on purpose: better-sqlite3 enforces foreign
  // keys, and SQLite refuses to ADD COLUMN with a REFERENCES clause unless
  // the default is NULL. Making this notNull would break the migration.
  specialisationId: int("specialisation_id").references(() => specialisations.id),
});

export const requirementCourses = sqliteTable(
  "requirement_courses",
  {
    id: int().primaryKey({ autoIncrement: true }),
    requirementId: int("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    courseId: int("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    // `exclude` exists because of a real rule: the Professional Computing
    // specialisation's last 6 units are "any 8000 level COMP coded course
    // excluding project courses" (COMP8715, COMP8800, COMP8830).
    role: text({ enum: ["include", "exclude"] })
      .notNull()
      .default("include"),
  },
  (t) => [unique().on(t.requirementId, t.courseId, t.role)],
);

// --- a user's plan -----------------------------------------------------

export const plans = sqliteTable("plans", {
  id: int().primaryKey({ autoIncrement: true }),
  slug: text().notNull().unique(),
  label: text().notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  // Which specialisation this plan has declared, if any. Same nullability
  // constraint as above.
  specialisationId: int("specialisation_id").references(() => specialisations.id),
});

export const planItems = sqliteTable(
  "plan_items",
  {
    id: int().primaryKey({ autoIncrement: true }),
    planId: int("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    courseId: int("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: text({ enum: ["completed", "planned"] })
      .notNull()
      .default("planned"),
    // Which semester this course is filed under, e.g. "2026 Semester 1".
    // Nullable: null means "not yet scheduled". The app only ever writes a
    // value chosen from a generated <select> (see the plan page), so this
    // stays a small, sortable set of strings despite the column being plain
    // text — no enum, because the set of valid values shifts every year.
    semester: text(),
  },
  // A course sits in a plan once; adding it again changes its status
  // rather than stacking up duplicate units.
  (t) => [unique().on(t.planId, t.courseId)],
);

export type Specialisation = typeof specialisations.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type RequirementCourse = typeof requirementCourses.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
