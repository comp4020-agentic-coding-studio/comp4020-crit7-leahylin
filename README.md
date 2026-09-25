# Am I on track to graduate?

**Am I on track to graduate?** is a degree planner for one degree: the ANU **Master of Computing (7706XMCOMP)** under its **2025 rules**, for students who started in 2025 Semester 1 or Semester 2.

The prototype lets students add completed and planned courses, assign them to semesters, declare a specialisation, and see how their study plan satisfies the degree requirements. It shows which requirements are met, missing, or broken, and calculates the expected finishing semester once the plan covers all requirements.

The tool exists to answer a practical question that the existing ANU tools do not directly answer: **“Am I on track to graduate?”** ANU’s Programs and Courses pages describe degree requirements as prose, while enrolment tools record courses a student has enrolled in. Students therefore have to manually connect the two. This becomes difficult when rules interact, such as courses counting toward only one requirement, specialisations containing their own minimums and maximums, and the 24-unit 8000-level COMP requirement overlapping with other requirements.

The prototype focuses on this planning and checking workflow rather than trying to replace ANU’s official enrolment system.

## What good looks like here

**Right before pretty.** For this prototype, “good” means a student can build a study plan and understand whether they are actually on track to graduate, without having to manually interpret the degree rules. A planner that gives a confident answer but gets the rules wrong is worse than one that simply says it does not know.

**What I decided.** The planner makes the degree rules part of the planning process rather than hiding them behind one final result:

* **A course counts once.** Each course counts toward only one requirement; the 8000-level minimums are counted across all of them.
* **Specialisations are explicit.** Because the specialisation changes which requirements apply, the student declares one, and the Course Planner changes with it.
* **Course choices are constrained.** Each requirement only offers courses that can actually count toward it, so the student does not have to work out every possible combination manually.
* **Progress is explainable.** Degree Progress shows completed units out of 96 and lets the student open each requirement to see what is contributing to it, rather than only showing a percentage.
* **The semester matters.** A course can satisfy a requirement but still be a problem if it is planned in the wrong semester or its prerequisites have not been met. The Study Plan checks these separately.

**What I read.** These decisions came from ANU Programs and Courses: the 2025 program page for 7706XMCOMP, the 2025 page for each of its seven specialisations, and the 2025 course page of every course the planner offers, for its units, requisites and the semesters it ran. Every course and rule in `src/lib/seed-data.ts` is transcribed from those pages, with the source URL alongside. Reading them closely also showed where they disagree with each other, and the app says so on the course rather than silently picking a side:

* **ENGN8100** is compulsory in Professional Computing, a specialisation only Master of Computing students can take, yet its 2025 course page leaves the Master of Computing out of who can enrol. The 2026 page adds it.
* **COMP8691** is compulsory in Artificial Intelligence but did not run at all in 2025; the next offering listed is Second Semester 2026.
* **STAT6039** is on 2025 Data Science's elective list, but the course has no 2025 or 2026 page, its last (2024) page lists no offerings, and 2026 Data Science drops it.

**What I chose not to build.** This is not a general-purpose ANU degree planner. The prototype is limited to **7706XMCOMP under the 2025 rules** and students who commenced in 2025 Semester 1 or Semester 2. It does not reproduce ANU's official enrolment, approval, or other administrative processes. Part-time study, credit and exemptions, grades and WAM, timetable clashes, and accounts are also outside the prototype's scope. Without accounts, every plan is listed on the home page and anyone using the app can open and change it, so the prototype suits trying out a plan rather than keeping a private one. The goal is narrower: answer whether a proposed study plan satisfies the degree requirements and, if it does, when the student would finish.

**What's enforced and what's judgement.** The rules behind these decisions are enforced by the tests in `spec/`, which run against the built server with a fresh database. The test suite covers the allocator and every specialisation's shape (`progress.test.ts`), 8000-level headroom (`floor-headroom.test.ts`), semesters, intake and COMP8715 (`semester.test.ts`), graduation-date calculation (`graduation.test.ts`), requisite warnings (`requisites.test.ts`), the pages as a student uses them (`study-plan.test.ts`), seeding against a database that already contains data (`seed.test.ts`), and an accessibility floor on every page (`invariants.test.ts`).

`CLAUDE.md` holds three rules that came from mistakes the tests could not catch on their own: **reference data must correct an existing database; a test only counts if breaking the code turns it red; and a feature is not done until it has been used in the running app.** These rules make the tests part of the development process rather than just a final checklist.

The judgement calls are the parts no test can make for us: which Programs and Courses page to believe when sources disagree, how much of that disagreement to expose to the student, whether the explanation is clear enough, whether a planning problem is immediately visible, and how the interface should be organised. The prototype therefore treats **correctness as the first requirement, and visual polish as secondary**.

