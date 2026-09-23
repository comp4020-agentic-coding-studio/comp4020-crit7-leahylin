// The Master of Computing (7706XMCOMP), 2025, as data.
//
// Every course title, unit value and rule below is transcribed from ANU
// Programs and Courses:
//   https://programsandcourses.anu.edu.au/2025/program/7706XMCOMP
//   https://programsandcourses.anu.edu.au/2025/specialisation/pcom-spec
// Courses whose current title could not be confirmed there are not seeded —
// COMP8110 and COMP6420 appear in older catalogues and in secondary sources,
// but both 404 on the live course pages, so they are retired and left out.
//
// This is reference data, not user data: it describes the degree, and it is
// seeded at boot rather than entered through the app. `src/lib/seed.ts` is
// what writes it. It lives in TypeScript rather than a JSON file on purpose —
// the runtime image copies only dist/, node_modules/ and drizzle/, so a
// readFileSync of a data file would resolve to nothing in production.
//
// The catalogue is a deliberate subset, not all ~300 COMP courses: it holds
// every course the MCOMP rules name, plus enough further 8000-level COMP to
// make the level-filtered requirements genuinely satisfiable.

export type SeedCourse = {
  code: string;
  title: string;
  units: number;
};

export const COURSES: SeedCourse[] = [
  // --- named by the program rules --------------------------------------
  { code: "COMP6250", title: "Professional Practice: Holistic Thinking and Communication", units: 6 },
  { code: "COMP6442", title: "Software Construction", units: 6 },
  { code: "COMP6710", title: "Structured Programming", units: 6 },
  { code: "COMP8260", title: "Professional Practice: Responsible Innovation & Leadership", units: 6 },
  { code: "COMP6260", title: "Foundations of Computing", units: 6 },
  { code: "MATH6005", title: "Discrete Mathematics Models", units: 6 },
  { code: "COMP8715", title: "Advanced Computing Team Project", units: 12 },
  { code: "COMP8830", title: "Computing Internship", units: 12 },

  // --- named by the Professional Computing specialisation --------------
  // Seeded now so the catalogue is complete; the specialisation's own
  // requirements arrive with migration 0002.
  { code: "COMP6120", title: "Software Engineering", units: 6 },
  { code: "ENGN8100", title: "Introduction to Systems Engineering", units: 6 },
  { code: "COMP6240", title: "Relational Databases", units: 6 },
  { code: "COMP6331", title: "Computer Networks", units: 6 },
  { code: "COMP6390", title: "Human-Computer Interaction", units: 6 },
  { code: "INFS8004", title: "Enterprise Systems and Strategy", units: 6 },
  { code: "INFS8205", title: "Digital Strategy, Executive and Operations", units: 6 },
  { code: "LAWS8445", title: "Information Technology Law", units: 6 },
  { code: "MGMT7020", title: "Technology and Project Management", units: 6 },
  { code: "REGN8014", title: "Contemporary Issues in Technology Governance", units: 6 },

  // --- further 8000-level COMP -----------------------------------------
  // Without these the "minimum 24 units of 8000-level COMP" rule could only
  // be met with project courses, which would make it untestable.
  { code: "COMP8600", title: "Statistical Machine Learning", units: 6 },
  { code: "COMP8620", title: "Advanced Topics in Artificial Intelligence", units: 6 },
  { code: "COMP8650", title: "Advanced Topics in Machine Learning", units: 6 },
  { code: "COMP8410", title: "Data Mining", units: 6 },
  { code: "COMP8430", title: "Data Wrangling", units: 6 },
  // An excluded project course: it exists so the Professional Computing
  // exclusion rule has something real to reject in migration 0002.
  { code: "COMP8800", title: "Advanced Computing Research Project", units: 12 },
];

export type SeedRequirement = {
  key: string;
  label: string;
  /** The rule in the words Programs and Courses uses. */
  detail: string;
  requiredUnits: number;
  sortOrder: number;
  /** Explicit pool, by course code. Takes precedence over the filter. */
  include?: string[];
  /** Subtracted from whatever the pool resolved to. */
  exclude?: string[];
  /** Filter pool: comma-separated subject areas. */
  subjects?: string;
  minLevel?: number;
  maxLevel?: number;
};

// The six allocating requirements below sum to exactly 96 units:
//   24 core + 6 foundational + 12 project + 24 specialisation
//   + 18 further computing + 12 electives
// The specialisation bucket is absent here by design — it needs the
// specialisations table, which is migration 0002. Until then the panel is
// honestly short of 24 units, rather than pretending with a placeholder.
//
// `mcomp-total` and `mcomp-min-8000-comp` are cross-cutting: they re-count
// courses the allocating buckets have already counted. Real ANU rules limit
// double-counting; this app does not model that (see README).
export const REQUIREMENTS: SeedRequirement[] = [
  {
    key: "mcomp-total",
    label: "Total units",
    detail: "The Master of Computing requires the completion of 96 units.",
    requiredUnits: 96,
    sortOrder: 10,
    // No pool and no filter: every course counts. This is the one bucket
    // that can be exceeded rather than merely unfilled.
  },
  {
    key: "mcomp-core",
    label: "Compulsory core",
    detail:
      "24 units from the completion of the following compulsory courses. " +
      "Because the pool is four 6-unit courses, it is satisfiable only by taking all four.",
    requiredUnits: 24,
    sortOrder: 20,
    include: ["COMP6250", "COMP6442", "COMP6710", "COMP8260"],
  },
  {
    key: "mcomp-foundational",
    label: "Foundational course",
    detail: "6 units from the completion of one of the following courses.",
    requiredUnits: 6,
    sortOrder: 30,
    include: ["MATH6005", "COMP6260"],
  },
  {
    key: "mcomp-project",
    label: "Project course",
    detail: "12 units from the completion of one of the following capstone courses.",
    requiredUnits: 12,
    sortOrder: 40,
    include: ["COMP8715", "COMP8830"],
  },
  {
    key: "mcomp-further-computing",
    label: "Further computing",
    detail:
      "18 units from the completion of 6000-, 7000- or 8000-level courses " +
      "from the subject areas COMP Computer Science or ENGN Engineering.",
    requiredUnits: 18,
    sortOrder: 50,
    subjects: "COMP,ENGN",
    minLevel: 6000,
    maxLevel: 8999,
  },
  {
    key: "mcomp-electives",
    label: "ANU electives",
    detail: "12 units from the completion of elective courses offered by ANU.",
    requiredUnits: 12,
    sortOrder: 60,
  },
  {
    key: "mcomp-min-8000-comp",
    label: "8000-level COMP minimum",
    detail:
      "A minimum of 24 units must come from the completion of 8000-level COMP courses. " +
      "This is a floor across the whole degree, not an extra allocation of units.",
    requiredUnits: 24,
    sortOrder: 70,
    subjects: "COMP",
    minLevel: 8000,
    maxLevel: 8999,
  },
];

// The invariants in spec/ fetch every route in spec/routes.ts against a
// throwaway database and require HTTP 200, so a plan has to exist at a known
// slug in every database including a blank one. This is that plan.
export const DEMO_PLAN = {
  slug: "demo",
  label: "Demo plan",
};

/** ANU course codes are four letters then four digits, so both the subject
 *  area and the level fall out of the code itself rather than being typed
 *  out (and mistyped) per row. */
export function subjectOf(code: string): string {
  return code.slice(0, 4);
}

export function levelOf(code: string): number {
  return Number(code[4]) * 1000;
}
