# Code Review: Student Management

Scope: `src/` (errors, validation, studentRepository, studentService, routes, server) and `tests/` (4 files) against `docs/requirements.md`, `docs/architecture.md`, `docs/design-review.md` (DR-1..DR-15) and `docs/impl-plan.md`. Read-only review; no source or tests were changed. `npm test`: 110 tests, 110 pass, 0 fail (Node 26.13.1). Working tree clean apart from `workflow/workflow-state.json`; no `data/` directory left behind.

## Verdicts

| Area | Result | Notes |
|---|---|---|
| Correctness vs FR/AC | pass | FR-1..FR-11 and AC-1..AC-11 are implemented and tested. Routing rule, ID rule, check order (incl. 404 before 422 on update), build-then-swap persistence and load rules match the architecture. DR-1..DR-14 are implemented. See F-3 and F-4 for two small spec drifts. |
| Security | pass | No injection surface (Map storage, no queries). Explicit field picks plus `Object.hasOwn` defeat `__proto__`/`constructor` keys. Email regex is linear and length-capped first. Streaming 10 KB limit with `Connection: close`, 415 gate, no CORS, loopback bind, generic 500, fixed messages for `INVALID_JSON`/`ROUTE_NOT_FOUND`/`PAYLOAD_TOO_LARGE`. Logs hold method, path, status and code only (verified by test). No secrets. |
| Error handling | issues (minor) | Duplicates, invalid/missing ID, not found, empty data and failed save are all handled and NFR-2 holds. Remaining gaps are operational: F-1 (client abort logged as 500) and F-2 (bad `PORT` / listen error crashes with a stack trace). |
| Code quality/clarity | pass | Small, readable modules, single error mapper, no dead code. |
| Maintainability and DRY | issues (minor) | Small duplications only (F-5, F-6). |
| Dependency safety | pass (audit not run) | Zero runtime and zero dev dependencies; no lockfile. `npm audit` fails with `ENOLOCK` and has nothing to audit. Runtime pinned by `engines.node >=26`. |
| Test coverage | pass (minor gaps) | Happy path and every error row in architecture s4 covered at API level, plus unit tests per layer. Gaps: F-7. |

## Findings

No critical or major findings.

| ID | Severity | File:line | Issue | Suggested fix |
|---|---|---|---|---|
| F-1 | minor | `src/routes.js:53,110-124` | A client that disconnects mid-body makes `readBody` reject with a non-`AppError` ("aborted"). The handler treats it as an unexpected failure: logs `Unexpected error` with a stack trace via `logError` and tries to send a 500 to a dead socket. Reproduced with a raw socket that sends a partial body and then closes. No data is affected (nothing reaches the service), but it creates false 500 and error-log noise. | In `readBody`, reject with a dedicated marker (or check `req.aborted` / `res.destroyed` in the catch) and skip both `sendJson` and `logError`, or log one short line without a stack. |
| F-2 | minor | `src/server.js:16,27-30` | `Number(process.env.PORT)` is not validated: `PORT=abc` throws an uncaught `RangeError [ERR_SOCKET_BAD_PORT]` stack at `listen`. A listen failure such as `EADDRINUSE` has no `'error'` handler and also dies with a raw stack. Startup failure for a bad data file is handled cleanly (non-zero exit, no file contents), so this is inconsistent. | Validate `PORT` (integer 0-65535) and add `server.on('error', ...)` that logs `Startup failed: <message>` and exits non-zero, mirroring the existing data-file branch. |
| F-3 | minor | `src/validation.js:14`, `docs/architecture.md` s7 | Architecture s7 lists `a@b.c\n` as a rejected email. `readText` trims before the regex runs, so it is accepted and stored as `a@b.c` (verified over HTTP). Trimming is consistent with the data model ("trimmed") and `tests/validation.test.js:22` asserts it, but the test list uses `a@b.c\nx` and `a@b\n.c` instead, so the spec case is silently not tested as written. Behavior is safe; the spec and implementation disagree. | Do not change code. Amend architecture s7 to say surrounding whitespace is trimmed, so `a@b.c\n` is accepted as `a@b.c` and only interior whitespace is rejected. Or record it as an accepted deviation at the approval gate. |
| F-4 | minor | `src/server.js:9` | Architecture s2/s7 and T-15 specify `createServer({filePath, host, port})`. The implementation takes `{filePath, writer, log, logError}` and `host`/`port` are read only under `require.main === module`. The shape is better for testing, but the contract differs from the approved text. | Update architecture s2/s7 to the real signature (preferred), or accept `host`/`port` and return a listening server. |
| F-5 | minor | `src/studentRepository.js:134-146` | `create` and `update` do not enforce email uniqueness. The invariant lives only in the service (`assertEmailFree`). If another caller skips the service, `indexOf` silently overwrites an index entry, and the file would then fail the load rule at next startup (duplicate emails). Not reachable today. | Cheap guard: in `commit`, throw if `emailIndex` size differs from `students` size after rebuild. Or document that the repository trusts the service. |
| F-6 | minor | `src/routes.js:73,106`; `src/studentRepository.js:75,85`; `src/studentService.js:36-38` | Small DRY lapses. `req.url.split('?')[0]` is computed twice. `loadFile` uses `data.email.toLowerCase()` while `emailKey` exists for the same purpose, so two places define the uniqueness key. `remove` does `requireStudent` then `repository.remove`, so it looks up twice. | Extract `pathOf(req)`. Move `emailKey` above `loadFile` and use it there. Let `remove` rely on the boolean returned by `repository.remove` and throw `NotFoundError` when it is false. |
| F-7 | minor | `tests/studentRepository.test.js:164-173`; `tests/api.test.js` | Test gaps. (a) The failed-save test makes `students.json.tmp` a directory and removes it itself, so the writer's temp-file cleanup in `createFileWriter` (`studentRepository.js:24-29`) is never actually observed. (b) No test for client abort mid-body (F-1). (c) No test for a data file that exists but cannot be read (for example a directory), which hits the `cannot read file` branch at `studentRepository.js:44`. (d) No test for `PORT`/listen failure (F-2). | (a) Force the failure after the temp write, for example make the target path a directory so `renameSync` fails, then assert `.tmp` is gone. (b)-(d) Add one short test each when F-1 and F-2 are fixed. |

## Notes (no action needed)
- Windows `renameSync` over an existing file can raise `EPERM`/`EBUSY` (DR-14). The code surfaces it as 500 with state unchanged, which is the approved behavior; no retry is needed at this scope.
- Each mutation copies the whole map and rewrites the file (O(n)). Fine for the stated single-user scale; revisit only if scope grows.
- Errors carry HTTP status (DR-15 kept as is by the architecture); acceptable.

## Overall verdict
**APPROVE with minor notes.** There are no critical or major findings. All requirements, acceptance criteria and DR items are met, the 110 tests pass, and the design is small and secure for its scope. F-1 and F-2 are worth fixing before the PR as cheap hardening. F-3 and F-4 are documentation drift for the human to accept or amend. F-5 to F-7 are optional.
