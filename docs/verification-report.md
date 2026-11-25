# Verification Report: Student Management

Date: 2026-11-25. Environment: Windows 11, Git Bash, Node v26.13.1, npm 12.2.3. Inputs: `docs/requirements.md`, `docs/impl-plan.md`, `docs/code-review.md`, `src/`, `tests/`, `README.md`. No source or test files were modified.

## Overall verdict: PASSED

All 11 acceptance criteria and all FR/NFR items have executed evidence. No critical or major failures. Seven minor known issues (F-1..F-7 from code review, accepted unfixed) are recorded below; none is a verification failure.

## Commands run

| # | Command (verbatim) | Result |
|---|---|---|
| 1 | `node --version && npm --version` | `v26.13.1`, `12.2.3` (satisfies `engines.node >=26`) |
| 2 | `npm test` | `tests 110, suites 11, pass 110, fail 0, cancelled 0, skipped 0`, exit 0, about 0.8 s |
| 3 | `DATA_FILE=<tmp>/sub/students.json PORT=<free port> npm start` | `Listening on http://127.0.0.1:50844`. The data file and its `sub/` directory did not exist before the first save. |
| 4 | curl sequence against the running server (see below) | All responses matched the expected status, code and message |
| 5 | Stop the server, restart on the same data file, `curl /students` | Records 2 and 3 were reloaded: `[{"id":2,...Bob...},{"id":3,...Cy...}]` |
| 6 | `DATA_FILE=<tmp>/bad.json npm start` (file content `{bad`) | `Startup failed: Invalid data file: not valid JSON`, exit 1, file checksum unchanged |
| 7 | `git status --short --ignored`, `find . -name '*.tmp'` | Empty output: no `data/`, no `.tmp`, no changes |

`npm test` was executed twice. The second run only filtered the suite names and gave the same suites passing (API x5, repository x3, service, validation, parseId). The server was stopped via `taskkill` after the exercise, and no listener was left on the port. The temp directory was deleted.

## Acceptance criteria

Server evidence (S) comes from the live `npm start` run. Test evidence (T) comes from the 110-test suite (`tests/api.test.js`, `studentService.test.js`, `studentRepository.test.js`, `validation.test.js`). The names of the passing tests cited are those printed by the run.

| AC | Result | Evidence |
|---|---|---|
| AC-1 add, unique ID | pass | S: `POST /students` returned `201`, `Location: /students/1`, body `{"id":1,"name":"Ada Lovelace",...}`. The second add got id 2. T: service/API happy-path tests. |
| AC-2 list | pass | S: `GET /students` on a fresh store returned `200 []`. After two adds it returned both records, ordered by id. |
| AC-3 get by ID | pass | S: `GET /students/1` returned `200` with the record. |
| AC-4 update | pass | S: `PUT /students/1` returned `200` with new name and course. A body with `"id":99` still returned `"id":1`. A later `GET` showed the stored change. |
| AC-5 delete | pass | S: `DELETE /students/1` returned `204`. `GET /students/1` then returned `404 NOT_FOUND`. A new add got id 3, so the id was not reused. The data file showed `nextId: 4`. |
| AC-6 required/blank | pass | S: missing name returned `422 VALIDATION_ERROR` with `fields:[{"field":"name","message":"is required"}]`. Blank name and course returned both fields. A `PUT` with email missing returned `email: is required`. The list afterwards was unchanged. |
| AC-7 malformed | pass | S: `email:"abc"` on `POST` and `"nope"` on `PUT` both returned `422` naming `email`. |
| AC-8 duplicate email | pass | S: `POST` with `ADA@example.com` against `ada@example.com` returned `409 CONFLICT "Email already in use"`. `PUT /students/2` with `" Ada@Example.com "` returned `409`. `PUT /students/1` with its own email in a different case returned `200`. |
| AC-9 not found | pass | S: `GET`, `PUT` and `DELETE /students/999` each returned `404 NOT_FOUND "Student 999 not found"`. The `PUT` carried a valid body. T: API test of `PUT /students/999` with an invalid body returns 404 (check order). |
| AC-10 invalid ID | pass | S: `GET`, `PUT` and `DELETE /students/abc` returned `400 INVALID_ID`. `PUT /students` and `DELETE /students` returned `400 INVALID_ID "Student ID is required"`. `DELETE /students/0` returned `400`. T: `0`, `007`, `1e3`, `0x10`, `12abc`, `1%00`, `9007199254740993` are rejected and `%31` is accepted. |
| AC-11 message states cause, data unchanged | pass | S: every rejected request above returned a specific message and code. `GET /students` after all the failures was identical to the state before them (ids 1 and 2). T: `a failing writer propagates the error and leaves state unchanged (AC-11)`, and the API failed-save suite (500 `INTERNAL_ERROR`, store unchanged, `nextId` not consumed). |

## FR and NFR coverage

| Req | Result | Evidence |
|---|---|---|
| FR-1..FR-6 | pass | AC-1..AC-5 |
| FR-7, FR-8 | pass | AC-6, AC-7 |
| FR-9 | pass | AC-8 |
| FR-10 | pass | AC-9 |
| FR-11 | pass | AC-10 |
| NFR-1 | pass | Each error class returned a distinct `code` and a specific message. Extra codes were also seen: `INVALID_JSON` 400 for `{bad`, `UNSUPPORTED_MEDIA_TYPE` 415 for `text/plain`, `METHOD_NOT_ALLOWED` 405 for `PATCH /students`, `ROUTE_NOT_FOUND` 404 for `/other`. |
| NFR-2 | pass | Live state check after the failed requests. Unit and API tests for a failing writer. |
| NFR-3 | pass | The same field errors came back from `POST` and `PUT`. Test `add and update apply the same validation (NFR-3)` passed. |
| NFR-4 | pass | Zero runtime and dev dependencies. Six small source modules, and no features beyond the story. |
| NFR-5 | pass | 110 automated tests across all four layers, all passing. |

## Edge cases beyond the AC

- Persistence: restart reloaded the same records, and the file was written atomically with no `.tmp` left behind.
- Invalid data file: the server refuses to start with a clean one-line message, exit code 1, and the file is untouched (matches the README statement).
- The default bind is loopback only, shown by the `Listening on http://127.0.0.1:...` line.

## README check

| Item | Result |
|---|---|
| Setup: "no install needed" | pass. Ran `npm test` and `npm start` with no `npm install`. |
| `npm start` and `PORT`/`DATA_FILE` | pass. Server listened on the chosen port, and the data file path (with a missing directory) was created on first save. |
| `HOST` variable | not run. Only the default bind was checked live. The default-bind test passed. |
| curl examples: add, list, get, update, delete | pass. Same commands and flags as the README, and the status codes match (`201` + `Location`, `200`, `200`, `200`, `204`). |
| Error examples: validation, conflict, not found, invalid ID | pass. Bodies are byte-identical to the README JSON for validation (`email: must be a valid email address`), conflict, not found (`Student 999 not found`) and invalid ID (`Student ID must be a positive integer`). |
| "Other codes" list | pass. 400, 404, 405, 415 observed live. 413 and 500 are covered by tests only. |
| `data/` git-ignored | pass. `git status --ignored` was clean after the run, and the default `data/` directory was never created because `DATA_FILE` was set. |

Doc note (minor, not a failure): the `PORT=8080 DATA_FILE=/tmp/students.json npm start` example uses POSIX syntax. It does not run as written in Windows `cmd` or PowerShell. It worked in Git Bash, which is how it was run here (with equivalent variables).

## Failures

None.

## Known issues (accepted from code review, not verification failures)

| ID | Summary | Status in this run |
|---|---|---|
| F-1 | Client abort mid-body is logged as an unexpected 500 | Not run. No live repro was attempted. Accepted unfixed. |
| F-2 | A bad `PORT` or listen error such as `EADDRINUSE` crashes with a raw stack | Not run. Accepted unfixed. |
| F-3 | Doc drift: email is trimmed before validation, so `a@b.c\n` is accepted. Architecture s7 says rejected. | Consistent with the live behavior: `" Ada@Example.com "` was trimmed for the duplicate check. |
| F-4 | Doc drift: `createServer` signature differs from architecture s2/s7 | Not exercised by black-box checks. |
| F-5 | The repository does not enforce email uniqueness itself (the service does) | Not reachable through the API. |
| F-6 | Small DRY lapses | Code quality only. |
| F-7 | Test gaps (temp-file cleanup on failed save, abort, unreadable data file, bad `PORT`) | Noted. The suite as given passes. |

## Not run

- `npm audit`: there is no lockfile and there are no dependencies (consistent with the code review's note).
- Oversize body (413), failed save (500), and client abort were not exercised live. They are covered only by the passing automated tests (413 and 500) or not at all (abort, F-1).
