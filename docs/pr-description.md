**Title:** Add Student Management REST API (Node.js, zero dependencies)

**Base:** `main`  **Head:** `feature/student-management`  **Status:** DRAFT. Not yet pushed.

## Summary
Adds a small REST API that lets an administrator add, list, view, update and delete student records, with validation, case-insensitive unique email, and specific error codes and messages. It uses Node.js (>=26, CommonJS), has no runtime or dev dependencies, and stores data in a JSON file written atomically. The work follows the 8-phase SDLC flow; phases 1-7 are approved; a post-review fix pass (F-1, F-2) was re-verified.

## Changes Made
Added:
- `src/errors.js`: error classes and the single error-to-HTTP mapper.
- `src/validation.js`: one set of field rules shared by add and update (NFR-3).
- `src/studentRepository.js`: in-memory Map store, load rules, atomic file writer, build-then-swap persistence so a failed save leaves state unchanged (NFR-2).
- `src/studentService.js`: business rules (email uniqueness, not found, check order).
- `src/routes.js`: routing, ID parsing, JSON body reading (10 KB limit, 415 gate), error responses.
- `src/server.js`: startup, `PORT` / `HOST` / `DATA_FILE`, loopback bind by default.
- `tests/api.test.js`, `tests/studentRepository.test.js`, `tests/studentService.test.js`, `tests/validation.test.js`: 113 tests across all four layers (NFR-5).
- `package.json` (no dependencies, `engines.node >=26`, `npm start`/`npm test`), `README.md` (setup, env vars, curl examples, error examples), `.gitignore` (adds `data/`).
- `docs/requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `code-review.md`, `verification-report.md`, `pr-description.md`, `CHANGELOG.md`: phase artifacts.

Modified:
- `workflow/workflow-state.json`: phase progress record.

Diff vs `main`: 20 files, +2366 / -14 (before this PR draft and the changelog).

## Test Evidence
Source: `docs/verification-report.md` (2026-11-25; Windows 11, Git Bash, Node v26.13.1, npm 12.2.3). Overall verdict: PASSED.

- `npm test` (initial run): 110 of 110 pass. After the F-1/F-2 fix pass, re-run fresh: `tests 113, suites 12, pass 113, fail 0`, exit 0.
- Re-verification live checks (see the re-verification section of the report): F-1 fixed (client abort mid-body dropped silently; a normal request succeeds afterwards; no `Unexpected error` or stack output). F-2 fixed (`PORT=abc`, `65536`, `-1`, `3.5`, `1e3` exit 1 with `Startup failed: PORT must be an integer from 0 to 65535`; a busy port exits 1 with `Startup failed: listen EADDRINUSE ...`, no stack). `HOST=127.0.0.1` binds loopback. A body over 10 KB returns 413 with `Connection: close`. The README PowerShell line works.
- Live run: `DATA_FILE=<tmp>/sub/students.json PORT=<free port> npm start` printed `Listening on http://127.0.0.1:50844`; the missing `sub/` directory was created on first save.
- All 11 acceptance criteria (AC-1..AC-11) and FR-1..FR-11 / NFR-1..NFR-5 have executed evidence. Examples seen live: `POST` 201 with `Location: /students/1`; missing name 422 `VALIDATION_ERROR` with `fields`; `ADA@example.com` against `ada@example.com` 409 `CONFLICT`; `/students/999` 404 `NOT_FOUND`; `/students/abc` 400 `INVALID_ID`; deleted id not reused (`nextId: 4`).
- Restart on the same data file reloaded records 2 and 3.
- Data file containing `{bad`: `Startup failed: Invalid data file: not valid JSON`, exit 1, file checksum unchanged.
- `git status --short --ignored` and `find . -name '*.tmp'` returned empty after the run.
- Code review (`docs/code-review.md`): APPROVE with minor notes; no critical or major findings.

## Known Limitations
Fixed after code review (re-verified): F-1 (client abort mid-body no longer logged as a 500) and F-2 (invalid `PORT` and listen errors now exit 1 with a clean message).

Accepted deviations (documented in `docs/architecture.md` s10):
- F-3: Email is trimmed before validation, so `a@b.c
` is accepted and stored as `a@b.c`. Consistent with the data model; architecture s7 test list corrected.
- F-4: `createServer` takes `{filePath, writer, log, logError}` so tests can inject a failing writer and capture logs; `host`/`port` are read from the environment at bootstrap.

Open, minor, not fixed:
- F-5: The repository does not enforce email uniqueness itself; only the service does. Not reachable through the API today.
- F-6: Small DRY lapses (duplicate `req.url.split("?")[0]`, two definitions of the email key, double lookup in `remove`).
- F-7: Remaining test gaps: temp-file cleanup on failed save is not observed, and there is no test for an unreadable data file. (Client abort and bad `PORT` are now tested.)

Verification gaps:
- Not run live: a 500 from a failed save (covered by automated tests only) and `HOST=0.0.0.0` (no network-exposed listener was bound).
- `npm audit` was not run: there is no lockfile and no dependencies (`ENOLOCK`, nothing to audit).
- An empty `PORT=` falls back to 3000.

Scope limits (by design): no authentication, no search/pagination, single-user file storage, each write rewrites the whole file (O(n)). On Windows, `renameSync` over an existing file can raise `EPERM`/`EBUSY`; this surfaces as 500 with state unchanged (DR-14).

## Reviewer Checklist
- [ ] Requirements met: FR-1..FR-11 and AC-1..AC-11 (see verification report tables)
- [ ] Tests pass: run `npm test` and confirm 113 pass, 0 fail
- [ ] No secrets in code, logs or docs (logs hold method, path, status and code only; no `.env`, no `data/` committed)
- [ ] Docs updated: `README.md`, `docs/CHANGELOG.md`, phase artifacts
- [ ] Error cases handled: validation 422, conflict 409, not found 404, invalid ID 400, bad JSON 400, 405, 413, 415, 500 with data unchanged
- [ ] Open items F-5..F-7 and the verification gaps above are accepted, or follow-up issues are opened
- [ ] Confirm the F-3 / F-4 accepted deviations in `docs/architecture.md` s10

🤖 Generated with [Claude Code](https://claude.com/claude-code)
