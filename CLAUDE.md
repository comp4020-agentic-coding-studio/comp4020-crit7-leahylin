# Your harness

Three rules. Each one exists because of something that actually went wrong
building this app, and each closes a different way that `pnpm check` can be
green while the app is wrong. That is the only test a rule has to pass to
belong here: **would the suite have caught this on its own?** If yes, the
suite is the rule and this file doesn't need to repeat it.

---

## 1. Reference data upserts. User data does not.

The degree's definition — courses, requirements, specialisations, and the
pools joining them — is authoritative in `src/lib/seed-data.ts`. Write it with
`onConflictDoUpdate` on the natural key, so a boot against a database that
already holds it **corrects** it. Rebuild pool rows rather than upserting
them: their columns are their key, so an upsert can add a course to a
requirement's pool but can never notice one removed.

Anything belonging to a user — plans, plan items — uses
`onConflictDoNothing`. Re-asserting it every boot would undo their edits.

**Why.** `onConflictDoNothing` never updates an existing row. When
`requirements.kind` was added, every row on an existing database kept the
column's default, so the 96-unit total and the 8000-level floor were both
treated as allocating buckets. A fresh local database was perfectly correct,
because there the INSERT path runs. The Fly volume outlives every deploy, so
production was the only case that broke — and the tests could never have found
it, since `spec/global-setup.ts` hands each run a brand new temp database.

**So, before calling a migration or a seed change done:** boot it against a
database that already has data in it, not only an empty one. The honest way is
to build the database with the previous commit's code, then boot the new code
against it and check both that the new thing arrived and that the old data
survived. Rolling a schema back by hand does not count — hand-dropping a
column with a foreign key leaves SQLite in a state no real deploy produces,
and you will debug a problem you invented.

**Taking something out of the data is a change too.** An upsert can add a
requirement and correct one, but never notice one removed from
`seed-data.ts`. When Data Science's single 24-unit list was split into its
compulsory and elective blocks, the old row would have stayed in every
existing database with its pool rows dropped — and a requirement with no
pool is an open one, so it would have counted every course. The seed now
deletes requirements that are no longer in the data. `spec/seed.test.ts`
runs the seed against a migrated database that already holds rows; that is
where a change like this is proved, because the HTTP specs only ever see a
fresh one.

---

## 2. A test that doesn't fail when you break the code is not a test.

Before claiming logic is covered, break the implementation and confirm
something goes red. Do this for each behaviour that matters, not once for the
file:

```
for each rule the code claims to implement:
    change that line to do the wrong thing
    run the tests
    if nothing fails, the test is decorative — rewrite it, then restore
```

**Why.** Two tests here passed for the wrong reason. One claimed to check that
completed courses are credited before planned ones; it was actually satisfied
by the alphabetical tie-break, and kept passing with the status check deleted.
The other claimed to check that a smaller course is preferred over one that
overshoots, and no real MCOMP bucket exercised that at all. Both were found
this way and rewritten to discriminate; neither would have been found by
reading them.

Prefer tests driven by the real seeded data over fixtures, so they check the
degree as modelled and not just the mechanism — and when a case the real data
can't produce needs covering, say so in the test and use a fixture
deliberately.

---

## 3. Run the app. A green suite is not a demo.

Before calling a feature done, boot the built server and interact with it the
way a person would: create the thing, change it, read the rendered HTML back.
Not the dev server's home page — the actual path the change touches.

```bash
HOST=127.0.0.1 PORT=4400 DATABASE_PATH=$(mktemp -d)/app.db node ./dist/server/entry.mjs &
# form POSTs need a same-origin Origin header or Astro refuses them:
curl -s -X POST -H "origin: http://127.0.0.1:4400" --data '...' http://127.0.0.1:4400/api/...
curl -s http://127.0.0.1:4400/plan/demo/   # and actually read it
```

**Why.** The two worst bugs in this build were invisible to a green suite.
Taking 18 units from a 12-unit-maximum list and 12 from its paired minimum
list made the app report both rules broken, even though those same courses
contain a valid 24-unit assignment — a false negative of exactly the kind the
allocator exists to prevent. And a verdict badge never rendered at all,
because `.replace(" ", "-")` substitutes only the first space, so "over the
limit" became two CSS classes. Both were found by looking at the page. Neither
test suite was wrong; they were testing a layer below the mistake.

---

## On the seed data

Not a rule so much as the standard the rest of the work is held to: every
course title, unit value and requirement in `src/lib/seed-data.ts` is
transcribed from ANU Programs and Courses, with the source URL in the file. If
a page can't be sourced, the gap is stated in the UI rather than filled in —
two courses that appear in older catalogues are left out because they 404 on
the live site, and a 2015 course list was not seeded as though it were
current. An app that models a real university system is only worth anything if
its model is actually real.
