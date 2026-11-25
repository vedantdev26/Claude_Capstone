**Title:** Add Student Management REST API (Node.js, zero dependencies)

**Base:** `main`  **Head:** `feature/student-management`  **Status:** DRAFT. Not pushed. No PR exists.

## Summary
Adds a small REST API that lets an administrator add, list, view, update and delete student records, with validation, case-insensitive unique email, and specific error codes and messages. It uses Node.js (>=26, CommonJS), has no runtime or dev dependencies, and stores data in a JSON file written atomically. The work follows the 8-phase SDLC flow; phases 1-7 are approved and committed locally (7 commits).

## Changes Made
Added:
- `src/errors.js`: error classes and the single error-to-HTTP mapper.
- `src/validation.js`: one set of field rules shared by add and update (NFR-3).
- `src/studentRepository.js`: in-memory Map store, load rules, atomic file writer, build-then-swap persistence so a failed save leaves state unchanged (NFR-2).
- `src/studentService.js`: business rules (email uniqueness, not found, check order).
- `src/routes.js`: routing, ID parsing, JSON body reading (10 KB limit, 415 gate), error responses.
- `src/server.js`: startup, `PORT` / `HOST` / `DATA_FILE`, loopback bind by default.
- `tests/api.test.js`, `tests/studentRepository.test.js`, `tests/studentService.test.js`, `tests/validation.test.js`: 110 tests across all four layers (NFR-5).
- `package.json` (no dependencies, `engines.node >=26`, `npm start`/`npm test`), `README.md` (setup, env vars, curl examples, error examples), `.gitignore` (adds `data/`).
- `docs/requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `code-review.md`, `verification-report.md`, `pr-description.md`, `CHANGELOG.md`: phase artifacts.

Modified:
- `workflow/workflow-state.json`: phase progress record.

Diff vs `main`: 20 files, +2366 / -14 (before this PR draft and the changelog).

## Test Evidence
Source: `docs/verification-report.md` (2026-11-25; Windows 11, Git Bash, Node v26.13.1, npm 12.2.3). Overall verdict: PASSED.

- `npm test`: `tests 110, suites 11, pass 110, fail 0, cancelled 0, skipped 0`, exit 0, about 0.8 s.
- Live run: `DATA_FILE=<tmp>/sub/students.json PORT=<free port> npm start` printed `Listening on http://127.0.0.1:50844`; the missing `sub/` directory was created on first save.
- All 11 acceptance criteria (AC-1..AC-11) and FR-1..FR-11 / NFR-1..NFR-5 have executed evidence. Examples seen live: `POST` 201 with `Location: /students/1`; missing name 422 `VALIDATION_ERROR` with `fields`; `ADA@example.com` against `ada@example.com` 409 `CONFLICT`; `/students/999` 404 `NOT_FOUND`; `/students/abc` 400 `INVALID_ID`; deleted id not reused (`nextId: 4`).
- Restart on the same data file reloaded records 2 and 3.
- Data file containing `{bad`: `Startup failed: Invalid data file: not valid JSON`, exit 1, file checksum unchanged.
- `git status --short --ignored` and `find . -name '*.tmp'` returned empty after the run.
- Code review (`docs/code-review.md`): APPROVE with minor notes; no critical or major findings.

## Known Limitations
Accepted unfixed after code review (all minor; none is a verification failure):
- F-1: A client that disconnects mid-body is logged as an unexpected 500 with a stack trace and the server tries to reply to a dead socket. No data is affected (nothing reaches the service). Reproduced during code review; not run in verification.
- F-2: `PORT` is not validated. `PORT=abc` or a listen error such as `EADDRINUSE` crashes with a raw stack trace, unlike the clean bad-data-file startup message. Not run in verification.
- F-3: Doc drift. Email is trimmed before validation, so `a@b.c\n` is accepted and stored as `a@b.c`. Architecture section 7 lists it as rejected. Code is safe and tested as trimmed; the architecture text was not amended.
- F-4: Doc drift. `createServer` takes `{filePath, writer, log, logError}`, not `{filePath, host, port}` as in architecture sections 2 and 7.
- F-5: The repository does not enforce email uniqueness itself; only the service does. Not reachable through the API today.
- F-6: Small DRY lapses (duplicate `req.url.split('?')[0]`, two definitions of the email key, double lookup in `remove`).
- F-7: Test gaps: temp-file cleanup on failed save is not observed, and there are no tests for client abort, an unreadable data file, or bad `PORT`.

Verification gaps:
- The `HOST` variable was not run live; only the default loopback bind was checked (the default-bind test passes).
- 413 (oversize body) and 500 (failed save) were not exercised live; they are covered only by automated tests. Client abort (F-1) is not covered at all.
- `npm audit` was not run: there is no lockfile and no dependencies (`ENOLOCK`, nothing to audit).
- The README example `PORT=8080 DATA_FILE=/tmp/students.json npm start` uses POSIX syntax and does not run as written in Windows `cmd` or PowerShell. It worked in Git Bash.

Scope limits (by design): no authentication, no search/pagination, single-user file storage, each write rewrites the whole file (O(n)). On Windows, `renameSync` over an existing file can raise `EPERM`/`EBUSY`; this surfaces as 500 with state unchanged (DR-14).

## Reviewer Checklist
- [ ] Requirements met: FR-1..FR-11 and AC-1..AC-11 (see verification report tables)
- [ ] Tests pass: run `npm test` and confirm 110 pass, 0 fail
- [ ] No secrets in code, logs or docs (logs hold method, path, status and code only; no `.env`, no `data/` committed)
- [ ] Docs updated: `README.md`, `docs/CHANGELOG.md`, phase artifacts
- [ ] Error cases handled: validation 422, conflict 409, not found 404, invalid ID 400, bad JSON 400, 405, 413, 415, 500 with data unchanged
- [ ] Known limitations F-1..F-7 and the verification gaps above are accepted, or follow-up issues are opened
- [ ] Decide on F-3 / F-4: amend `docs/architecture.md` or accept as recorded deviations
- [ ] Confirm the README POSIX env-var example is acceptable, or add cmd/PowerShell variants

🤖 Generated with [Claude Code](https://claude.com/claude-code)
