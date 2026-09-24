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
 *  Every semester renders a section, empty or not; "Not yet scheduled" only
 *  does when something is in it, and is undefined here otherwise. */
function semesterGroup(studyPlan: string, slug: string): string | undefined {
  if (!studyPlan.includes(`id="sem-${slug}"`)) return undefined;
  return between(studyPlan, `id="sem-${slug}"`, "</section>");
}

/** How many rows actually carry this course code — the code appears in a
 *  `<span class="code">`, but also in every row's own button/label text
 *  ("Mark X as completed", "Remove X", "Semester for X"), so counting
 *  raw substring occurrences overcounts a single row by 4x. */
function rowsFor(html: string | undefined, code: string): number {
  if (html === undefined) return 0;
  return html.split(`<span class="code">${code}</span>`).length - 1;
}

function courseIdFor(html: string, code: string): string {
  // Other attributes may follow the value (COMP8715's option is marked as a
  // two-semester course), so match up to the tag's end, not a bare ">".
  const match = new RegExp(`<option value="(\\d+)"[^>]*>\\s*${code}\\b`).exec(html);
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
    const studyPlan = between(after, "My Study Plan</h2>", "Degree Progress</h2>");
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
    const studyPlan = between(after, "My Study Plan</h2>", "Degree Progress</h2>");
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
    const studyPlan = between(after, "My Study Plan</h2>", "Degree Progress</h2>");
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
    const studyPlan = between(after, "My Study Plan</h2>", "Degree Progress</h2>");
    expect(rowsFor(semesterGroup(studyPlan, "none"), "COMP6710")).toBe(1);
  });

  it("credits a course added through a category selector identically to any other add", async () => {
    // The Course Planner section's per-requirement selectors and My Study
    // Plan's generic add both post to the same /api/plan-items — there is
    // no parallel code path for them to disagree over. Adding through the
    // compulsory-core category should move Degree Progress's core figure
    // exactly as adding the same course any other way would.
    const before = await planHtml(slug);
    const planner = between(before, "ANU Course Planner</h2>", "My Study Plan</h2>");
    const coreForm = between(planner, 'id="cat-mcomp-core"', "</form>");
    const courseId = courseIdFor(coreForm, "COMP8260");

    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId, status: "completed", semester: "" }),
    );

    const after = await planHtml(slug);
    const progress = between(after, "Degree Progress</h2>", "");
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

  it("leaves the degree-wide 8000-level floor out of the Course Planner, but keeps it in Degree Progress", async () => {
    // It has nothing to add from, so the planner has nothing to say about
    // it that Degree Progress doesn't already say better.
    const html = await planHtml(slug);
    const planner = between(html, "ANU Course Planner</h2>", "My Study Plan</h2>");
    expect(planner).not.toContain('id="cat-mcomp-min-8000-comp"');
    expect(planner).not.toContain("8000-level COMP minimum");
    const progress = between(html, "Degree Progress</h2>", "");
    expect(progress).toContain("8000-level COMP minimum");
  });

  it("gives Professional Computing's own 8000-level floor no section of its own at all", async () => {
    // Unlike the degree-wide floor, a specialisation floor folds into its
    // specialisation's umbrella bucket (see the dedicated describe block
    // below) rather than getting a disconnected one-line box — so its own
    // id shouldn't appear as a section heading anywhere on the page.
    const html = await planHtml(slug);
    expect(html).not.toContain('id="cat-pcom-min-8000"');
  });

  it("still gives every allocating and cap category its selector", async () => {
    const html = await planHtml(slug);
    const planner = between(html, "ANU Course Planner</h2>", "My Study Plan</h2>");
    for (const key of ["mcomp-core", "pcom-core", "pcom-elective", "pcom-8000-comp"]) {
      const category = between(planner, `id="cat-${key}"`, "</section>");
      expect(category, key).toContain('class="picker"');
    }
  });
});

describe("a specialisation floor folds into its umbrella bucket", () => {
  let slug: string;

  beforeAll(async () => {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `fold probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const html = await planHtml(slug);
    const mchlId = new RegExp('<option value="(\\d+)"[^>]*>\\s*Machine Learning').exec(html)?.[1];
    if (!mchlId) throw new Error("Machine Learning not found in the specialisation list");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: mchlId }));
  });

  it("shows both the umbrella's and the folded floor's rule text, with no separate floor section, and no status line while there's still room to add", async () => {
    const html = await planHtml(slug);
    const planner = between(html, "ANU Course Planner</h2>", "My Study Plan</h2>");
    expect(planner).not.toContain('id="cat-mchl-min-8000"');

    const box = between(planner, 'id="cat-mchl-courses"', "</section>");
    expect(box).toContain("24 units from completion of courses from the following list.");
    expect(box).toContain("A minimum of 12 units of 8000-level courses.");
    // Nothing chosen yet, so the umbrella's own 24 units aren't full — the
    // picker stays up, and there's no "not yet met"/"already in your plan"
    // note to show until this box actually closes (see the two tests below).
    expect(box).toContain('class="picker"');
    expect(box).not.toContain("Not yet met.");
    expect(box).not.toContain("Full — this category has all the units it needs.");
  });

  it("shows exactly one note — the satisfied one — once both the umbrella and its folded floor are covered", async () => {
    // Four 6-unit courses closes the 24-unit umbrella exactly. Two of them,
    // COMP8600 and COMP8650, are 8000-level, clearing mchl-min-8000 (12u) at
    // the same time — so both the umbrella and the folded floor finish
    // together, which is exactly the case that used to print the same
    // "it's full" sentence twice.
    for (const code of ["COMP6261", "COMP6490", "COMP8600", "COMP8650"]) {
      const page = await planHtml(slug);
      const courseId = courseIdFor(page, code);
      await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "completed" }));
    }

    const after = await planHtml(slug);
    const planner = between(after, "ANU Course Planner</h2>", "My Study Plan</h2>");
    const box = between(planner, 'id="cat-mchl-courses"', "</section>");
    expect(box).not.toContain('class="picker"');
    const noteCount = box.split('<p class="note">').length - 1;
    expect(noteCount).toBe(1);
    expect(box).toContain("Full — this category has all the units it needs.");
  });

  it("shows exactly one note — 'Not yet met.' — when the umbrella is full but its folded floor isn't", async () => {
    // A fresh plan, not the shared one the other two tests in this block
    // build up cumulatively — reusing it here would leave COMP8600 and
    // COMP8650 from the earlier "satisfied" test still in the pool, which
    // would either satisfy the floor by accident or get credited to a
    // different bucket entirely depending on allocation tie-breaks. A clean
    // plan makes the four courses below the only ones in play.
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `fold probe unmet ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const freshSlug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const start = await planHtml(freshSlug);
    const mchlId = new RegExp('<option value="(\\d+)"[^>]*>\\s*Machine Learning').exec(start)?.[1];
    if (!mchlId) throw new Error("Machine Learning not found in the specialisation list");
    await post(
      "/api/plan-specialisation",
      new URLSearchParams({ slug: freshSlug, specialisationId: mchlId }),
    );

    // All four are below 8000-level, so the umbrella's 24 units are used up
    // (isFull) while mchl-min-8000 (12 units required) has zero units — the
    // box has nothing left to add, and it's genuinely still unmet.
    for (const code of ["COMP6261", "COMP6490", "COMP6528", "COMP6670"]) {
      const page = await planHtml(freshSlug);
      const courseId = courseIdFor(page, code);
      await post(
        "/api/plan-items",
        new URLSearchParams({ slug: freshSlug, courseId, status: "completed" }),
      );
    }

    const after = await planHtml(freshSlug);
    const planner = between(after, "ANU Course Planner</h2>", "My Study Plan</h2>");
    const box = between(planner, 'id="cat-mchl-courses"', "</section>");
    expect(box).not.toContain('class="picker"');
    const noteCount = box.split('<p class="note">').length - 1;
    expect(noteCount).toBe(1);
    expect(box).toContain("Not yet met.");
    expect(box).not.toContain("Full — this category has all the units it needs.");
  });
});

describe("a specialisation's 8000-level minimum limits what its picker offers", () => {
  // Machine Learning: 24 units from a list, at least 12 of them 8000-level.
  // So at most 12 units — two 6-unit courses — can be below 8000 level.
  async function freshMchlPlan(): Promise<string> {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `headroom probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const html = await planHtml(slug);
    const mchlId = new RegExp('<option value="(\\d+)"[^>]*>\\s*Machine Learning').exec(html)?.[1];
    if (!mchlId) throw new Error("Machine Learning not found in the specialisation list");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: mchlId }));
    return slug;
  }

  async function add(slug: string, codes: string[]): Promise<void> {
    for (const code of codes) {
      const courseId = courseIdFor(await planHtml(slug), code);
      await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "planned" }));
    }
  }

  async function mchlBox(slug: string): Promise<string> {
    const html = await planHtml(slug);
    const planner = between(html, "ANU Course Planner</h2>", "My Study Plan</h2>");
    return between(planner, 'id="cat-mchl-courses"', "</section>");
  }

  it("still offers courses below 8000 level after one of them", async () => {
    const slug = await freshMchlPlan();
    await add(slug, ["COMP6261"]);
    const box = await mchlBox(slug);
    expect(box).toContain("COMP6490 —");
    expect(box).toContain("COMP8600 —");
    expect(box).not.toContain('class="limit"');
  });

  it("doesn't count 8000-level courses against that limit: after two of them, both below-8000 slots are still open", async () => {
    const slug = await freshMchlPlan();
    await add(slug, ["COMP8600", "COMP8650"]);
    const box = await mchlBox(slug);
    expect(box).toContain("COMP6261 —");
    expect(box).toContain("COMP6490 —");
    expect(box).not.toContain('class="limit"');
  });

  it("offers only 8000-level courses once two below 8000 level are in, and says why", async () => {
    const slug = await freshMchlPlan();
    await add(slug, ["COMP6261", "COMP6490"]);
    const box = await mchlBox(slug);
    // The two remaining courses below 8000 level are gone...
    expect(box).not.toContain("COMP6528 —");
    expect(box).not.toContain("COMP6670 —");
    // ...every 8000-level one is still there...
    for (const code of ["COMP8600", "COMP8650", "COMP8880"]) {
      expect(box, code).toContain(`${code} —`);
    }
    // ...and the box says why.
    expect(box).toContain('class="limit"');
    expect(box).toContain("12 units of this specialisation are already");
  });
});

describe("COMP8715 runs over two consecutive semesters; COMP8830 over one", () => {
  async function freshPlan(): Promise<string> {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `project probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    return location.replace(/^\/plan\//, "").replace(/\/$/, "");
  }

  async function addAt(slug: string, code: string, semester: string): Promise<void> {
    const courseId = courseIdFor(await planHtml(slug), code);
    await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "planned", semester }));
  }

  function studyPlanOf(html: string): string {
    return between(html, "My Study Plan</h2>", "Degree Progress</h2>");
  }

  it("shows COMP8715 in its start semester and the next, still counting 12 units once", async () => {
    const slug = await freshPlan();
    await addAt(slug, "COMP8715", "2025 Semester 2");
    const html = await planHtml(slug);
    const plan = studyPlanOf(html);
    expect(rowsFor(semesterGroup(plan, "2025-semester-2"), "COMP8715")).toBe(1);
    expect(rowsFor(semesterGroup(plan, "2026-semester-1"), "COMP8715")).toBe(1);
    expect(semesterGroup(plan, "2025-semester-2")).toContain("Semester 1 of 2");
    expect(semesterGroup(plan, "2026-semester-1")).toContain("Semester 2 of 2");
    // 6 units in each of the two semesters, not 12 in both.
    expect(semesterGroup(plan, "2025-semester-2")).toContain('<span class="units">6u</span>');
    expect(semesterGroup(plan, "2026-semester-1")).toContain('<span class="units">6u</span>');
    // The audit is unchanged: one 12-unit project, counted once.
    const progress = between(html, "Degree Progress</h2>", "");
    const project = between(progress, 'id="req-mcomp-project"', "</section>");
    expect(project).toContain("12 planned of 12 units");
  });

  it("marks each semester of COMP8715 completed on its own", async () => {
    const slug = await freshPlan();
    await addAt(slug, "COMP8715", "2025 Semester 1");
    const html = await planHtml(slug);
    const moveId = /id="move-(\d+)"/.exec(studyPlanOf(html))?.[1];
    if (!moveId) throw new Error("no move select for COMP8715");
    const mark = (part: string, status: string) =>
      post(
        "/api/plan-items",
        new URLSearchParams({ slug, courseId: moveId, action: "status", part, status }),
      );
    const statusIn = (plan: string, sem: string) =>
      /class="status (completed|planned)"/.exec(semesterGroup(plan, sem) ?? "")?.[1];
    const projectFigure = (page: string) =>
      between(between(page, 'id="req-mcomp-project"', "</section>"), 'class="figure"', "</span>");

    // First semester done: only the first semester shows completed, and the
    // audit has 6 completed + 6 planned, not 12 completed.
    await mark("1", "completed");
    let page = await planHtml(slug);
    expect(statusIn(studyPlanOf(page), "2025-semester-1")).toBe("completed");
    expect(statusIn(studyPlanOf(page), "2025-semester-2")).toBe("planned");
    expect(projectFigure(page)).toContain("6 completed");
    expect(projectFigure(page)).toContain("6 planned");

    // Second semester done too: both completed, 12 completed.
    await mark("2", "completed");
    page = await planHtml(slug);
    expect(statusIn(studyPlanOf(page), "2025-semester-2")).toBe("completed");
    expect(projectFigure(page)).toContain("12 completed");
    expect(projectFigure(page)).not.toContain("planned");

    // Undoing the first leaves the second completed.
    await mark("1", "planned");
    page = await planHtml(slug);
    expect(statusIn(studyPlanOf(page), "2025-semester-1")).toBe("planned");
    expect(statusIn(studyPlanOf(page), "2025-semester-2")).toBe("completed");
  });

  it("keeps COMP8830 in a single semester", async () => {
    const slug = await freshPlan();
    await addAt(slug, "COMP8830", "2025 Semester 2");
    const plan = studyPlanOf(await planHtml(slug));
    expect(rowsFor(semesterGroup(plan, "2025-semester-2"), "COMP8830")).toBe(1);
    expect(rowsFor(semesterGroup(plan, "2026-semester-1"), "COMP8830")).toBe(0);
  });

  it("refuses to start COMP8715 in the last semester, whether adding or moving it", async () => {
    const slug = await freshPlan();
    await addAt(slug, "COMP8715", "2026 Semester 2");
    expect(studyPlanOf(await planHtml(slug))).not.toContain('<span class="code">COMP8715</span>');

    await addAt(slug, "COMP8715", "2026 Semester 1");
    const html = await planHtml(slug);
    const moveId = /id="move-(\d+)"/.exec(studyPlanOf(html))?.[1];
    if (!moveId) throw new Error("no move select for COMP8715");
    await post(
      "/api/plan-items",
      new URLSearchParams({ slug, courseId: moveId, action: "move", semester: "2026 Semester 2" }),
    );
    const plan = studyPlanOf(await planHtml(slug));
    expect(rowsFor(semesterGroup(plan, "2026-semester-1"), "COMP8715")).toBe(1);
    expect(rowsFor(semesterGroup(plan, "2026-semester-2"), "COMP8715")).toBe(1);
    expect(semesterGroup(plan, "2026-semester-1")).toContain("Semester 1 of 2");
    // And its own semester list never offers the last one to start in.
    const move = between(plan, `id="move-${moveId}"`, "</select>");
    expect(move).not.toContain("2026 Semester 2");
    expect(move).toContain("2026 Semester 1");
  });

  it("still lets a one-semester course go in the last semester", async () => {
    const slug = await freshPlan();
    await addAt(slug, "COMP8830", "2026 Semester 2");
    const plan = studyPlanOf(await planHtml(slug));
    expect(rowsFor(semesterGroup(plan, "2026-semester-2"), "COMP8830")).toBe(1);
  });
});

describe("a level minimum holds across every part of a specialisation's box", () => {
  // Computational Foundations: a theory list (at least 12 units) and a
  // foundations list (at most 12), and 12 of its 24 units at 8000 level —
  // so at most 12 below it, counting BOTH lists together.
  async function cfndPlan(): Promise<string> {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `cfnd probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const start = await planHtml(slug);
    const id = /<option value="(\d+)"[^>]*>\s*Computational Foundations/.exec(start)?.[1];
    if (!id) throw new Error("Computational Foundations not found");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: id }));
    return slug;
  }
  const add = async (slug: string, code: string) => {
    const courseId = courseIdFor(await planHtml(slug), code);
    await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "planned" }));
  };
  const parts = async (slug: string) => {
    const planner = between(await planHtml(slug), "ANU Course Planner</h2>", "My Study Plan</h2>");
    return {
      theory: between(planner, 'id="cat-cfnd-courses"', "</section>"),
      foundations: between(planner, 'id="cat-cfnd-list-b"', "</section>"),
    };
  };

  it("still offers courses below 8000 level in both lists after one of them", async () => {
    const slug = await cfndPlan();
    await add(slug, "COMP6361");
    const { theory, foundations } = await parts(slug);
    expect(theory).toContain("COMP6363 —");
    expect(foundations).toContain("COMP6261 —");
  });

  it("offers only 8000-level courses in BOTH lists once one from each uses up the 12 units", async () => {
    const slug = await cfndPlan();
    await add(slug, "COMP6361"); // theory list, 6000-level
    await add(slug, "COMP6261"); // foundations list, 6000-level
    const { theory, foundations } = await parts(slug);
    for (const code of ["COMP6363", "MATH6114"]) expect(theory, code).not.toContain(`${code} —`);
    for (const code of ["COMP8011", "COMP8460", "MATH8343"]) expect(theory, code).toContain(`${code} —`);
    for (const code of ["COMP6262", "COMP6466"]) expect(foundations, code).not.toContain(`${code} —`);
    expect(foundations).toContain("COMP8712 —");
    // Why, said once at the top of the box rather than in each part.
    const planner = between(await planHtml(slug), "ANU Course Planner</h2>", "My Study Plan</h2>");
    const box = between(planner, 'class="bucket spec-group"', 'id="cat-cfnd-courses"');
    expect(box).toContain('class="limit"');
    expect(theory).not.toContain('class="limit"');
    expect(foundations).not.toContain('class="limit"');
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
    const planner = between(after, "ANU Course Planner</h2>", "My Study Plan</h2>");
    const category = between(planner, 'id="cat-mcomp-foundational"', "</section>");
    expect(category).not.toContain('class="picker"');
    expect(category).toContain("Full — this category has all the units it needs.");
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
    const planner = between(after, "ANU Course Planner</h2>", "My Study Plan</h2>");
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
    const planner = between(after, "ANU Course Planner</h2>", "My Study Plan</h2>");
    const category = between(planner, 'id="cat-cmsy-foundation"', "</section>");
    expect(category).not.toContain('class="picker"');
    expect(category).toContain("At its maximum of 12 units.");
  });
});

describe("a completed degree is congratulated", () => {
  const FULL = [
    "COMP6250", "COMP6442", "COMP6710", "COMP8260", "MATH6005", "COMP8715",
    "COMP8600", "COMP8620", "COMP8650", "COMP8410", "COMP8430",
    "COMP6120", "ENGN8100", "COMP6240", "COMP6331",
  ];

  async function pcomPlan(): Promise<{ slug: string; ids: Map<string, string> }> {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `graduation probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const start = await planHtml(slug);
    const pcomId = new RegExp('<option value="(\\d+)"[^>]*>\\s*Professional Computing').exec(start)?.[1];
    if (!pcomId) throw new Error("Professional Computing not found");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: pcomId }));
    // Every course is still on offer before anything is added, so look the
    // ids up once, up front.
    const page = await planHtml(slug);
    return { slug, ids: new Map(FULL.map((code) => [code, courseIdFor(page, code)])) };
  }

  it("expects graduation at the end of the last scheduled semester once the plan meets the degree", async () => {
    const { slug, ids } = await pcomPlan();
    const semesters = ["2025 Semester 1", "2025 Semester 2", "2026 Semester 1"];
    for (const [i, code] of FULL.entries()) {
      // COMP8715 starts in 2026 Semester 1, so it runs into Semester 2.
      const semester = code === "COMP8715" ? "2026 Semester 1" : semesters[i % 3];
      await post("/api/plan-items", new URLSearchParams({
        slug, courseId: ids.get(code) ?? "", status: "planned", semester,
      }));
    }
    const total = between(await planHtml(slug), 'id="req-total"', "</section>");
    expect(total).toContain("Expected to graduate: <strong>end of 2026 Semester 2</strong>");

    // Take one course's semester away: no longer known.
    await post("/api/plan-items", new URLSearchParams({
      slug, courseId: ids.get("COMP8600") ?? "", action: "move", semester: "",
    }));
    const after = between(await planHtml(slug), 'id="req-total"', "</section>");
    expect(after).toContain("6 planned units have no semester yet");
  });

  it("shows the congratulations once every course is completed", async () => {
    const { slug, ids } = await pcomPlan();
    for (const code of FULL) {
      await post("/api/plan-items", new URLSearchParams({ slug, courseId: ids.get(code) ?? "", status: "completed" }));
    }
    const html = await planHtml(slug);
    expect(html).toContain('class="congrats"');
    expect(html).toContain("Congratulations!");
  });

  it("doesn't while one course is still only planned", async () => {
    const { slug, ids } = await pcomPlan();
    for (const code of FULL) {
      const status = code === "COMP8600" ? "planned" : "completed";
      await post("/api/plan-items", new URLSearchParams({ slug, courseId: ids.get(code) ?? "", status }));
    }
    const html = await planHtml(slug);
    expect(html).not.toContain('class="congrats"');
  });
});

describe("deleting a plan", () => {
  it("removes the plan and its courses, and takes it off the home page", async () => {
    const label = `delete probe ${process.hrtime.bigint()}`;
    const res = await post("/api/plans", new URLSearchParams({ label }));
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const courseId = courseIdFor(await planHtml(slug), "COMP6250");
    await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "completed" }));

    const home = await (await fetch(new URL("/", baseUrl))).text();
    expect(home).toContain(label);
    expect(home).toContain(`<input type="hidden" name="slug" value="${slug}"`);

    const deleted = await post("/api/plan-delete", new URLSearchParams({ slug }));
    expect(deleted.status).toBe(303);
    expect(deleted.headers.get("location")).toBe("/");

    const after = await (await fetch(new URL("/", baseUrl))).text();
    expect(after).not.toContain(label);
    expect((await fetch(new URL(`/plan/${slug}/`, baseUrl))).status).toBe(404);
  });

  it("won't delete the demo plan, and doesn't offer to", async () => {
    await post("/api/plan-delete", new URLSearchParams({ slug: "demo" }));
    expect((await fetch(new URL("/plan/demo/", baseUrl))).status).toBe(200);
    const home = await (await fetch(new URL("/", baseUrl))).text();
    expect(home).not.toContain('<input type="hidden" name="slug" value="demo"');
  });
});

describe("each semester shows its load, and empty ones still show", () => {
  it("lists every semester, totals each, and flags one over the full-time load", async () => {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `load probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    // Five 6-unit courses in one semester is 30 units: over the 24 of a
    // full-time load. COMP8715 starting a semester later adds 6 to each of
    // the next two.
    const page = await planHtml(slug);
    for (const code of ["COMP6250", "COMP6442", "COMP6710", "COMP8260", "MATH6005"]) {
      await post("/api/plan-items", new URLSearchParams({
        slug, courseId: courseIdFor(page, code), status: "planned", semester: "2025 Semester 1",
      }));
    }
    await post("/api/plan-items", new URLSearchParams({
      slug, courseId: courseIdFor(page, "COMP8715"), status: "planned", semester: "2025 Semester 2",
    }));

    const html = await planHtml(slug);
    const plan = between(html, "My Study Plan</h2>", "Degree Progress</h2>");
    const first = semesterGroup(plan, "2025-semester-1") ?? "";
    expect(first).toContain('<span class="sem-units">30 units</span>');
    expect(first).toContain("more than the standard full-time load of 24");
    const second = semesterGroup(plan, "2025-semester-2") ?? "";
    expect(second).toContain('<span class="sem-units">6 units</span>');
    expect(second).not.toContain("full-time load");
    expect(semesterGroup(plan, "2026-semester-1")).toContain('<span class="sem-units">6 units</span>');
    // The rest are there, empty, saying so.
    // The one left, 2026 Semester 2, is there, empty, saying so; nothing
    // beyond the four semesters is.
    expect(semesterGroup(plan, "2026-semester-2")).toContain("Nothing planned yet.");
    expect(semesterGroup(plan, "2027-semester-1")).toBeUndefined();
    // Nothing unscheduled, so no "Not yet scheduled" group.
    expect(semesterGroup(plan, "none")).toBeUndefined();
  });
});

describe("choosing the intake", () => {
  const studyPlanOf = (html: string) => between(html, "My Study Plan</h2>", "Degree Progress</h2>");
  it("moves the study plan with it, keeps unscheduled courses unscheduled, and moves back", async () => {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `intake probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const page = await planHtml(slug);
    const add = (code: string, semester: string) =>
      post("/api/plan-items", new URLSearchParams({
        slug, courseId: courseIdFor(page, code), status: "planned", semester,
      }));
    await add("COMP6250", "2025 Semester 1");
    await add("COMP8715", "2026 Semester 1"); // runs into 2026 Semester 2
    await add("COMP6442", "");

    const studyPlan = async () => between(await planHtml(slug), "My Study Plan</h2>", "Degree Progress</h2>");
    const setIntake = (intake: string) =>
      post("/api/plan-intake", new URLSearchParams({ slug, intake }));

    await setIntake("2025 Semester 2");
    let plan = await studyPlan();
    // Every scheduled course one semester later...
    expect(rowsFor(semesterGroup(plan, "2025-semester-2"), "COMP6250")).toBe(1);
    expect(rowsFor(semesterGroup(plan, "2026-semester-2"), "COMP8715")).toBe(1);
    expect(rowsFor(semesterGroup(plan, "2027-semester-1"), "COMP8715")).toBe(1);
    // ...the unscheduled one still unscheduled...
    expect(rowsFor(semesterGroup(plan, "none"), "COMP6442")).toBe(1);
    // ...and the plan's four semesters now run 2025 S2 to 2027 S1.
    expect(semesterGroup(plan, "2025-semester-1")).toBeUndefined();
    expect(semesterGroup(plan, "2026-semester-1")).toContain("Nothing planned yet.");
    expect(semesterGroup(plan, "2027-semester-2")).toBeUndefined();
    const html = await planHtml(slug);
    expect(html).toContain("starts 2025 Semester 2");

    // A semester outside the new span is refused: the course isn't added
    // at all (the Course Planner still offers it, which it wouldn't if it
    // were in the plan anywhere).
    await post("/api/plan-items", new URLSearchParams({
      slug, courseId: courseIdFor(page, "COMP6710"), status: "planned", semester: "2025 Semester 1",
    }));
    const afterRefusal = await planHtml(slug);
    expect(studyPlanOf(afterRefusal)).not.toContain('<span class="code">COMP6710</span>');
    expect(between(afterRefusal, "ANU Course Planner</h2>", "My Study Plan</h2>")).toContain("COMP6710 —");

    // An unknown intake changes nothing.
    await setIntake("2031 Semester 1");
    expect(await planHtml(slug)).toContain("starts 2025 Semester 2");

    await setIntake("2025 Semester 1");
    plan = await studyPlan();
    expect(rowsFor(semesterGroup(plan, "2025-semester-1"), "COMP6250")).toBe(1);
    expect(rowsFor(semesterGroup(plan, "2026-semester-1"), "COMP8715")).toBe(1);
    expect(semesterGroup(plan, "2027-semester-1")).toBeUndefined();
  });
});

describe("a specialisation with several rules gets one box, a dropdown per part", () => {
  async function declared(name: string): Promise<string> {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `group probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const start = await planHtml(slug);
    const id = new RegExp(`<option value="(\\d+)"[^>]*>\\s*${name}`).exec(start)?.[1];
    if (!id) throw new Error(`${name} not found`);
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: id }));
    const html = await planHtml(slug);
    return between(html, "ANU Course Planner</h2>", "My Study Plan</h2>");
  }
  const offers = (part: string, code: string) => part.includes(`${code} —`);
  const groups = (planner: string) => planner.split('class="bucket spec-group"').length - 1;

  it("puts Computer Systems in one box: the advanced list and the foundation maximum, each course offered once", async () => {
    const planner = await declared("Computer Systems");
    expect(groups(planner)).toBe(1);
    const group = between(planner, 'class="bucket spec-group"', 'id="cat-mcomp-further-computing"');
    expect(group).toContain("Specialisation: Computer Systems");
    const advanced = between(group, 'id="cat-cmsy-courses"', "</section>");
    const foundation = between(group, 'id="cat-cmsy-foundation"', "</section>");
    expect(advanced).toContain("Advanced systems minimum");
    // The whole box's rule sits once at the top, not inside the first part.
    const head = between(group, "Specialisation: Computer Systems", 'id="cat-cmsy-courses"');
    expect(head).toContain("24 units drawn from the two lists below.");
    expect(advanced).not.toContain("24 units drawn from the two lists below.");
    expect(advanced).toContain("A minimum of 12 units from completion of courses from the following list.");
    for (const code of ["COMP8300", "COMP8045", "COMP8712"]) {
      expect(offers(advanced, code), code).toBe(true);
      expect(offers(foundation, code), code).toBe(false);
    }
    for (const code of ["COMP6310", "COMP6330", "COMP6331", "COMP6361", "COMP6464", "ENGN6213"]) {
      expect(offers(foundation, code), code).toBe(true);
      expect(offers(advanced, code), code).toBe(false);
    }
  });

  it("names Human-Centred's first part after the two minimums it is made of", async () => {
    const planner = await declared("Human-Centred");
    const first = between(planner, 'id="cat-hccm-courses"', "</section>");
    expect(first).toContain("Compulsory course and advanced minimum");
    expect(offers(first, "COMP6390")).toBe(true);
    expect(offers(first, "COMP6528")).toBe(false);
  });

  it("puts Professional Computing's three rules in one box", async () => {
    const planner = await declared("Professional Computing");
    expect(groups(planner)).toBe(1);
    for (const key of ["pcom-core", "pcom-elective", "pcom-8000-comp"]) {
      expect(planner).toContain(`<h4 id="cat-${key}"`);
    }
    // The 8000-level minimum is about all 24 units, so it heads the box
    // rather than sitting inside the compulsory part.
    const group = between(planner, 'class="bucket spec-group"', 'id="cat-pcom-core"');
    expect(group).toContain("must consist of a minimum of 12 units of 8000 level courses");
    const core = between(planner, 'id="cat-pcom-core"', "</section>");
    expect(core).not.toContain("8000 level courses");
  });

  it("splits Data Science into its compulsory courses and its elective list, as Programs and Courses does", async () => {
    const planner = await declared("Data Science");
    expect(groups(planner)).toBe(1);
    const compulsory = between(planner, 'id="cat-dtsc-compulsory"', "</section>");
    const elective = between(planner, 'id="cat-dtsc-elective"', "</section>");
    expect(compulsory).toContain("Compulsory courses");
    expect(compulsory).toContain("18 units from completion of the following compulsory courses.");
    expect(elective).toContain("6 units from completion of courses from the following list.");
    for (const code of ["COMP6240", "COMP8410", "COMP8430"]) {
      expect(offers(compulsory, code), code).toBe(true);
      expect(offers(elective, code), code).toBe(false);
    }
    for (const code of ["COMP6490", "COMP6670", "COMP8600", "COMP8650", "COMP8880", "STAT6039"]) {
      expect(offers(elective, code), code).toBe(true);
      expect(offers(compulsory, code), code).toBe(false);
    }
    expect(planner).not.toContain('id="cat-dtsc-courses"');
  });

  it("leaves a one-rule specialisation (Machine Learning) in its own ordinary box", async () => {
    const planner = await declared("Machine Learning");
    expect(groups(planner)).toBe(0);
    expect(planner).toContain('<h3 id="cat-mchl-courses"');
  });
});

describe("Degree Progress leads with completed units, requirements folded", () => {
  it("shows completed units as the headline, keeps requirements closed, and opens a broken ceiling", async () => {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `fold progress probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    const slug = location.replace(/^\/plan\//, "").replace(/\/$/, "");
    const start = await planHtml(slug);
    const cmsy = /<option value="(\d+)"[^>]*>\s*Computer Systems/.exec(start)?.[1];
    if (!cmsy) throw new Error("Computer Systems not found");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: cmsy }));
    const page = await planHtml(slug);
    const add = (code: string, status: string) =>
      post("/api/plan-items", new URLSearchParams({ slug, courseId: courseIdFor(page, code), status }));
    await add("COMP6250", "completed");
    await add("COMP6442", "planned");
    // Three from the foundation list: 18 units against its 12-unit maximum.
    // (Added straight over HTTP; the planner itself stops offering them.)
    for (const code of ["COMP6310", "COMP6330", "COMP6331"]) await add(code, "planned");

    const progress = between(await planHtml(slug), "Degree Progress</h2>", "");
    const total = between(progress, 'id="req-total"', "</section>");
    expect(total).toMatch(/<strong>6<\/strong> of 96 units completed/);

    const core = between(progress, 'id="req-mcomp-core"', "</section>");
    const coreOpen = between(progress, 'aria-labelledby="req-mcomp-core verdict-mcomp-core"', 'id="req-mcomp-core"');
    expect(coreOpen).toContain("<details>");
    expect(core).toContain("6 completed + 6 planned of 24 units");

    const capOpen = between(progress, 'aria-labelledby="req-cmsy-foundation verdict-cmsy-foundation"', 'id="req-cmsy-foundation"');
    expect(capOpen).toContain("<details open");
    expect(between(progress, 'id="req-cmsy-foundation"', "</section>")).toContain("Over this maximum by 6 units");
  });
});

describe("a broad category leaves a course to the named list still offering it", () => {
  async function fresh(): Promise<string> {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ label: `dedup probe ${process.hrtime.bigint()}` }),
    );
    const location = res.headers.get("location");
    if (!location) throw new Error("plan creation did not redirect");
    return location.replace(/^\/plan\//, "").replace(/\/$/, "");
  }
  const planner = async (slug: string) =>
    between(await planHtml(slug), "ANU Course Planner</h2>", "My Study Plan</h2>");
  const box = (p: string, key: string) => between(p, `id="cat-${key}"`, "</section>");
  const offers = (part: string, code: string) => part.includes(`${code} —`);

  it("offers core, foundational and project courses only under their own category", async () => {
    const p = await planner(await fresh());
    for (const key of ["mcomp-further-computing", "mcomp-electives"]) {
      const broad = box(p, key);
      for (const code of ["COMP6250", "COMP6442", "COMP6710", "COMP8260", "COMP6260", "MATH6005", "COMP8715", "COMP8830"]) {
        expect(offers(broad, code), `${key} ${code}`).toBe(false);
      }
    }
    expect(offers(box(p, "mcomp-core"), "COMP6250")).toBe(true);
    expect(offers(box(p, "mcomp-project"), "COMP8715")).toBe(true);
    // A course no named list offers is still under the broad ones.
    expect(offers(box(p, "mcomp-further-computing"), "COMP8600")).toBe(true);
    expect(offers(box(p, "mcomp-electives"), "COMP8600")).toBe(true);
  });

  it("offers the rest of a list under the broad categories once that list is full", async () => {
    const slug = await fresh();
    const courseId = courseIdFor(await planHtml(slug), "MATH6005");
    await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "completed" }));
    // Foundational is full with MATH6005, so COMP6260 could now only count
    // as further computing (or an elective) — and that's where it's offered.
    const p = await planner(slug);
    expect(offers(box(p, "mcomp-further-computing"), "COMP6260")).toBe(true);
  });

  it("keeps Professional Computing's further 8000-level COMP from offering compulsory core's COMP8260", async () => {
    const slug = await fresh();
    const start = await planHtml(slug);
    const id = /<option value="(\d+)"[^>]*>\s*Professional Computing/.exec(start)?.[1];
    if (!id) throw new Error("Professional Computing not found");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: id }));
    const p = await planner(slug);
    const further8000 = box(p, "pcom-8000-comp");
    expect(offers(further8000, "COMP8260")).toBe(false);
    expect(offers(further8000, "COMP8600")).toBe(true);
  });

  it("says a list is full, not that every course in it was chosen", async () => {
    // Data Science's elective needs one 6-unit course from six.
    const slug = await fresh();
    const start = await planHtml(slug);
    const id = /<option value="(\d+)"[^>]*>\s*Data Science/.exec(start)?.[1];
    if (!id) throw new Error("Data Science not found");
    await post("/api/plan-specialisation", new URLSearchParams({ slug, specialisationId: id }));
    const courseId = courseIdFor(await planHtml(slug), "COMP8600");
    await post("/api/plan-items", new URLSearchParams({ slug, courseId, status: "planned" }));
    const elective = box(await planner(slug), "dtsc-elective");
    expect(elective).toContain("Full — this category has all the units it needs.");
    expect(elective).not.toContain("Every course");
  });
});
