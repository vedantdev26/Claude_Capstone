**Title:** Student status: mark students Active or Inactive

**Base:** `main`  **Head:** `feature/student-status`

## Summary
Adds a `status` field to every student, either `Active` or `Inactive` (case-sensitive, default `Active`). The API gains `PATCH /students/{id}/status`, `POST` accepts an optional `status`, and every student response now carries `status`. The dashboard shows an Active/Inactive badge on each row and a Mark Active / Mark Inactive toggle. Existing data files keep working: records saved without `status` read as `Active`. No new dependencies. Requirements and architecture were amended with the user's approval (FR-19..FR-29, AC-18..AC-29, NFR-7, architecture s12).

## Changes Made
Modified (source), 7 files, +112 / -16:
- `src/validation.js`: one shared `checkStatus` used by `POST`, the file loader and `PATCH`. An `acceptStatus` option (off by default, so `PUT` ignores a body `status`). `PATCH` validation returns only the status string, so a body cannot set other fields.
- `src/studentRepository.js`: a record without `status` loads as `Active`; a present but invalid status fails startup. Loading never writes. `create` defaults to `Active`, `update` keeps the stored status, new `setStatus` uses the existing build, write, then swap commit (a failed write leaves memory and file unchanged).
- `src/studentService.js`: `create` passes the status through; new `setStatus` checks the student exists (404) before validating the status (422).
- `src/routes.js`: `PATCH /students/{id}/status`. Other methods on that path return 405. `PATCH` on `/students`, `/students/`, `/students/{id}` and `/students/status` returns 405. Deeper or wrong-case paths such as `/students/1/x` and `/students/1/Status` return 404 `ROUTE_NOT_FOUND`. `PATCH` requires `Content-Type: application/json` (415 otherwise).
- `public/app.js`, `public/index.html`, `public/styles.css`: Status column, badge, per-row toggle with success and error messages (HTTP errors, student deleted elsewhere). Badge text and class come from a fixed mapping and `textContent`; no `innerHTML`, inline style or handler, so the CSP is unchanged.

Tests, 6 files, +931 / -31:
- `tests/validation.test.js`, `tests/studentRepository.test.js`, `tests/studentService.test.js`, `tests/api.test.js`, `tests/frontend.test.js`: 82 new tests. 28 existing lines changed only to add `status` to expected objects; none removed or weakened (checked in code review).
- `scripts/browser-check.js`: 13 new browser checks.

Docs, 8 files, +495 / -8:
- `README.md` (API section, curl examples, error order, rollback note), `docs/CHANGELOG.md`, `docs/requirements.md` (Amendment 2), `docs/architecture.md` (s12), `docs/design-review.md`, `docs/impl-plan.md`, `docs/code-review-student-status.md`, `docs/verification-report-student-status.md`.
- `workflow/workflow-state.json`: phase progress record.

Diff vs `main`: 22 files, +1764 / -55 (before this description file). `package.json` is not touched.

## Behavior Notes
- `PUT` preserves the stored status and ignores a `status` in its body, even an invalid one (it is not validated).
- `POST` accepts an optional `status`; omitted means `Active`. An invalid value returns 422 naming `status`.
- `PATCH` body `{"status": ...}`: `status` is required (422 if missing or invalid), other fields are ignored, patching to the current status returns 200. Empty, non-JSON or non-object bodies return 400 `INVALID_JSON`; an empty ID segment (`/students//status`) returns 400 `INVALID_ID`.
- Inactive students stay listed, editable and deletable, and their email still counts for uniqueness (409).
- Legacy records without `status` read as `Active`. Loading, reads and failed requests do not write. The first successful write rewrites the whole data file with `status` on every record.
- Rollback: back up `data/students.json` before rolling back to pre-status code. Old code drops statuses when it loads the file and loses them on disk at its next save.

## Test Evidence
Sources: `docs/verification-report-student-status.md` (Windows 11, Node v26.13.1, headless browser), `docs/code-review-student-status.md`.
- `npm test`: 220 tests, 25 suites, 220 pass, 0 fail, 0 cancelled, 0 skipped (138 existing + 82 new). Re-run for this description: 220/220 again.
- `npm run test:browser`: 48/48 checks passed (35 existing + 13 new: legacy-record badge, toggle both ways, deleted-in-background alert, HTTP 500 alert). Ends with no JavaScript exceptions, CSP violations or console errors.
- Live HTTP on a free port with a temporary data file: 66 requests, all with the expected status; every failed request left the data file byte-identical (SHA-256 compared before and after). Covered 7 invalid status values on both `POST` and `PATCH`, 400/404/405/413/415/422, 409 against an Inactive student, `PUT` ignoring a body status, and delete of an Inactive student.
- Legacy file: server starts, API returns `Active`, file unchanged by loads, reads, a failed `PATCH` and a duplicate `POST`; the first successful `PATCH` rewrote every record with `status`. A bad present status (`"bogus"`, `"active"`, `null`, `1`, `""`) exits 1 and leaves the file untouched in all 5 cases.
- `data/students.json` md5 was identical before and after all runs.
- The verification report's first live run showed 4 FAIL lines. They were the script expecting made-up error codes (`STUDENT_NOT_FOUND`, `DUPLICATE_EMAIL`); the app correctly returns `NOT_FOUND` and `CONFLICT`. Not a product defect.

### Requirement trace (all pass)
FR-19..FR-29 (status values, default, legacy read, validation, `PATCH`, `PUT` preservation, responses, Inactive behavior, badge, toggle), AC-18..AC-29, NFR-7 (existing tests still pass), plus FR-1..FR-18 regression through the green suites.

### Review summary
- Design review (`docs/design-review.md`, Amendment 3): APPROVE, no critical or major findings. DR-16 to DR-23 were all minor. DR-16, DR-17, DR-18, DR-20 and DR-22 were folded into the architecture doc. DR-19 (tests so a lost `status` cannot go unnoticed: Inactive survives load and an unrelated save, `POST` with Inactive, every loaded record has `status`), DR-21 (toggle message uses the server response and clears the old message first) and DR-23 (no timing-dependent in-flight-click browser check) were carried into implementation and are covered by the tests above.
- Code review (`docs/code-review-student-status.md`): verdict APPROVE. CR-1 (README/CHANGELOG overstated the 405 rule for `PATCH`) and CR-2 (no browser check for a non-404 toggle failure) were minor and are fixed and re-verified. No open findings.

## Known Limitations
- The non-`ApiError` fallback in the toggle ("Unexpected error. Please try again.", `public/app.js` near line 296) is untested. Low risk.
- `npm start` on the default port 3000 was not run, to avoid colliding with a user's server. The same `src/server.js` was run with `PORT`, `HOST` and `DATA_FILE` set.
- A bad `status` in the data file stops startup with `record N failed validation`. The message names the record, not the field, and does not echo file contents. This is intended (architecture s12).
- Windows and one headless browser only; other OSes and browsers unverified. No CI exists, so the evidence is from local runs. `npm audit` cannot run (no lockfile, no dependencies).
- `PATCH` on the status path has no `Allow` header on 405, consistent with the other 405 responses.

## Reviewer Checklist
- [ ] Requirements met: FR-19..FR-29, AC-18..AC-29, NFR-7 (verification report trace table)
- [ ] `npm test` passes (220) and, with a browser installed, `npm run test:browser` passes (48)
- [ ] Error cases handled: invalid status 422 naming `status`, 400/404/405/413/415 on `PATCH`, failed requests leave the data file unchanged
- [ ] `PUT` preserves status and ignores a body `status`; Inactive students still block duplicate emails
- [ ] Legacy data file behavior and the rollback back-up note are acceptable
- [ ] No secrets in code, logs or docs; no `data/` committed; `package.json` unchanged, no new dependencies
- [ ] The 28 edited lines in existing tests only add `status`
- [ ] Docs updated: README API section, architecture s12, changelog
- [ ] Known limitations above are fine, or follow-up issues are opened

🤖 Generated with [Claude Code](https://claude.com/claude-code)
