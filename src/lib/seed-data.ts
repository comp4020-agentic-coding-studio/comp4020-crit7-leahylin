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
  // An annual course: 6 units a semester, "must be completed twice, in
  // consecutive semesters" (6+6) —
  //   https://programsandcourses.anu.edu.au/2025/course/COMP8715
  // Seeded as ONE 12-unit entry, because that is what the degree's rules
  // count (the project requirement is 12 units from COMP8715 or COMP8830),
  // and listed in TWO_SEMESTER_COURSES below so the study plan spreads it
  // over the two semesters it actually runs in.
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
  // --- named by the six further specialisations ------------------------
  // All 6 units. Where a page did not state a unit value the arithmetic
  // settles it: Artificial Intelligence is four courses totalling 24 units,
  // Data Science's three compulsory courses total 18, and every "choose 6
  // units from this list" is only answerable if each option is 6.
  { code: "COMP6261", title: "Information Theory", units: 6 },
  { code: "COMP6262", title: "Logic", units: 6 },
  { code: "COMP6310", title: "Systems Networks and Concurrency", units: 6 },
  { code: "COMP6320", title: "Artificial Intelligence", units: 6 },
  { code: "COMP6330", title: "Operating Systems", units: 6 },
  { code: "COMP6361", title: "Principles of Programming Languages", units: 6 },
  { code: "COMP6363", title: "Theory of Computation", units: 6 },
  { code: "COMP6464", title: "High Performance Scientific Computing", units: 6 },
  { code: "COMP6466", title: "Algorithms", units: 6 },
  { code: "COMP6490", title: "Document Analysis", units: 6 },
  { code: "COMP6528", title: "Computer Vision", units: 6 },
  { code: "COMP6540", title: "Game Development", units: 6 },
  { code: "COMP6670", title: "Introduction to Machine Learning", units: 6 },
  { code: "COMP6720", title: "Art and Interaction Computing", units: 6 },
  { code: "COMP6780", title: "Web Programming and Design", units: 6 },
  { code: "COMP8011", title: "Advanced Topics in Formal Methods and Programming Languages", units: 6 },
  { code: "COMP8045", title: "Advanced Topics in Computer Systems & Architecture", units: 6 },
  { code: "COMP8300", title: "Parallel Systems", units: 6 },
  { code: "COMP8350", title: "Sound and Music Computing", units: 6 },
  { code: "COMP8460", title: "Advanced Algorithms", units: 6 },
  { code: "COMP8539", title: "Advanced Topics in Computer Vision", units: 6 },
  { code: "COMP8610", title: "Computer Graphics", units: 6 },
  { code: "COMP8691", title: "Optimisation", units: 6 },
  { code: "COMP8712", title: "Compiler Construction", units: 6 },
  { code: "COMP8880", title: "Computational Methods for Network Science", units: 6 },
  { code: "ENGN6213", title: "Digital Systems and Microprocessors", units: 6 },
  { code: "MATH6114", title: "Number Theory and Cryptography", units: 6 },
  { code: "MATH8343", title: "Foundations of Mathematics", units: 6 },
  { code: "STAT6039", title: "Principles of Mathematical Statistics", units: 6 },
];


export type SeedSpecialisation = {
  slug: string;
  label: string;
  /** The ANU specialisation code, where the page was confirmed. */
  code: string | null;
  /** Whether this specialisation's own requirements are seeded below. */
  modelled: boolean;
};

// All seven specialisations MCOMP offers; one is compulsory. Every one is
// modelled, from its own 2025 page — the codes below are the ones the MCOMP
// page links to, which is how they were found: guessing slugs had failed.
//
// Their shapes differ more than the program's rules do. Artificial
// Intelligence is four named courses. Machine Learning is any 24 units from
// one list. Data Science has a compulsory core plus an elective. Computer
// Systems, Computational Foundations and Human-Centred each pair a MINIMUM
// from one list with a MAXIMUM from another — the first rules in this degree
// that can be broken by taking too much of something.
export const SPECIALISATIONS: SeedSpecialisation[] = [
  { slug: "artificial-intelligence", label: "Artificial Intelligence", code: "ARTIF-SPEC", modelled: true },
  { slug: "computational-foundations", label: "Computational Foundations", code: "COMP-SPEC", modelled: true },
  { slug: "computer-systems", label: "Computer Systems", code: "CMSY-SPEC", modelled: true },
  { slug: "data-science", label: "Data Science", code: "DTSC-SPEC", modelled: true },
  {
    slug: "human-centred-and-creative-computing",
    label: "Human-Centred and Creative Computing",
    code: "HCCM-SPEC",
    modelled: true,
  },
  { slug: "machine-learning", label: "Machine Learning", code: "MCHL-SPEC", modelled: true },
  {
    slug: "professional-computing",
    label: "Professional Computing",
    code: "PCOM-SPEC",
    modelled: true,
  },
];

export type SeedRequirement = {
  key: string;
  label: string;
  /** See the `kind` column in schema.ts. Omitted means "allocating". */
  kind?: "allocating" | "floor" | "total" | "cap";
  /** Slug of the specialisation this rule belongs to. Omitted means it is
   *  a program-level rule that always applies. */
  specialisation?: string;
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
    kind: "total",
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
    kind: "floor",
    detail:
      "A minimum of 24 units must come from the completion of 8000-level COMP courses. " +
      "This is a floor across the whole degree, not an extra allocation of units.",
    requiredUnits: 24,
    sortOrder: 70,
    subjects: "COMP",
    minLevel: 8000,
    maxLevel: 8999,
  },
  // --- Professional Computing (PCOM-SPEC), 24 units -------------------
  // These replace the program's generic "24 units from one specialisation"
  // rather than sitting alongside it. Both would be allocating, so keeping
  // both would have them competing for the same courses and only one could
  // ever fill. The three allocating rules below come to exactly 24 units,
  // which is what brings the degree's structural total to 96.
  {
    key: "pcom-core",
    label: "Specialisation: compulsory",
    detail: "12 units from the completion of the following courses.",
    specialisation: "professional-computing",
    requiredUnits: 12,
    sortOrder: 31,
    include: ["COMP6120", "ENGN8100"],
  },
  {
    key: "pcom-elective",
    label: "Specialisation: elective",
    detail: "6 units from the completion of one of the following courses.",
    specialisation: "professional-computing",
    requiredUnits: 6,
    sortOrder: 32,
    include: [
      "COMP6240", "COMP6331", "COMP6390", "INFS8004",
      "INFS8205", "LAWS8445", "MGMT7020", "REGN8014",
    ],
  },
  {
    key: "pcom-8000-comp",
    label: "Specialisation: further 8000-level COMP",
    detail:
      "6 units from any 8000 level COMP coded course, excluding the project " +
      "courses COMP8715, COMP8800 and COMP8830.",
    specialisation: "professional-computing",
    requiredUnits: 6,
    sortOrder: 33,
    subjects: "COMP",
    minLevel: 8000,
    maxLevel: 8999,
    // The reason requirement_courses carries a role at all.
    exclude: ["COMP8715", "COMP8800", "COMP8830"],
  },
  {
    key: "pcom-min-8000",
    label: "Specialisation: 8000-level minimum",
    detail:
      "The specialisation's 24 units must consist of a minimum of 12 units " +
      "of 8000 level courses. Note this one is not restricted to COMP.",
    specialisation: "professional-computing",
    // A floor, but scoped: it counts only the courses credited to this
    // specialisation, not every 8000-level course in the plan. A core
    // course like COMP8260 is 8000-level and must NOT count here.
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 34,
    minLevel: 8000,
    maxLevel: 8999,
  },

  // --- Artificial Intelligence (ARTIF-SPEC), 24 units ------------------
  // Four named courses worth 24 units between them, so the single allocating
  // rule is satisfiable only by taking all four.
  {
    key: "artif-courses",
    label: "Specialisation: the four AI courses",
    detail: "The 24 units must consist of the following courses.",
    specialisation: "artificial-intelligence",
    requiredUnits: 24,
    sortOrder: 31,
    include: ["COMP6262", "COMP6320", "COMP8620", "COMP8691"],
  },
  {
    key: "artif-min-8000",
    label: "Specialisation: 8000-level minimum",
    detail: "A minimum of 12 units of 8000 level courses.",
    specialisation: "artificial-intelligence",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 32,
    minLevel: 8000,
    maxLevel: 8999,
  },

  // --- Machine Learning (MCHL-SPEC), 24 units --------------------------
  {
    key: "mchl-courses",
    label: "Specialisation: machine learning courses",
    detail: "24 units from completion of courses from the following list.",
    specialisation: "machine-learning",
    requiredUnits: 24,
    sortOrder: 31,
    include: [
      "COMP6261", "COMP6490", "COMP6528", "COMP6670",
      "COMP8600", "COMP8650", "COMP8880",
    ],
  },
  {
    key: "mchl-min-8000",
    label: "Specialisation: 8000-level minimum",
    detail: "A minimum of 12 units of 8000-level courses.",
    specialisation: "machine-learning",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 32,
    minLevel: 8000,
    maxLevel: 8999,
  },

  // --- Data Science (DTSC-SPEC), 24 units ------------------------------
  //   https://programsandcourses.anu.edu.au/2025/specialisation/dtsc-spec
  // Two blocks, as the page sets them out: 18 units of compulsory courses
  // and 6 units from an elective list. (This was once one 24-unit list with
  // the compulsory courses as a floor inside it, key "dtsc-courses"; the
  // seed now deletes that row from a database that still has it.)
  {
    key: "dtsc-compulsory",
    label: "Specialisation: compulsory courses",
    detail: "18 units from completion of the following compulsory courses.",
    specialisation: "data-science",
    requiredUnits: 18,
    sortOrder: 31,
    include: ["COMP6240", "COMP8410", "COMP8430"],
  },
  {
    key: "dtsc-elective",
    label: "Specialisation: elective",
    detail: "6 units from completion of courses from the following list.",
    specialisation: "data-science",
    requiredUnits: 6,
    sortOrder: 32,
    include: ["COMP6490", "COMP6670", "COMP8600", "COMP8650", "COMP8880", "STAT6039"],
  },
  {
    key: "dtsc-min-8000",
    label: "Specialisation: 8000-level minimum",
    detail: "The 24 units must consist of 12 units of 8000-level courses.",
    specialisation: "data-science",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 33,
    minLevel: 8000,
    maxLevel: 8999,
  },

  // --- Computer Systems (CMSY-SPEC), 24 units --------------------------
  // The first rule in this degree with a ceiling rather than a floor.
  {
    key: "cmsy-courses",
    label: "Specialisation: computer systems courses",
    detail: "24 units drawn from the two lists below.",
    specialisation: "computer-systems",
    requiredUnits: 24,
    sortOrder: 31,
    include: [
      "COMP8300", "COMP8045", "COMP8712",
      "COMP6310", "COMP6330", "COMP6331", "COMP6361", "COMP6464", "ENGN6213",
    ],
  },
  {
    key: "cmsy-advanced",
    label: "Specialisation: advanced systems minimum",
    detail: "A minimum of 12 units from completion of courses from the following list.",
    specialisation: "computer-systems",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 32,
    include: ["COMP8300", "COMP8045", "COMP8712"],
  },
  {
    key: "cmsy-foundation",
    label: "Specialisation: foundation systems maximum",
    detail: "A maximum of 12 units from completion of courses from the following list.",
    specialisation: "computer-systems",
    kind: "cap",
    requiredUnits: 12,
    sortOrder: 33,
    include: ["COMP6310", "COMP6330", "COMP6331", "COMP6361", "COMP6464", "ENGN6213"],
  },

  // --- Computational Foundations (COMP-SPEC), 24 units -----------------
  {
    key: "cfnd-courses",
    label: "Specialisation: computational foundations courses",
    detail: "24 units drawn from the two lists below.",
    specialisation: "computational-foundations",
    requiredUnits: 24,
    sortOrder: 31,
    include: [
      "COMP6361", "COMP6363", "COMP8011", "COMP8460", "MATH6114", "MATH8343",
      "COMP6261", "COMP6262", "COMP6466", "COMP8712",
    ],
  },
  {
    key: "cfnd-list-a",
    label: "Specialisation: theory minimum",
    detail: "A minimum of 12 units from completion of courses from the following list.",
    specialisation: "computational-foundations",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 32,
    include: ["COMP6361", "COMP6363", "COMP8011", "COMP8460", "MATH6114", "MATH8343"],
  },
  {
    key: "cfnd-list-b",
    label: "Specialisation: foundations maximum",
    detail: "A maximum of 12 units from completion of courses from the following list.",
    specialisation: "computational-foundations",
    kind: "cap",
    requiredUnits: 12,
    sortOrder: 33,
    include: ["COMP6261", "COMP6262", "COMP6466", "COMP8712"],
  },
  {
    key: "cfnd-min-8000",
    label: "Specialisation: 8000-level minimum",
    detail: "A minimum of 12 units of 8000 level courses.",
    specialisation: "computational-foundations",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 34,
    minLevel: 8000,
    maxLevel: 8999,
  },

  // --- Human-Centred and Creative Computing (HCCM-SPEC), 24 units ------
  // 6 compulsory + a 12-unit floor + a 6-unit ceiling = the 24.
  {
    key: "hccm-courses",
    label: "Specialisation: human-centred courses",
    detail: "24 units made up of the compulsory course and the two lists below.",
    specialisation: "human-centred-and-creative-computing",
    requiredUnits: 24,
    sortOrder: 31,
    include: [
      "COMP6390",
      "COMP8350", "COMP8539", "COMP8610",
      "COMP6528", "COMP6540", "COMP6720", "COMP6780",
    ],
  },
  {
    key: "hccm-compulsory",
    label: "Specialisation: compulsory course",
    detail: "COMP6390 Human-Computer Interaction.",
    specialisation: "human-centred-and-creative-computing",
    kind: "floor",
    requiredUnits: 6,
    sortOrder: 32,
    include: ["COMP6390"],
  },
  {
    key: "hccm-advanced",
    label: "Specialisation: advanced minimum",
    detail: "A minimum of 12 units from the following list.",
    specialisation: "human-centred-and-creative-computing",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 33,
    include: ["COMP8350", "COMP8539", "COMP8610"],
  },
  {
    key: "hccm-creative",
    label: "Specialisation: creative maximum",
    detail: "A maximum of 6 units from the following list.",
    specialisation: "human-centred-and-creative-computing",
    kind: "cap",
    requiredUnits: 6,
    sortOrder: 34,
    include: ["COMP6528", "COMP6540", "COMP6720", "COMP6780"],
  },
  {
    key: "hccm-min-8000",
    label: "Specialisation: 8000-level minimum",
    detail: "A minimum of 12 units of 8000-level courses.",
    specialisation: "human-centred-and-creative-computing",
    kind: "floor",
    requiredUnits: 12,
    sortOrder: 35,
    minLevel: 8000,
    maxLevel: 8999,
  },
];

/** Courses taken as one enrolment over two consecutive semesters, half the
 *  units in each. Reference data like everything above, but it only shapes
 *  the study plan's semesters, not what counts, so it lives here rather than
 *  in a database column. COMP8830 (Computing Internship, 12 units) is NOT
 *  one: it is a single-semester course —
 *    https://programsandcourses.anu.edu.au/2025/course/COMP8830 */
export const TWO_SEMESTER_COURSES: ReadonlySet<string> = new Set(["COMP8715"]);

// The invariants in spec/ fetch every route in spec/routes.ts against a
// throwaway database and require HTTP 200, so a plan has to exist at a known
// slug in every database including a blank one. This is that plan.
export const DEMO_PLAN = {
  slug: "demo",
  label: "Demo plan",
  // The Master of Computing is the only degree modelled; the demo starts
  // in the first of its two 2025 intakes.
  intake: "2025 Semester 1",
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
