# Code Review: student status (Amendment 2 reqs / Amendment 3 design)

Branch `feature/student-status`. Scope: `git diff bf91143 HEAD -- src public tests scripts README.md docs/CHANGELOG.md` (15 files). Specs: requirements Amendment 2 (FR-19..FR-29, AC-18..AC-29, NFR-7), architecture s12, DR-16..DR-23, impl-plan Amendment 3. Source and tests were not modified. Evidence: `npm test` = 220 tests, 220 pass, 0 fail; `npm run test:browser` = 47/47 passed (first review), then 48/48 after the CR-1/CR-2 fixes (re-review, real runs, headless browser available); ad-hoc probes against an in-memory server for the routing and `__proto__` cases.

Re-review (uncommitted `git diff HEAD -- README.md docs/CHANGELOG.md scripts/browser-check.js`): CR-1 and CR-2 resolved, no new findings.

## Verdicts

| Area | Result | Notes |
|---|---|---|
| Correctness vs FR/AC | pass | Legacy record without `status` loads as `Active` (`validateStudent(raw, {acceptStatus:true})`, repository.js:70); present invalid status (`null`, `""`, `"x"`, `1`) fails startup via `DataFileError`; load never writes. `update` copies `existing.status` (repository.js:153). `service.setStatus` does `requireStudent` (404) before `validateStatusChange` (422) (service.js:37-38). `ROUTE_RE` status branch precedes the collection branch (routes.js:86-91); method check (405) precedes `parseId`; order is ID, 415, 413/400, 404, 422. Same-status PATCH goes through `commit` and writes. Probed: `/students/1/status/` 200, `/students/status` 405, `/students/1/x` 404. |
| Security | pass | Only own `status` is read (`Object.hasOwn`); `__proto__`/`constructor` keys in POST/PUT/PATCH bodies have no effect (probed; tests at api.test.js:351, 757, validation.test.js:209). No mass assignment: `create` and `update` use explicit picks, `setStatus` spreads the stored record, never request data. Validation message is a fixed string, so no input is echoed; the log line is method, path without query, status, code. Badge text and class come from a fixed two-way mapping with `textContent`; no `innerHTML`, inline style or handler, so the CSP is unaffected. No new dependencies. |
| Error handling | pass | `setStatus` uses the build-then-write-then-swap `commit`; a throwing writer leaves memory, file and `nextId` unchanged (repository test with real file, API test with failing writer returns 500 with a generic message). Invalid or missing ID 400, unknown ID 404, bad body 400/415/413, bad status 422. Dashboard handles NOT_FOUND, other `ApiError` and unexpected errors. |
| Code quality / clarity | pass | Small, consistent with existing style; no new files; no restating comments. |
| Maintainability / DRY | pass | One `checkStatus` shared by POST, loader and PATCH; `asObject` extracted and reused; `acceptStatus` flag defaults to the safe "ignore" mode and the DR-19 silent-failure risk is covered by tests (Inactive survives load, POST and unrelated save). |
| Dependency safety | not run | `npm audit` fails with ENOLOCK; `package.json` has no dependencies and no lockfile. Diff adds none. |
| Test coverage | pass | CR-2 resolved (see Findings). FR-19..FR-29 and AC-18..AC-29 each have a real assertion (see matrix). The 28 rewritten lines in `git diff e47f62a~1 HEAD -- tests/` were checked mechanically: each of the 28 removed lines has an added line identical to it after deleting only `status: 'Active'` or `'status'`; none removed or weakened. Count: 138 existing + 82 new = 220. |

## Findings

| ID | Severity | file:line | Problem | Recommended fix |
|---|---|---|---|---|
| CR-1 | minor | README.md:130; docs/CHANGELOG.md:14 | RESOLVED. Docs said `PATCH` on "any other `/students` path" is 405. Now README and CHANGELOG say 405 for `/students`, `/students/`, `/students/{id}` and `/students/status`, and 404 `ROUTE_NOT_FOUND` for other unknown, deeper or wrong-case paths. | Evidence: `ROUTE_RE` (routes.js:15) with the non-status, non-collection branch (routes.js:104) gives 405 for those four; tests api.test.js:861 (`/students`, `/students/status`, `/students//`, `/students/1`, `/students/`) and :878 (`/1/Status`, `/1/x`, `/1/status/x`, `/1//` -> 404). Wording is accurate and not over-claiming. |
| CR-2 | minor | scripts/browser-check.js:245-254; public/app.js:296 | RESOLVED. New check "a failed toggle (HTTP 500) ..." covers the non-NOT_FOUND `ApiError` branch of `toggleStatus`. | Evidence: stub returns a 500 JSON `INTERNAL_ERROR` only for `PATCH` (others pass to the real fetch); `app.js:351` resolves global `fetch` per call so the stub takes effect. Asserts exactly one PATCH, message text equals the server message, `role="alert"`, class `alert error`, badge `Active`, label `Mark Inactive`, one row. Not timing-dependent beyond the file's existing bounded `T.waitFor` polling (the prior success banner has class `alert success` and is cleared on click, so no stale match). `window.fetch` is restored right after the wait, before assertions. Diff is additive only (10 lines added, 0 removed); no existing check changed. Real run: 48/48 pass. |

No critical or major findings. No open findings; no new findings from the re-review.

Residual (not a finding): the non-`ApiError` half of the ternary at app.js:296 ("Unexpected error. Please try again.") remains untested; low risk, optional.

## Requirement matrix (spot-verified, test names in `tests/`)

| Req | Covered by |
|---|---|
| FR-19, FR-22, AC-20 | validation "rejected set is identical..."; api "POST with an invalid status", "PATCH with {} or an invalid status", "PATCH and POST reject the same status values" (12 bad values incl. `' Active'`, `''`, `null`, `1`) |
| FR-20, AC-18 | api "POST without status is Active..."; service create default/explicit/Inactive |
| FR-21, AC-19 | repository "legacy file ... not rewritten", "mixed", "first save writes status"; api "server started on a legacy file"; browser legacy check |
| FR-23, AC-21 | api "PATCH flips Inactive then Active", "same status 200", persistence across restart |
| AC-22 | api empty/invalid JSON/array -> 400, `{}` -> 422, no content type -> 415 |
| FR-24, AC-23 | api `//status` 400, bad ID table, `%31`, unknown ID 404, DR-17 405s |
| FR-25, AC-24 | repository/service/api "update/PUT ignores a body status and preserves Inactive" |
| FR-26, AC-25 | api "status is present in list, get, create, update and PATCH" (exact key order) |
| FR-27, AC-26 | repository email lookup; service and api "Inactive still blocks duplicate email ... listed, got, deleted" |
| FR-28, AC-27 | frontend contract tests + browser "badges render for both statuses", legacy badge `Active` |
| FR-29, AC-28 | browser toggle both ways, DR-21 server-name message, deleted-in-background error, HTTP 500 failure leaves row unchanged |
| NFR-2 | repository and api failing-writer tests |
| NFR-7, AC-29 | 138 existing tests still present and passing; only `status` additions (checked above) |

## Docs vs behavior
README API section, curl examples, error order, 405/404 routing wording and rollback note match the code. CHANGELOG counts match real output: `npm test` 220 tests (138 existing + 82 new), `npm run test:browser` 48 checks (35 existing + 13 new; 47 before CR-2).

## Overall verdict
**APPROVE.** Implementation is correct and secure against the specs. CR-1 and CR-2 are resolved and verified; the re-review found no new issues. Ready for verification.
