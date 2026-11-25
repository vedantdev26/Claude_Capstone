# Verification Report: Student Management

Date: 2026-11-25. Environment: Windows 11, Git Bash, Node v26.13.1, npm 12.2.3, Windows PowerShell 5.x (`powershell`; `pwsh` not installed). Inputs: `docs/requirements.md`, `docs/impl-plan.md`, `docs/code-review.md`, `docs/architecture.md`, `src/`, `tests/`, `README.md`. No source or test files were modified by verification.

This report has two parts: the current state after the F-1/F-2 fix pass (re-verification, section below) and the initial run, which is kept for the black-box AC evidence it produced. Where the initial run said something that is no longer true, the statement has been corrected in place.

## Overall verdict: PASSED

All 11 acceptance criteria and all FR/NFR items have executed evidence. The suite is 113/113. No critical or major failures. F-1 and F-2 are fixed and live-verified. Five minor known issues remain (F-3/F-4 now documented as accepted deviations in `docs/architecture.md` s10; F-5..F-7 accepted unfixed); none is a verification failure.

## Re-verification after F-1/F-2 fixes

Scope of change since the last verified run (110/110): `src/routes.js` (F-1), `src/server.js` (F-2), 3 new tests in `tests/api.test.js`, `docs/architecture.md` (s2, s7, new s10), README (PORT row, PowerShell example). `git status --short` at the start showed exactly those five files as modified (uncommitted).

### Commands run and results

| # | Command (verbatim) | Result |
|---|---|---|
| R1 | `npm test` | `tests 113, suites 12, pass 113, fail 0, cancelled 0, skipped 0, todo 0`, exit 0, `duration_ms 1511`. New suites/tests: `API: client abort mid-body (F-1)`, `invalid PORT exits non-zero with a clean message and no stack trace (F-2)`, `listen failure (EADDRINUSE) exits non-zero with a clean message (F-2)`. (`npm test` was run twice: once for the count and once to list test names; both 113 pass.) |
| R2 | `DATA_FILE=<tmp>/sub/students.json PORT=64902 npm start` | `Listening on http://127.0.0.1:64902`. Only listener on the port (`netstat`: `127.0.0.1:64902 LISTENING`). stderr held only npm's own `npm notice run ...` lines. |
| R3 | README curl examples (add, list, get, update, delete, validation, conflict, not found, invalid ID), flags as written, host/port substituted | `201` + `Location: /students/1`; list; `200`; `200`; `204`; `422`; `409`; `404`; `400`. Bodies identical to the README JSON. After delete `GET /students/1` was `404` and the list was `[]`. |
| R4 | `PORT=abc DATA_FILE=<tmp>/x.json npm start` | exit `1`. stdout empty. stderr: `Startup failed: PORT must be an integer from 0 to 65535` (plus npm's two `npm notice` lines). No stack trace. Same output and exit 1 via `node src/server.js`. |
| R5 | `PORT=<v> node src/server.js` for `65536`, `-1`, `3.5`, ` 80`, `1e3`, `99999` | Each: exit 1 with the same one-line message. `PORT=''` (empty) falls back to the default and listened on 3000 (killed by `timeout`, exit 124). |
| R6 | Second server on the port held by the first: `PORT=64902 DATA_FILE=<tmp>/y.json npm start` and `node src/server.js` | exit `1`. stderr: `Startup failed: listen EADDRINUSE: address already in use 127.0.0.1:64902`. 0 stack-frame lines (`grep -c "    at "` = 0). The first server kept serving: `GET /students` returned `200`. |
| R7 | `HOST=127.0.0.1 PORT=64902 DATA_FILE=<tmp>/h.json npm start` | `Listening on http://127.0.0.1:64902`; `netstat`: `127.0.0.1:64902 LISTENING`; `GET /students` returned `[] [200]`. |
| R8 | `HOST=256.1.1.1 PORT=0 node src/server.js` (extra) | exit 1, `Startup failed: getaddrinfo ENOTFOUND 256.1.1.1`. The listen error handler covers non-EADDRINUSE errors too. |
| R9 | `POST /students` with an 11,041-byte body (name of 11,000 chars) via `curl --data-binary` | `HTTP/1.1 413 Payload Too Large`, `Connection: close`, body `{"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request body exceeds the 10 KB limit"}}`. Server log: `POST /students 413 PAYLOAD_TOO_LARGE`. |
| R10 | Same oversize body through a raw TCP socket (`node -e` with `net`) | Response head was `413 ... Connection: close`; the server then closed the connection (the client saw `ECONNRESET` and `close` because it was still writing). My script printed a `TIMEOUT` line after the close because its timer was not cleared; this is a script artifact, not a server hang, since the `close` event fired first. |
| R11 | Raw socket `POST /students` with `Content-Length: 200`, 12 bytes of body sent, socket destroyed after 200 ms | Client destroyed mid-body. Server did not log a request line and wrote nothing to stdout or stderr. Next `GET /students` returned `[] [200]` and the next `POST` returned `201` (id 2). |
| R12 | Three more raw-socket aborts (`PUT /students/2`, `Content-Length: 90`, with 0, 11 and about 40 body bytes) | All three aborted. Server stayed up, `GET /students` still returned the unchanged record (`200`). `grep -ci "unexpected\|stack\|at .*\.js"` on server stdout and stderr: `0` and `0`. Server stdout contained only the normal request lines. |
| R13 | `powershell -NoProfile -Command '$env:PORT=64902; $env:DATA_FILE="$env:TEMP\students.json"; npm start'` (the README PowerShell line with a known-free port instead of 8080) | `Listening on http://127.0.0.1:64902`. `POST /students` returned `201`. `%TEMP%\students.json` was created on first save with `{"nextId":2,"students":[{"id":1,...}]}`. The README syntax works as written. |
| R14 | Cleanup: stop servers (`taskkill`), delete temp dir and `%TEMP%\students.json`, `git status --short --ignored`, `find . -name '*.tmp'`, `ls -d data` | Servers stopped; `netstat` showed no listener on 64902 (only `TIME_WAIT`). `git status --short --ignored` listed only the five modified files (`README.md`, `docs/architecture.md`, `src/routes.js`, `src/server.js`, `tests/api.test.js`), with no `!!` ignored entries. No `.tmp` files, no `data/` directory. |

Note: the `npm notice run ...` lines in stderr come from npm 12 itself, not from the app. They appear before the app's own message.

### Result per fix

| Item | Result | Evidence |
|---|---|---|
| F-1 client abort mid-body | pass, fixed | R11, R12: aborted requests are dropped silently, no `Unexpected error` or stack on stdout/stderr, server keeps serving. Automated: `API: client abort mid-body (F-1)`. |
| F-2 bad PORT | pass, fixed | R4, R5: exit 1, one-line `Startup failed: ...`, no stack trace. Automated: invalid PORT test. |
| F-2 listen error (EADDRINUSE) | pass, fixed | R6, R8. Automated: EADDRINUSE test. |
| Regression of the 110 earlier tests | pass | R1: 113/113. R3: every README example still returns the documented status and body. |

Residual documentation nuance (minor, not a failure): the README PORT row says "anything else ... stops startup". An empty `PORT=` is treated as unset and uses 3000 (R5). This follows the `process.env.PORT || '3000'` logic and does not affect any acceptance criterion.

## Commands run (initial run)

| # | Command (verbatim) | Result |
|---|---|---|
| 1 | `node --version && npm --version` | `v26.13.1`, `12.2.3` (satisfies `engines.node >=26`) |
| 2 | `npm test` | `tests 110, suites 11, pass 110, fail 0, cancelled 0, skipped 0`, exit 0 (superseded by R1: 113/113) |
| 3 | `DATA_FILE=<tmp>/sub/students.json PORT=<free port> npm start` | `Listening on http://127.0.0.1:50844`. The data file and its `sub/` directory did not exist before the first save. |
| 4 | curl sequence against the running server (see below) | All responses matched the expected status, code and message |
| 5 | Stop the server, restart on the same data file, `curl /students` | Records 2 and 3 were reloaded: `[{"id":2,...Bob...},{"id":3,...Cy...}]` |
| 6 | `DATA_FILE=<tmp>/bad.json npm start` (file content `{bad`) | `Startup failed: Invalid data file: not valid JSON`, exit 1, file checksum unchanged |
| 7 | `git status --short --ignored`, `find . -name '*.tmp'` | Empty output: no `data/`, no `.tmp`, no changes (before the fix pass) |

The initial server was stopped via `taskkill` and no listener was left on the port. The temp directory was deleted.

## Acceptance criteria

Server evidence (S) comes from the live `npm start` runs (initial run, with the README flow re-run in R3). Test evidence (T) comes from the 113-test suite (`tests/api.test.js`, `studentService.test.js`, `studentRepository.test.js`, `validation.test.js`). The names of the passing tests cited are those printed by the runs.

| AC | Result | Evidence |
|---|---|---|
| AC-1 add, unique ID | pass | S: `POST /students` returned `201`, `Location: /students/1`, body `{"id":1,"name":"Ada Lovelace",...}`. The second add got id 2. T: service/API happy-path tests. Re-run R3: same. |
| AC-2 list | pass | S: `GET /students` on a fresh store returned `200 []`. After two adds it returned both records, ordered by id. |
| AC-3 get by ID | pass | S: `GET /students/1` returned `200` with the record (also R3). |
| AC-4 update | pass | S: `PUT /students/1` returned `200` with new name and course (also R3). A body with `"id":99` still returned `"id":1`. A later `GET` showed the stored change. |
| AC-5 delete | pass | S: `DELETE /students/1` returned `204`. `GET /students/1` then returned `404 NOT_FOUND` (also R3). A new add got id 3, so the id was not reused. The data file showed `nextId: 4`. |
| AC-6 required/blank | pass | S: missing name returned `422 VALIDATION_ERROR` with `fields:[{"field":"name","message":"is required"}]`. Blank name and course returned both fields. A `PUT` with email missing returned `email: is required`. The list afterwards was unchanged. |
| AC-7 malformed | pass | S: `email:"abc"` on `POST` (also R3) and `"nope"` on `PUT` both returned `422` naming `email`. |
| AC-8 duplicate email | pass | S: `POST` with `ADA@example.com` against `ada@example.com` returned `409 CONFLICT "Email already in use"` (also R3). `PUT /students/2` with `" Ada@Example.com "` returned `409`. `PUT /students/1` with its own email in a different case returned `200`. |
| AC-9 not found | pass | S: `GET`, `PUT` and `DELETE /students/999` each returned `404 NOT_FOUND "Student 999 not found"`. The `PUT` carried a valid body. T: API test of `PUT /students/999` with an invalid body returns 404 (check order). |
| AC-10 invalid ID | pass | S: `GET`, `PUT` and `DELETE /students/abc` returned `400 INVALID_ID` (GET also R3). `PUT /students` and `DELETE /students` returned `400 INVALID_ID "Student ID is required"`. `DELETE /students/0` returned `400`. T: `0`, `007`, `1e3`, `0x10`, `12abc`, `1%00`, `9007199254740993` are rejected and `%31` is accepted. |
| AC-11 message states cause, data unchanged | pass | S: every rejected request above returned a specific message and code. `GET /students` after all the failures was identical to the state before them. After the 413 and the client aborts (R9..R12) the store was also unchanged. T: `a failing writer propagates the error and leaves state unchanged (AC-11)`, and the API failed-save suite (500 `INTERNAL_ERROR`, store unchanged, `nextId` not consumed). |

## FR and NFR coverage

| Req | Result | Evidence |
|---|---|---|
| FR-1..FR-6 | pass | AC-1..AC-5 |
| FR-7, FR-8 | pass | AC-6, AC-7 |
| FR-9 | pass | AC-8 |
| FR-10 | pass | AC-9 |
| FR-11 | pass | AC-10 |
| NFR-1 | pass | Each error class returned a distinct `code` and a specific message. Extra codes were also seen: `INVALID_JSON` 400 for `{bad`, `UNSUPPORTED_MEDIA_TYPE` 415 for `text/plain`, `METHOD_NOT_ALLOWED` 405 for `PATCH /students`, `ROUTE_NOT_FOUND` 404 for `/other`, `PAYLOAD_TOO_LARGE` 413 (R9). |
| NFR-2 | pass | Live state check after the failed requests, the oversize body and the aborts. Unit and API tests for a failing writer. |
| NFR-3 | pass | The same field errors came back from `POST` and `PUT`. Test `add and update apply the same validation (NFR-3)` passed. |
| NFR-4 | pass | Zero runtime and dev dependencies. Six small source modules, and no features beyond the story. |
| NFR-5 | pass | 113 automated tests across all four layers, all passing (R1). |

## Edge cases beyond the AC

- Persistence: restart reloaded the same records, and the file was written atomically with no `.tmp` left behind (initial run; R14 again found no `.tmp`).
- Invalid data file: the server refuses to start with a clean one-line message, exit code 1, and the file is untouched (matches the README statement).
- The default bind is loopback only, shown by the `Listening on http://127.0.0.1:...` line. Explicit `HOST=127.0.0.1` gives the same bind (R7).
- Oversize body: live 413 with `Connection: close`, and the server closes the connection (R9, R10).
- Client abort mid-body: silent drop, server healthy afterwards (R11, R12).
- Invalid or busy port: clean exit 1 without a stack trace (R4..R6).

## README check

| Item | Result |
|---|---|
| Setup: "no install needed" | pass. Ran `npm test` and `npm start` with no `npm install`. |
| `npm start` and `PORT`/`DATA_FILE` | pass. Server listened on the chosen port, and the data file path (with a missing directory) was created on first save. |
| `PORT` validation text (integer 0-65535; busy port stops startup) | pass. R4..R6. Nuance: empty `PORT=` uses the default (see above). |
| `HOST` variable | pass for `HOST=127.0.0.1` (R7). `HOST=0.0.0.0` was not run: it would expose an unauthenticated listener on the network and is not needed for any criterion. |
| curl examples: add, list, get, update, delete | pass. Same commands and flags as the README, and the status codes match (`201` + `Location`, `200`, `200`, `200`, `204`). Re-run in R3. |
| Error examples: validation, conflict, not found, invalid ID | pass. Bodies are byte-identical to the README JSON (R3). |
| "Other codes" list | pass. 400, 404, 405, 415 and now 413 observed live. 500 `INTERNAL_ERROR` is covered by tests only. |
| PowerShell example | pass. The README line ran in Windows PowerShell and worked (R13), using a free port in place of 8080. |
| `data/` git-ignored | pass. `git status --ignored` was clean of `data/` after both runs, since `DATA_FILE` was always set. |

The earlier doc note that the POSIX example fails in PowerShell is resolved: the README now carries a PowerShell line.

## Failures

None.

## Known issues

| ID | Summary | Status |
|---|---|---|
| F-1 | Client abort mid-body logged as an unexpected 500 | Fixed. Live-verified (R11, R12) and covered by a new test. |
| F-2 | Bad `PORT` or listen error such as `EADDRINUSE` crashed with a raw stack | Fixed. Live-verified (R4..R8) and covered by two new tests. |
| F-3 | Email is trimmed before validation, so `a@b.c\n` is accepted | Accepted deviation, now documented in `docs/architecture.md` s10. Consistent with live behavior (`" Ada@Example.com "` was trimmed for the duplicate check). |
| F-4 | `createServer` signature differs from the original architecture text | Accepted deviation, now documented in `docs/architecture.md` s2, s7, s10. Not exercised by black-box checks; the tests use the injected `{filePath, writer, log, logError}` form. |
| F-5 | The repository does not enforce email uniqueness itself (the service does) | Open, accepted. Not reachable through the API. |
| F-6 | Small DRY lapses | Open, accepted. Code quality only. |
| F-7 | Test gaps | Partly addressed: abort and bad `PORT` / `EADDRINUSE` now have tests. Still open per code review: temp-file cleanup on a failed save and an unreadable data file. Not re-checked beyond the suite passing. |

## Not run

- `npm audit`: not run. There is no lockfile and there are no dependencies, so the command has nothing to audit (consistent with the code review's note).
- Failed save (500 `INTERNAL_ERROR`) live: not run. It needs a write failure that cannot be induced safely black-box; covered by the passing automated tests only.
- `HOST=0.0.0.0` bind: not run (see README check).
- The suite was not re-run a second time after the live checks, because no source or tests changed during verification.
