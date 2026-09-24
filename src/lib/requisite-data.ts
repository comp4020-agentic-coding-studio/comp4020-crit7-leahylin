// What each course in the catalogue needs before it can be taken, and when
// it ran, transcribed from its 2025 Programs and Courses page:
//   https://programsandcourses.anu.edu.au/2025/course/<CODE>
// (the "Requisite and Incompatibility" section and the 2025 offerings).
//
// Transcription rules, so the data says only what the page says:
//  - Only the Master of Computing's branch of a requisite is kept. Where a
//    page offers courses outside this planner's catalogue as alternatives
//    ("COMP6710 OR COMP1110"), only the catalogue's course is kept: it's
//    the one a student of this degree would take.
//  - Anything the planner can't check — a program other than the Master of
//    Computing, a permission code, a course outside the catalogue with no
//    catalogue alternative — goes in `note`, close to the page's words, and
//    is shown as it is rather than guessed at.
//  - Offerings are 2025's. The 2026 pages were checked too, but part-way
//    through 2026 they list only what's still to come, so a course that ran
//    in 2026 Semester 1 reads as "no current offerings". 2025 is complete,
//    so the planner reports that year's pattern and says it's 2025's.
//
// Like TWO_SEMESTER_COURSES in seed-data.ts, this only shapes warnings in
// the study plan, not what counts toward the degree, so it lives here rather
// than in the database.

/** A requisite: a course, all of some, any of some, or a number of units
 *  from a subject at a level ("12 units of 6000-level COMP courses"). */
export type Requirement =
  | string
  | { all: Requirement[] }
  | { any: Requirement[] }
  | { units: number; subject: string; level: number };

export type Semester = 1 | 2;

export type Requisites = {
  /** Completed in an earlier semester. */
  prerequisite?: Requirement;
  /** Completed earlier, or taken in the same semester. */
  corequisite?: Requirement;
  /** Can't be taken alongside or after these (catalogue courses only). */
  incompatible?: string[];
  /** What the page requires that the planner can't check. */
  note?: string;
  /** The semesters it ran in during 2025; [] when it didn't run at all;
   *  null when there's no 2025 page to say. */
  offered2025: Semester[] | null;
};

const PERMISSION_TOPIC =
  "Further prerequisites depend on the topic, and enrolment needs a permission code from the School of Computing.";

export const REQUISITES: Record<string, Requisites> = {
  // --- compulsory, foundational and project courses --------------------
  COMP6250: { offered2025: [1] },
  COMP6442: {
    prerequisite: "COMP6710",
    corequisite: { any: ["MATH6005", "COMP6260"] },
    offered2025: [1, 2],
  },
  COMP6710: { offered2025: [1, 2] },
  COMP8260: { offered2025: [2] },
  COMP6260: { offered2025: [2] },
  MATH6005: { offered2025: [1] },
  COMP8715: {
    prerequisite: { all: ["COMP6442", "COMP8260"] },
    incompatible: ["COMP8830", "COMP8800"],
    note: "Needs membership of a project group, approved by the convener, by the end of week 1.",
    offered2025: [1, 2],
  },
  COMP8830: {
    prerequisite: { all: ["COMP8260", "COMP6442"] },
    incompatible: ["COMP8715"],
    note: "Entry is competitive, and enrolment needs a permission code from the School of Computing.",
    offered2025: [1, 2],
  },

  // --- Professional Computing -------------------------------------------
  COMP6120: { corequisite: "COMP6442", offered2025: [2] },
  ENGN8100: {
    note: "The 2025 Programs and Courses page leaves the Master of Computing out of who can enrol, but Professional Computing requires this course and the 2026 page adds the Master of Computing, so it is open to you.",
    offered2025: [1],
  },
  COMP6240: { offered2025: [1, 2] },
  COMP6331: { prerequisite: { any: ["COMP6710", "COMP6310", "COMP6442"] }, offered2025: [1] },
  COMP6390: { offered2025: [2] },
  INFS8004: { offered2025: [1] },
  INFS8205: { offered2025: [1] },
  LAWS8445: {
    note: "Graduate students outside law may apply, case by case, with permission from the ANU College of Law.",
    offered2025: [1],
  },
  MGMT7020: { offered2025: [1, 2] },
  REGN8014: { offered2025: [1] },

  // --- 8000-level COMP -------------------------------------------------
  COMP8600: {
    prerequisite: { any: ["COMP6670", { all: ["COMP6710", "COMP8410", "STAT6039"] }] },
    offered2025: [1],
  },
  COMP8620: { prerequisite: "COMP6320", offered2025: [2] },
  COMP8650: { prerequisite: { any: ["COMP6670", "COMP8600"] }, note: PERMISSION_TOPIC, offered2025: [2] },
  COMP8410: { prerequisite: { all: ["COMP6240", "COMP6710"] }, offered2025: [1] },
  COMP8430: { prerequisite: { all: ["COMP6710", "COMP6240"] }, offered2025: [2] },
  COMP8800: {
    note: "Only for the Master of Computing (Advanced) and the Master of Machine Learning and Computer Vision, not the Master of Computing.",
    incompatible: ["COMP8715"],
    offered2025: [1, 2],
  },
  COMP8011: {
    prerequisite: { units: 12, subject: "COMP", level: 6000 },
    note: PERMISSION_TOPIC,
    offered2025: [1, 2],
  },
  COMP8045: {
    prerequisite: { units: 12, subject: "COMP", level: 6000 },
    note: PERMISSION_TOPIC,
    offered2025: [],
  },
  COMP8300: {
    prerequisite: { any: ["COMP6310", "COMP6330", "COMP6331", "COMP6464"] },
    offered2025: [1],
  },
  COMP8350: { prerequisite: { any: ["COMP6390", "COMP6720"] }, offered2025: [1] },
  COMP8460: { prerequisite: "COMP6466", offered2025: [] },
  COMP8539: { prerequisite: "COMP6528", offered2025: [2] },
  COMP8610: {
    prerequisite: {
      all: ["COMP6710", { any: ["COMP6390", "COMP6442", "COMP6540", "COMP6780", "COMP6720"] }],
    },
    offered2025: [1],
  },
  COMP8691: {
    prerequisite: "COMP6320",
    note: "Artificial Intelligence requires this course, but it didn't run in 2025; the next offering Programs and Courses lists is Second Semester 2026.",
    offered2025: [],
  },
  COMP8712: { prerequisite: { all: ["COMP6710", "COMP6442", "COMP6310"] }, offered2025: [1] },
  COMP8880: {
    prerequisite: { any: ["COMP6670", { all: ["COMP6710", "COMP8410", "STAT6039"] }] },
    offered2025: [1],
  },

  // --- 6000-level COMP and the rest -------------------------------------
  COMP6261: { offered2025: [2] },
  COMP6262: { offered2025: [1] },
  COMP6310: {
    prerequisite: "COMP6710",
    note: "Also needs COMP6300, which isn't in this planner's catalogue.",
    offered2025: [2],
  },
  COMP6320: { prerequisite: "COMP6710", corequisite: "COMP6262", offered2025: [1] },
  COMP6330: {
    note: "Needs COMP6300 completed or in progress, which isn't in this planner's catalogue.",
    offered2025: [2],
  },
  COMP6361: { prerequisite: { all: ["COMP6710", "COMP6260"] }, offered2025: [2] },
  COMP6363: { offered2025: [1] },
  COMP6464: { offered2025: [] },
  COMP6466: { offered2025: [2] },
  COMP6490: {
    prerequisite: { all: [{ any: ["COMP6240", "COMP6260", "COMP6442"] }, "COMP6710"] },
    offered2025: [2],
  },
  COMP6528: { offered2025: [1] },
  COMP6540: { prerequisite: "COMP6710", offered2025: [] },
  COMP6670: { corequisite: "COMP6710", offered2025: [2] },
  COMP6720: { offered2025: [2] },
  COMP6780: { offered2025: [] },
  ENGN6213: { offered2025: [1] },
  MATH6114: {
    note: "Enrolment needs a permission code from the Mathematical Sciences Institute.",
    offered2025: [2],
  },
  MATH8343: {
    note: "Programs and Courses restricts this to students of the Master of Mathematical Sciences programs.",
    offered2025: [1],
  },
  STAT6039: {
    note: "2025 Data Science lists this course, but it has no 2025 or 2026 page; the last one (2024) shows no offerings and doesn't admit the Master of Computing, and 2026 Data Science drops it: choose another elective.",
    offered2025: null,
  },
};
