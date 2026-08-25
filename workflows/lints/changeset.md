# Changeset lint

Scope: the diff only.

A diff that changes published source (src/**, excluding *.test.ts,
*.test-d.ts, *.bench.ts, and *.bench-d.ts) must carry a changeset entry in
.changeset/*.md.

Judge two things:

1. Presence. If published behavior changes and no changeset exists in the
   diff, report it.
2. Level. Read the changeset's declared level and compare it against the
   change: bug fixes and internal refactors are patch; new exported
   symbols or options are minor; removed or renamed exports, changed
   defaults, and changed error shapes are major. Report a level that
   understates the change.

Doc-only, test-only, and chore diffs need no changeset; do not report
those.

In fix mode, write or correct the changeset entry: one sentence, present
tense, user-facing wording. Do not touch source files.
