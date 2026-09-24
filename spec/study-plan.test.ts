import { beforeAll, describe, expect, inject, it } from "vitest";

// Over HTTP, against the built artefact — spec/global-setup.ts boots
// dist/server/entry.mjs, so this is what production actually runs, and each
// run gets a fresh throwaway database (spec/README.md's "invariants" note).
// Follows spec/guestbook.test.ts's pattern: Astro rejects a form POST
// without a same-origin Origin header.
const baseUrl = inject("baseUrl");

const post = (path: string, body: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

async function planHtml(slug: string): Promise<string> {
  const res = await fetch(new URL(`/plan/${slug}/`, baseUrl));
  return res.text();
}

/** Exact substring extraction between two literal markers — no assumptions
 *  about what either marker is (a heading, an id, end of string). */
function between(html: string, start: string, end: string): string {
  const from = html.indexOf(start);
  if (from === -1) throw new Error(`couldn't find start marker ${JSON.stringify(start)}`);
  const to = end === "" ? html.length : html.indexOf(end, from);
  if (to === -1) throw new Error(`couldn't find end marker ${JSON.stringify(end)} after start`);
  return html.slice(from, to);
}

/** The one semester group whose heading id is `sem-${slug}` — anchored on
 *  the id rather than the display text, since "Not yet scheduled" and every
 *  semester label also appear inside every row's own "move to…" <select>.
 *  A semester with nothing filed under it renders no section at all, which
 *  is not an error — it's what "0 rows in that group" looks like. */
function semesterGroup(studyPlan: string, slug: string): string | undefined {
  if (!studyPlan.includes(`id="sem-${slug}"`)) return undefined;
  return between(studyPlan, `id="sem-${slug}"`, "</section>");
}

/** How many rows actually carry this course code — the code appears in a
 *  `<span class="code">`, but also in every row's own button/label text
 *  ("Mark X as completed", "Remove X", "Move X to semester"), so counting
 *  raw substring occurrences overcounts a single row by 4x. */
function rowsFor(html: string | undefined, code: string): number {
  if (html === undefined) return 0;
  return html.split(`<span class="code">${code}</span>`).length - 1;
}

function courseIdFor(html: string, code: string): string {
  const match = new RegExp(`<option value="(\\d+)">${code}\\b`).exec(html);
  if (!match) throw new Error(`no catalogue option for ${code}`);
  return match[1];
}

describe("the study plan groups by semester", () => {
  let slug: string;
  const unique = `spec probe ${process.hrtime.bigint()}`;

  beforeAll(async () => {
    const res = await post("/api/plans", new URLSearchParams({ label: unique }));
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
  });

  it("shows a freshly added course under the semester it was added with", async () => {
    const html = await planHtml(slug);
    const courseId = courseIdFor(html, "COMP6250");

    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId, status: "completed", semester: "2026 Semester 1" }),
    );

    // Refetch, the spec's explicit persistence-through-reload requirement,
    // now exercised for the new semester field specifically.
    const after = await planHtml(slug);
    const studyPlan = between(after, "<h2>My Study Plan", "<h2>Degree Progress");
    expect(rowsFor(semesterGroup(studyPlan, "2026-semester-1"), "COMP6250")).toBe(1);
    expect(rowsFor(semesterGroup(studyPlan, "none"), "COMP6250")).toBe(0);
  });

  it("moves a course to a different semester without duplicating it", async () => {
    const before = await planHtml(slug);
    const courseId = courseIdFor(before, "COMP6442");

    // Added as COMPLETED specifically: moveToSemester's default in the API
    // route falls back to "planned" whenever a request omits status
    // entirely, exactly like a bare move POST does. Starting from "planned"
    // would make a bug that resets it to "planned" invisible.
    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId, status: "completed", semester: "2026 Semester 2" }),
    );
    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId, action: "move", semester: "2025 Semester 1" }),
    );

    const after = await planHtml(slug);
    const studyPlan = between(after, "<h2>My Study Plan", "<h2>Degree Progress");
    const newGroup = semesterGroup(studyPlan, "2025-semester-1");
    expect(rowsFor(newGroup, "COMP6442")).toBe(1);
    expect(rowsFor(semesterGroup(studyPlan, "2026-semester-2"), "COMP6442")).toBe(0);

    // moveToSemester must not also change completed/planned — it was
    // completed above and the move call carried no status of its own.
    expect(newGroup).toContain('class="status completed"');
    expect(newGroup).not.toContain('class="status planned"');
  });

  it("re-adding a course with a new semester re-files it instead of duplicating it", async () => {
    // A course untouched by any other test in this file, so this test can't
    // collide with "credits a course added through a category selector",
    // which later needs its own free course to add.
    const before = await planHtml(slug);
    const courseId = courseIdFor(before, "MATH6005");

    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId, status: "completed", semester: "2026 Semester 1" }),
    );
    // Same course, same status, a DIFFERENT semester — not a "move", the
    // plain add path, which UNIQUE (plan_id, course_id) turns into an update.
    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId, status: "completed", semester: "2025 Semester 2" }),
    );

    const after = await planHtml(slug);
    const studyPlan = between(after, "<h2>My Study Plan", "<h2>Degree Progress");
    expect(rowsFor(semesterGroup(studyPlan, "2025-semester-2"), "MATH6005")).toBe(1);
    expect(rowsFor(semesterGroup(studyPlan, "2026-semester-1"), "MATH6005")).toBe(0);
    // Exactly one row for this course anywhere in the whole study plan —
    // re-adding must re-file it, not add a second copy under the new group.
    expect(studyPlan.split(`<span class="code">MATH6005</span>`).length - 1).toBe(1);
  });

  it("defaults an item added with no semester to Not yet scheduled", async () => {
    const before = await planHtml(slug);
    const courseId = courseIdFor(before, "COMP6710");

    await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "completed" }));

    const after = await planHtml(slug);
    const studyPlan = between(after, "<h2>My Study Plan", "<h2>Degree Progress");
    expect(rowsFor(semesterGroup(studyPlan, "none"), "COMP6710")).toBe(1);
  });

  it("credits a course added through a category selector identically to any other add", async () => {
    // The Course Planner section's per-requirement selectors and My Study
    // Plan's generic add both post to the same /api/plan-items — there is
    // no parallel code path for them to disagree over. Adding through the
    // compulsory-core category should move Degree Progress's core figure
    // exactly as adding the same course any other way would.
    const before = await planHtml(slug);
    const planner = between(before, "<h2>ANU Course Planner", "<h2>My Study Plan");
    const coreForm = between(planner, 'id="cat-mcomp-core"', "</form>");
    const courseId = courseIdFor(coreForm, "COMP8260");

    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId, status: "completed", semester: "" }),
    );

    const after = await planHtml(slug);
    const progress = between(after, "<h2>Degree Progress", "");
    const coreSection = between(progress, 'id="req-mcomp-core"', "</section>");
    expect(coreSection).toContain("COMP8260");
  });
});

describe("floor categories in the Course Planner have no picker of their own", () => {
  let slug: string;

  beforeAll(async () => {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `floor probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    // Professional Computing's pcom-min-8000 is a floor, scoped to the
    // specialisation — resolvePool has no way to keep its bare 8000-8999
    // level filter from also matching courses that belong to a program-level
    // bucket or a different specialisation, so it must not get its own
    // add-selector at all (see spec/progress.test.ts's cmsy-min-8000-style
    // scoping tests for the engine side of this).
    const html = await planHtml(slug);
    const pcomId = new RegExp('<option value="(\\d+)"[^>]*>\\s*Professional Computing').exec(html)?.[1];
    if (!pcomId) throw new Error("Professional Computing not found in the specialisation list");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: pcomId }));
  });

  it("gives the degree-wide 8000-level floor no add-selector", async () => {
    const html = await planHtml(slug);
    const planner = between(html, "<h2>ANU Course Planner", "<h2>My Study Plan");
    const category = between(planner, 'id="cat-mcomp-min-8000-comp"', "</section>");
    expect(category).not.toContain('class="picker"');
  });

  it("gives the specialisation's own 8000-level floor no add-selector either", async () => {
    const html = await planHtml(slug);
    const planner = between(html, "<h2>ANU Course Planner", "<h2>My Study Plan");
    const category = between(planner, 'id="cat-pcom-min-8000"', "</section>");
    expect(category).not.toContain('class="picker"');
    expect(category).toContain("Counted automatically");
  });

  it("still gives every allocating and cap category its selector", async () => {
    const html = await planHtml(slug);
    const planner = between(html, "<h2>ANU Course Planner", "<h2>My Study Plan");
    for (const key of ["mcomp-core", "pcom-core", "pcom-elective", "pcom-8000-comp"]) {
      const category = between(planner, `id="cat-${key}"`, "</section>");
      expect(category, key).toContain('class="picker"');
    }
  });
});

describe("an allocating or cap category hides its picker once full", () => {
  let slug: string;

  beforeAll(async () => {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `full-category probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
  });

  it("hides the foundational picker after just one of its two either/or courses", async () => {
    // The pool holds 12 units across MATH6005 and COMP6260 for a 6-unit
    // requirement, so one course alone meets it — the other should stop
    // being offered rather than dangle as if it still mattered here.
    const before = await planHtml(slug);
    const courseId = courseIdFor(before, "MATH6005");
    await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "completed" }));

    const after = await planHtml(slug);
    const planner = between(after, "<h2>ANU Course Planner", "<h2>My Study Plan");
    const category = between(planner, 'id="cat-mcomp-foundational"', "</section>");
    expect(category).not.toContain('class="picker"');
    expect(category).toContain("already in your plan");
    // The picker is gone, but COMP6260 must still be choosable elsewhere —
    // this is about foundational specifically, not about removing the
    // course from the catalogue.
    expect(planner).toContain("COMP6260");
  });

  it("keeps a cap's picker visible at zero units — full means AT the ceiling, not merely not-yet-over", async () => {
    // onTrack for a cap means "not exceeded", which is true before anything
    // has been chosen at all. Using that field directly would hide the
    // picker from the very start, which is the bug this guards against.
    const html = await planHtml(slug);
    const cmsyId = new RegExp('<option value="(\\d+)"[^>]*>\\s*Computer Systems').exec(html)?.[1];
    if (!cmsyId) throw new Error("Computer Systems not found in the specialisation list");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: cmsyId }));

    const after = await planHtml(slug);
    const planner = between(after, "<h2>ANU Course Planner", "<h2>My Study Plan");
    const category = between(planner, 'id="cat-cmsy-foundation"', "</section>");
    expect(category).toContain('class="picker"');
  });

  it("hides that same cap's picker once it reaches its ceiling", async () => {
    const before = await planHtml(slug);
    for (const code of ["COMP6330", "COMP6331"]) {
      const html = await planHtml(slug);
      const courseId = courseIdFor(html, code);
      await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "completed" }));
    }
    void before;

    const after = await planHtml(slug);
    const planner = between(after, "<h2>ANU Course Planner", "<h2>My Study Plan");
    const category = between(planner, 'id="cat-cmsy-foundation"', "</section>");
    expect(category).not.toContain('class="picker"');
    expect(category).toContain("already in your plan");
  });
});
