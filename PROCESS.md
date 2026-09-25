# Process overview

## What I built

A planner that answers "am I on track to graduate?" for the 2025 Master of
Computing (7706XMCOMP); `README.md` says what good means here.

## How I got here

I started from the source, not the screen. The degree went in as data
transcribed from Programs and Courses, every requirement as "N units from a
pool" [`0988e60`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/0988e60), with an engine that spends each course once
[`c96b16a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/c96b16a) and all seven specialisations from their own pages
[`4803855`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/4803855). Pages came after the rules could be computed.

Using the app was what moved it on. My prompts were about what I saw while
planning, for example:

> For a specialisation, you need to complete 4 courses, at least 12 units of
> them at 8000 level … if 2 courses below 8000 level are already chosen, don't
> allow choosing another course below 8000 level.

That became pure headroom logic [`b6fe159`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/b6fe159), and then a fix when
Computational Foundations showed the limit had to hold across the whole box
[`680657f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/680657f). The same loop gave COMP8715's two semesters, the intake
selector and the prerequisite warnings [`1727b4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/1727b4d), where re-reading the
official pages turned up three that contradict each other.

The harness grew from failures the tests couldn't see. A new column kept its
default on an existing database, so seeding became an upsert
[`823fac0`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/823fac0) and rule 1 of `CLAUDE.md`; splitting Data Science
[`8cb0a9b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/8cb0a9b) showed removed data needs the same care [`2f30ec9`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/commit/2f30ec9).

**How I knew it was right.** Specs run against the built server; for each new
rule I broke the code and watched a spec go red (rule 2); I used the running
app and read the page back (rule 3); and each commit was built and tested on
its own before the next, e.g. [`282babb...1727b4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-leahylin/compare/282babb...1727b4d).
