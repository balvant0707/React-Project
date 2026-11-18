# Audit of the SQL tests: which ones can fail (2026-11-14)

Why: the training proof policy was missing from the COMPASS build and the ported test for exactly that case passed
(found while preparing the COMPASS cutover, gap 3). This audit asks how many other tests are like it. Method: classify all 126 files
(`modules/*/sql/tests`, `platform/sql/tests`), run the print-only ones against the local COMPASS database and read what they
print, check every printed expectation that a machine can read, look for deletes from `storage.objects`.
Runner rule (`tools/sql-test.sh`): a test fails on a non-zero exit code or the word `FAIL` in its output.

## 1. Result in numbers

| Kind | Files | Can it fail? |
|---|---|---|
| Asserting (`assert` / `raise exception`) | 98 (79 ported, 19 written for the platform) | Yes |
| Signals failure with a `FAIL` label (`companies/search_smoke`, `offers/spec_tasks_smoke`, `tickets/andon_columns_smoke`) | 3 | Yes, when the label prints |
| **Print-only**, all ported from COMPASS | **20** (about 600 printed checks) | **No**, only a lost connection fails them |
| Perf probes | 5 | not tests (`tools/perf.sh`) |

The 20 print-only files print `select 'N label (expected result)', <result>` and set `\set ON_ERROR_STOP off`, so neither a wrong
result nor an SQL error changes the exit code. In the old COMPASS repo a person read the output. Here the suite reports them as
passed: `assets/recurring`, `items/checklists`, `items/items`, `people/job_descriptions`, `people/people`,
`people/training_requirements`, `task-family/checklist_steps`, `costs`, `goals`, `reminders`, `task_grants`, `trainings`,
`tasks/due_date`, `tasks/rls`, `tickets/followups`, `tickets/ticket_queues`, `workflows/task_types_purpose`,
`platform/anon_surface`, `email`, `owners`.

## 2. What those 20 files really do (run on the local COMPASS database)

**Four have real SQL errors, three of them stop early (a failed statement aborts the transaction; the rest is ignored):**

| File | Checks | What happens |
|---|---|---|
| `items/checklists_smoke` | 60 | Stops at check 14 (`more than one row returned by a subquery`: `title like 'Antriebsriemen%'` finds more than one task); about 46 checks never run. |
| `items/items_smoke` | 81 | Stops at check 34 ("workshop cannot delete a part (expect 0)"): the delete is not filtered by row security and hits the foreign key; about 47 checks never run. The policy (`rls_has('items.edit')`) is the same as in old COMPASS, and the Workshop role holds `items.edit`, so the test's premise is wrong, not a confirmed policy regression. |
| `tasks/rls_smoke` | 30 | Intended refusals ("You are not allowed to work this step", ...) are run outside the `pg_temp.rows()` wrapper, so they abort the transaction; 8 checks skipped. |
| `task-family/reminders_smoke` | 12 | `permission denied for function send_task_reminders` (needs a privileged user); 1 check skipped. |

**The other 16 run through, but nothing compares result and label.** 131 labels carry an expectation a machine can read
(`(N rows)`, `(blocked)`, `(blocked or 0 rows)`, `(expect N)`); 305 more are free text for a human. Of the 131, **19 disagree
with the printed result.** Triage of those 19:

| Cause | Checks | Verdict |
|---|---|---|
| The seed premise changed: the local Admin user `max` also holds HR (and Manager), so "admin (not HR) cannot delete" can; a following "HR deletes (1 row)" then finds nothing. Tom shares teams with Ben, so "outside his teams" is not true. | `job_descriptions` 50, 52, 53, 54; `trainings` 33a, 33; `training_requirements` 12, 15, 32, 37 | Test premise broken: the check no longer tests what its label says. No policy proven wrong; `admin_limits_smoke` (asserting) covers the admin limits properly by removing the other roles first. |
| The expectation is stale: `position_assignment_log` can be deleted by HR since the admin-limits stages (check 54 says so itself); an insert with `has_login = true` is forced to `false` by trigger `force_no_login_on_insert` (safe: HR cannot create a login). | `job_descriptions` 13; `people` 14 | Label outdated, behaviour right. |
| Label says "blocked" but the statement affects 0 rows (row security filters it: also safe), or a multi-statement row whose later cells are "blocked". | `job_descriptions` 23; `people` 35, 38; `task_types_purpose` 12; `trainings` 17, 19c | Harmless wording. |
| The check cannot see the policy at all: a plain delete from `storage.objects` is answered by Supabase's `protect_delete` trigger before row security. | `trainings` 19d | **A real gap hid here**; fixed, tested by `people/training_proof_files_smoke`. |

So: **no further missing policy was found**, but the audit could not rule one out for the roughly 305 free-text checks, and
about 90 checks in three files never ran at all.

## 3. Other findings

- `delete from storage.objects` appears in three tests. `tickets/storage_access_smoke` sets `storage.allow_delete_query`
  (correct), `people/training_proof_files_smoke` does, `task-family/trainings_smoke` does not (the vacuous one above).
- Asserting tests are not affected by any of this; the 19 written for the platform and the new ones are the model:
  `admin_limits_smoke` (sets up its own premise by removing roles), `training_proof_files_smoke` (flag + assertions).

## 4. Done and still open

Done (2026-11-14/15, scope kept small on purpose; no label-parser checker):

- `tools/sql-test.sh` now fails a test on any unexpected `ERROR:` line (the aborted-transaction cascade is not counted), so a
  print-only test can no longer skip half its checks silently. The runner passes the local dev password.
- The four broken premises are fixed in the tests themselves: `checklists_smoke` (one task
  resolved), `items_smoke` 34 (runs as the Workshop user), `reminders_smoke` (privileged call wrapped as must-refuse),
  `rls_smoke` (intended refusals wrapped: they fail with `FAIL:` if the statement is allowed and changes a row).
- Four COMPASS-only tests (`due_date`, `email`, `owners`, `rls`) are tagged `apps: compass` in `test-owners.json`; they used to
  "pass" on RADAR while testing nothing.
- Result: COMPASS 90/90, NPM green except `offers/thread_follow_rules_smoke` (separate, from the mail-access work).

Still open:

1. The 19 label/result disagreements of section 2 (broken seed premises, stale labels) are not machine-checked.
2. Turn the free-text checks of the security-relevant files (people, trainings, training requirements, task grants, items) into
   assertions as time allows.
3. A test written for the platform should assert (convention): a printed label is not a test.
