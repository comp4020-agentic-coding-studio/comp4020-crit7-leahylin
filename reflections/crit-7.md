# Crit 7

## What was the breakthrough that moved the work forward?

The breakthrough was using the planner the way a student would, instead of
judging it by whether the tests passed. When I tried to fill in a
specialisation, I could pick two 6000-level courses and then a third, and
the app happily let me walk into a plan that could never meet its 8000-level
minimum. Every test was green, because the rule was being counted correctly;
the problem was that the app offered choices it should already have ruled
out. Writing that down as a plain instruction ("after two courses below 8000
level, only offer 8000-level ones") turned a vague sense that something was
off into a small, testable rule. The same habit later made me go back to
Programs and Courses and check three courses again, and that showed the
official pages contradict each other. The app now says so instead of
quietly picking one.

## What did this work change about who I want to be as a software developer?

I want to be the developer who checks the source instead of trusting the
first answer, whether that answer is a passing test suite, an agent's
summary, or a university web page. Working with an agent made this sharper:
it can produce a lot of plausible code quickly, so my job moved towards
deciding what "right" means, writing it down precisely, and proving it.
That means breaking the code to see a test fail, opening the running app,
and keeping each commit small enough to verify on its own. I also learned
to say what I don't know. A planner that admits a gap is more useful than
one that sounds confident and is wrong.
