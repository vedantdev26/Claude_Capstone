# Implementation Plan: Student Management

Based on `docs/requirements.md`, `docs/architecture.md` (revised, approved; s = section) and `docs/design-review.md` (DR-n). Stack: Node.js, CommonJS, zero runtime dependencies, `node:test`. Scope is limited to the approved architecture; no extra features.

Conventions: priority P1 = required for the core story, P2 = hardening/docs required by the approved architecture. Each task is one commit-sized unit and is verified by its acceptance criteria. All tasks start as `todo`. Test files run with `node --test tests/`.

## Tasks

| T-n | Title | Depends on | Priority | Covers | Acceptance criteria | Status |
|---|---|---|---|---|---|---|
| T-1 | Scaffold: `package.json`, folders, `.gitignore` | - | P1 | NFR-4, NFR-5, DR-4 | `package.json` has `"start": "node src/server.js"`, `"test": "node --test tests/"` and no dependencies. `src/` and `tests/` exist. `.gitignore` gains a `data/` entry (existing entries kept). `npm test` runs without a config error. | todo |
| T-2 | `src/errors.js`: typed errors | T-1 | P1 | NFR-1, FR-7..FR-11 | Exports `ValidationError` (carries `fields[]`), `InvalidIdError`, `NotFoundError`, `ConflictError`, plus `InvalidJsonError`, `PayloadTooLargeError`, `UnsupportedMediaTypeError`, `RouteNotFoundError`, `MethodNotAllowedError`. Each carries `code` and HTTP status per the s4 error table (400/404/409/413/415/422/405). Messages for `INVALID_JSON`, `ROUTE_NOT_FOUND`, `PAYLOAD_TOO_LARGE` are fixed strings. Errors are instances of `Error`; a quick `node -e` require shows no side effects. | todo |
| T-3 | `src/validation.js`: student input validator | T-2 | P1 | FR-7, FR-8, NFR-3, NFR-1 | `validateStudent(input)` returns a fresh object built by explicit picks of exactly `name`, `email`, `course` (trimmed), or throws `ValidationError` with one `fields` entry per offending field. Rules per s3: name/course required, string, 1-100 chars; email required, `length <= 254` checked first, then regex `^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$`. Non-object input and non-string values are rejected. Never merges or spreads input (DR-11). Same function serves add and update. | todo |
| T-4 | `src/validation.js`: ID validator | T-2 | P1 | FR-11, NFR-1 | `parseId(segment)` decodes the segment once, requires `^[1-9]\d*$`, then `Number(seg) <= Number.MAX_SAFE_INTEGER`, and returns the integer. Otherwise throws `InvalidIdError` (message names the problem; no `parseInt`/`Number` used for the validity decision). Missing/empty/undefined segment throws `InvalidIdError`. Malformed percent-encoding does not crash (treated as invalid ID). | todo |
| T-5 | Unit tests: `tests/validation.test.js` | T-3, T-4 | P1 | FR-7, FR-8, FR-11, NFR-3, NFR-5 | Tests pass for: required/blank/non-string name, email, course (AC-6); length limits (100 and 254); email rejected: `abc`, `a@b`, `a@.com`, `a@b.`, `a@@b.c`, `a b@c.d`, `a@b.c\n`, a 255-char email; accepted: `a@b.co`; all-field error collection in one pass; trimming; result contains only the 3 picked keys; `__proto__` and `constructor` keys in input have no effect and `Object.prototype` is unchanged. ID: `0`, `007`, `1e3`, `0x10`, `12abc`, `-1`, `1.5`, ` 5 `, empty, `1%00`, `9007199254740993` rejected; `1`, `%31` accepted. | todo |
| T-6 | `src/studentRepository.js`: in-memory store with injectable writer | T-3 | P1 | FR-1..FR-6, FR-2, FR-9, NFR-2 | Factory accepts `{filePath?, writer?}`; with no `filePath` it is pure in-memory. Holds records and a lowercased-email index in `Map`s plus `nextId` (starts at 1). Operations: `list()` (ordered by id, copies returned), `get(id)`, `findByEmail(email)` (trim + lowercase), `create(data)`, `update(id, data)`, `remove(id)`. Every mutation is synchronous build-then-swap: build new state, call writer with `{nextId, students}`, then swap in memory. If the writer throws, memory and `nextId` are unchanged and the error propagates. IDs are never reused after delete. | todo |
| T-7 | Repository: default atomic writer | T-6 | P1 | NFR-2, DR-2, DR-14 | Default writer: `mkdirSync(dir, {recursive:true})`, `writeFileSync` to `students.json.tmp` in the same directory, then `renameSync` over the target; temp file removed on error (best effort) and the error rethrown. Output format `{ "nextId": n, "students": [...] }`. No fsync. Verified by a throwaway run that creates a record and the file appears with expected content, without leaving a `.tmp` file. | todo |
| T-8 | Repository: data-file load rules | T-6, T-7 | P1 | FR-2, NFR-2, DR-2 | On construction with `filePath`: missing file -> empty, `nextId` 1, file not created until first save; present and valid -> loaded into the `Map`s; present and invalid -> throws a clear startup error (no file contents in the message) and leaves the file untouched. Invalid = unparseable JSON, not an object, `nextId` not a safe positive integer, any record failing the validator or with invalid/duplicate `id`, duplicate emails (case-insensitive). After a valid load `nextId = max(nextId, maxId + 1)`. | todo |
| T-9 | Repository tests: `tests/studentRepository.test.js` | T-8 | P1 | FR-2, FR-9, NFR-2, NFR-5 | Tests pass (temp dir per test, cleaned up) for: in-memory CRUD and ordering; email lookup case-insensitive; ID not reused after delete; failing injected writer leaves state and `nextId` unchanged on create, update and delete; atomic write leaves no `.tmp` file; missing file -> empty; missing `data/` dir created on first save; malformed JSON, wrong shape, bad `nextId`, invalid record, duplicate ids, duplicate emails (different case) -> startup throws and file bytes unchanged; `nextId <= maxId` corrected to `maxId + 1`; persisted file reloads to the same state. | todo |
| T-10 | `src/studentService.js`: business rules | T-3, T-6 | P1 | FR-1..FR-6, FR-9, FR-10, NFR-2, NFR-3 | `create`, `list`, `get`, `update`, `remove` over the repository. Update order: find (`NotFoundError`) -> validate (`ValidationError`) -> duplicate check excluding own id (`ConflictError`, message names `email`, does not reveal other student data) -> persist. Add: validate -> duplicate -> persist. Delete: find -> persist. Same validator for add and update. Each call is fully synchronous (no `await`). Repository/writer errors propagate untyped. Messages specific, e.g. `Student 7 not found`, `Email already in use`. | todo |
| T-11 | Service tests: `tests/studentService.test.js` | T-10 | P1 | FR-1..FR-6, FR-9, FR-10, NFR-2, NFR-3, NFR-5 | Tests pass with an in-memory repository: create returns unique increasing ids (AC-1); list empty and N records (AC-2); get (AC-3); update keeps id and changes fields (AC-4); delete then get -> not found (AC-5); duplicate email on add and on update, any case and surrounding whitespace, updating with own email allowed (AC-8); not found for get/update/delete (AC-9); update of missing id with invalid body -> `NotFoundError`; validation failure stores nothing (AC-6, AC-7); ID not reused after delete; failing writer -> error and state unchanged (AC-11). | todo |
| T-12 | `src/routes.js`: routing rule and dispatch | T-4, T-10 | P1 | FR-1, FR-3..FR-6, FR-11, NFR-1 | Request handler strips the query string, matches `^/students(?:/([^/]*))?/?$`. No/empty ID: `GET` list, `POST` add, `PUT`/`DELETE` -> `INVALID_ID`, other methods -> 405. One ID: `GET`/`PUT`/`DELETE` act on parsed ID, others (incl. `POST`) -> 405. Deeper or non-matching path -> `ROUTE_NOT_FOUND`. Success responses: `201` + student + `Location: /students/{id}`; `200` list ordered by id; `200` get; `200` update; `204` no body on delete. Response `Content-Type: application/json`; no CORS headers. | todo |
| T-13 | Routes: request body handling | T-12 | P1 | FR-1, FR-5, FR-7, NFR-1, DR-9, DR-10 | Applies the s4 check order: route/method, ID, content type (`POST`/`PUT` need `application/json`, params such as `charset` allowed, else 415), body size, JSON object (else `INVALID_JSON`), then service. Body bytes are counted while streaming (covers chunked); on > 10 KB stop reading, respond 413 `PAYLOAD_TOO_LARGE` with `Connection: close`, destroy the request. Bodies on `GET`/`DELETE` are ignored and not buffered. Unknown body fields (incl. `id`) never change the ID. | todo |
| T-14 | Routes: error mapper and logging | T-12 | P1 | NFR-1, NFR-2, DR-12 | Single catch converts typed errors to `{ "error": { code, message, fields? } }` with the status from the error; `fields` only for `VALIDATION_ERROR`. Untyped errors -> `500 INTERNAL_ERROR` with a generic message, no stack or internals in the response; detail logged server-side only. Log line has only method, path without query, status and error code; never bodies or student data. `SyntaxError.message` is never passed through. | todo |
| T-15 | `src/server.js`: `createServer` and bootstrap | T-8, T-13, T-14 | P1 | NFR-4, NFR-5, DR-5, DR-13, DR-4 | Exports `createServer({filePath, host, port})`, wiring repository -> service -> routes and returning the `http.Server` (not listening until `listen`). `listen` is called only under `require.main === module`, using `PORT` (default 3000), `HOST` (default `127.0.0.1`), optional `DATA_FILE` (default `data/students.json`). Invalid data file -> logs the cause (not file contents) and exits non-zero. `headersTimeout`/`requestTimeout` left at Node defaults or set explicitly. `npm start` then `curl` of `GET /students` returns `200 []`. | todo |
| T-16 | API tests: harness, happy path and routing | T-15 | P1 | FR-1..FR-6, FR-11, NFR-5 | `tests/api.test.js` starts `createServer` on port 0, host `127.0.0.1`, temp data file, closes after each suite. Passing tests: add `201` with `Location` and id (AC-1); list `[]` and N items (AC-2); get; update keeps id and ignores body `id`; delete `204` then get `404` (AC-3..AC-5). Routing: `PUT /students`, `DELETE /students`, `PUT /students/` -> 400 `INVALID_ID`; `GET /students/` equals list; query string ignored; `/students/1/x` and `/other` -> 404 `ROUTE_NOT_FOUND`; `POST /students/1` -> 405; `PATCH /students` -> 405. IDs over HTTP: `0`, `007`, `1e3`, `0x10`, `12abc`, `1%00`, `9007199254740993` -> 400 `INVALID_ID`; `%31` valid. | todo |
| T-17 | API tests: error rows, check order and NFR-2 | T-16 | P1 | FR-7..FR-10, NFR-1, NFR-2, NFR-3 | Each s4 error row has an API-level test asserting status, `code`, a specific message and `Content-Type: application/json`: 422 `VALIDATION_ERROR` with `fields` naming the field (missing, blank, bad email) on POST and PUT (AC-6, AC-7); 400 `INVALID_JSON` (bad JSON and non-object body); 404 `NOT_FOUND`; 409 `CONFLICT` on add and on update, any case, own email allowed (AC-8); 415 for `text/plain` POST/PUT; 413 with `Connection: close` for oversize via `Content-Length` and via chunked; body on `GET`/`DELETE` ignored. Check order: `PUT /students/999` with an invalid body -> 404; invalid ID with bad body -> 400. A `__proto__`/`constructor` body has no effect on stored records or the prototype. | todo |
| T-18 | API tests: failed save, data file, bind and log hygiene | T-16 | P1 | NFR-1, NFR-2, DR-2, DR-5, DR-12 | Tests pass for: injected failing writer on POST/PUT/DELETE -> 500 `INTERNAL_ERROR` with generic message, store unchanged, `nextId` not consumed (next successful add gets the expected id) (AC-11); startup with malformed/invalid data file fails and file is untouched; `nextId <= maxId` corrected; missing `data/` dir created on first save; default bind address is `127.0.0.1`; captured logs and error bodies contain no request body or query string. | todo |
| T-19 | README | T-15 | P2 | NFR-4, NFR-5 | `README.md` states: requirements (Node version), setup (no dependencies; `npm install` not needed), run (`npm start`, `PORT`, `HOST`, `DATA_FILE`, loopback default), test (`npm test`), and `curl` examples for add, list, get, update, delete plus one example error response each for validation, conflict, not found, invalid ID. Notes that `data/` is git-ignored. All commands copy-paste runnable. | todo |
| T-20 | Final check: full suite and clean tree | T-5, T-9, T-11, T-17, T-18, T-19 | P1 | NFR-5, DR-4 | `npm test` passes with 0 failures. A matrix check confirms each FR-1..FR-11 and NFR-1..NFR-5 has at least one passing test or documented check. After running the server and tests, no `data/` or `.tmp` file is left tracked or untracked-visible (`data/` ignored). Any gap is reported, not hidden. | todo |

## Requirement coverage

| Req | Tasks |
|---|---|
| FR-1 | T-6, T-10, T-12, T-13, T-16 |
| FR-2 | T-6, T-8, T-9, T-10, T-16 |
| FR-3 | T-6, T-10, T-12, T-16 |
| FR-4 | T-6, T-10, T-12, T-16 |
| FR-5 | T-6, T-10, T-12, T-13, T-16 |
| FR-6 | T-6, T-10, T-12, T-16 |
| FR-7 | T-2, T-3, T-5, T-13, T-17 |
| FR-8 | T-3, T-5, T-17 |
| FR-9 | T-6, T-10, T-11, T-17 |
| FR-10 | T-2, T-10, T-11, T-17 |
| FR-11 | T-4, T-5, T-12, T-16 |
| NFR-1 | T-2, T-3, T-4, T-12, T-13, T-14, T-17, T-18 |
| NFR-2 | T-6, T-7, T-8, T-9, T-10, T-11, T-14, T-17, T-18 |
| NFR-3 | T-3, T-5, T-10, T-11, T-17 |
| NFR-4 | T-1, T-15, T-19 |
| NFR-5 | T-1, T-5, T-9, T-11, T-15, T-16, T-19, T-20 |

Design-review items: DR-1 (T-12, T-16), DR-2 (T-8, T-9, T-18), DR-3 (T-6, T-10), DR-4 (T-1, T-20), DR-5 (T-15, T-18), DR-6 (T-3, T-5), DR-7 (T-10, T-13, T-17), DR-8 (T-4, T-5), DR-9 (T-13, T-17), DR-10 (T-13, T-17), DR-11 (T-3, T-5, T-17), DR-12 (T-14, T-18), DR-13 (T-6, T-15), DR-14 (T-7, T-9), DR-15 (T-2, T-12, kept as in the architecture).

## Blocked tasks

No external blockers and no open questions. Tasks are blocked only by their dependencies:

| Task | Blocked by |
|---|---|
| T-2, T-3, T-4 | T-1 / T-2 (T-3, T-4 need the error types) |
| T-6 | T-3 (repository uses the validator for load checks) |
| T-7, T-8 | T-6 (T-8 also T-7) |
| T-10 | T-3, T-6 |
| T-12 | T-4, T-10 |
| T-13, T-14 | T-12 |
| T-15 | T-8, T-13, T-14 |
| T-16..T-19 | T-15 |
| T-20 | all test tasks and the README (T-5, T-9, T-11, T-17, T-18, T-19) |

## Execution order

Topological order (tasks in the same step can be done in any order):
1. T-1
2. T-2
3. T-3, T-4
4. T-5, T-6
5. T-7
6. T-8
7. T-9, T-10
8. T-11, T-12
9. T-13, T-14
10. T-15
11. T-16, T-19
12. T-17, T-18
13. T-20

Suggested single-thread sequence: T-1, T-2, T-3, T-4, T-5, T-6, T-7, T-8, T-9, T-10, T-11, T-12, T-13, T-14, T-15, T-16, T-17, T-18, T-19, T-20.

Commit after each task (local, on `feature/student-management`, once the phase is approved).

---

## Amendment 3: student status

Based on `docs/requirements.md` Amendment 2 (FR-19..FR-29, AC-18..AC-29, NFR-7), `docs/architecture.md` s12 (Amendment 3) and `docs/design-review.md` "Amendment 3 review" (DR-16..DR-23). T-1..T-20 above are unchanged (implemented and merged earlier; their Status cells are left as written). Same stack and conventions: Node.js, CommonJS, zero dependencies, `node:test`; no new files in `src/`, no new dependencies, no status filter or any status-dependent behavior (out of scope). Branch: `feature/student-status`. Each task is one commit-sized unit; all start as `todo`.

Planning decisions:
- The suite must stay green at every commit. Once the repository carries `status` (S-3), every existing exact-shape assertion in the repository, service, API and frontend tests fails at once, so the minimal `status: "Active"` assertion edits (NFR-7/AC-29, s12.6) land in the same commit as S-3, not in a later task. They are the only edits allowed to existing tests.
- DR-16, DR-17, DR-18, DR-20 and DR-22 are doc-only and already folded into `docs/architecture.md`; their test consequences (DR-17 405/400 cases, DR-18 PATCH body cases) are in S-8/S-9. DR-19, DR-21 and DR-23 are carried into task acceptance criteria below.
- Tasks S-1..S-9 touch `src/` and `tests/` only; S-10..S-12 touch `public/` and `tests/frontend.test.js`; S-13 touches `scripts/browser-check.js` only.

### Tasks

| S-n | Title | Depends on | Priority | Covers | Acceptance criteria | Status |
|---|---|---|---|---|---|---|
| S-1 | `src/validation.js`: status rules | - | P1 | FR-19, FR-20, FR-22, NFR-3 | Exports `STATUSES = ['Active','Inactive']` and `DEFAULT_STATUS = 'Active'`. Private `checkStatus(value)` uses strict equality against `STATUSES` (no trim, case folding or coercion) and returns `null` or the fixed message `must be "Active" or "Inactive"` (never echoes input). `validateStudent(input, { acceptStatus = false } = {})`: default option returns exactly `{name,email,course}` as before and ignores any `status` in the body (never rejects it); with `acceptStatus: true`, when `status` is an own key it runs `checkStatus` in the same single pass after `course` (error order `name, email, course, status`) and returns `status`, or `DEFAULT_STATUS` when the key is absent. Absence/presence uses `Object.hasOwn`, never `in` or a property read. New `validateStatusChange(input)`: requires own `status` (`{field:'status', message:'is required'}`), then `checkStatus`; throws `ValidationError` with exactly one `status` entry, else returns the status string. Returns the picked values only; never merges or spreads input (DR-11). Existing `tests/validation.test.js` still passes unmodified. | done |
| S-2 | Validation tests for status | S-1 | P1 | FR-19, FR-20, FR-22, NFR-3, AC-20, NFR-7 | Additive tests in `tests/validation.test.js`, none of the existing ones edited: via `validateStatusChange` and `validateStudent(..., {acceptStatus:true})`, each of `active`, `INACTIVE`, ` Active`, `Active `, `Active\n`, `""`, `null`, `1`, `true`, `[]`, `{}`, `Suspended` is rejected with a `status` field entry and the fixed message (no input echoed); `Active` and `Inactive` accepted; missing status: `validateStatusChange` -> `status` `is required`, `acceptStatus` -> `Active`. Default option ignores a bad `status` and returns exactly the keys `name, email, course` in that order. Multi-field case: errors collected in one pass in order `name, email, course, status`. Own-key check: `__proto__`/inherited `status` has no effect and `Object.prototype` is unchanged. Same rejected set for POST-mode and PATCH-mode (one `checkStatus`). | done |
| S-3 | `src/studentRepository.js`: status support, plus minimal exact-shape test edits | S-1 | P1 | FR-19, FR-21, FR-25, FR-26, FR-27, NFR-2, NFR-7, AC-29 | Loader validates each record with `validateStudent(raw, { acceptStatus: true })` and keeps the returned `status`: an absent own `status` becomes `Active` in memory; a present invalid one (`null`, `""`, `"active"`, `1`) fails startup with the existing `Invalid data file: record N failed validation` style message and leaves the file untouched. Loading never writes. `create(data)` builds `{id,name,email,course,status: data.status ?? DEFAULT_STATUS}`. `update(id,data)` builds `{id,name,email,course,status: existing.status}` (preserves status). New `setStatus(id, status)`: unknown id -> `undefined`; else `commit(new Map(students).set(id,{...existing,status}), nextId)` and returns a copy, so the existing synchronous build -> write -> swap and atomic temp-file rename apply; email index not read from status. Key order `id, name, email, course, status`. In the same commit, existing exact-shape assertions are minimally edited per s12.6 and nothing else: add `status: 'Active'` at the assertion (not in the shared `ada`/`bob` fixtures) in `tests/api.test.js` (`{id:1,...ada}`/`{id:2,...bob}` get/list/query/update/after-failure/restart checks, `Object.keys(created.json)` and `Object.keys(updated.json)` gain `'status'` last, the literal `{id:1,name:'Eve',...}` list check), `tests/studentService.test.js` (`{id:1,...ada}`, `{id:1,...bob}`, `{id:2,...bob}`), `tests/studentRepository.test.js` (`repo.get/update/create` equality, writer `calls` capture, saved-file equality; hand-written legacy records without `status` stay unchanged), `tests/frontend.test.js` (client CRUD `created`/`updated` literals and exact-shape API comparisons). `git diff` of the four files shows only added `status` lines and no removed or weakened assertion; `tests/validation.test.js` untouched; `npm test` shows 0 failures and the same 138 existing tests still present. | done |
| S-4 | Repository status tests (incl. DR-19 load/save) | S-3 | P1 | FR-19, FR-21, FR-25, FR-27, NFR-2, AC-19, AC-24, AC-26, DR-19 | Additive tests in `tests/studentRepository.test.js` (temp dir per test, cleaned up): legacy file with no `status` loads every record as `Active` and the file bytes are unchanged after load; mixed legacy/explicit file; present invalid status (`null`, `"x"`, `""`, `"active"`, `1`) fails startup and file bytes unchanged. DR-19: a file with explicit `Inactive` loads as `Inactive`, and after an unrelated successful save the re-read file still has `Inactive` for that record (proves the loader passes `acceptStatus` and never resets to `Active`); every record from `repo.list()` after load has an own `status` property. `create` without status -> `Active`, with `Inactive` -> `Inactive` kept; `update` preserves `Inactive`; `setStatus` persists, survives reload, same-status call still saves; unknown id -> `undefined`; failing injected writer on `setStatus` leaves memory, file and `nextId` unchanged and propagates the error; email lookup still finds an `Inactive` record (FR-27). | done |
| S-5 | `src/studentService.js`: create with status and `setStatus` | S-3 | P1 | FR-20, FR-22, FR-23, FR-24, FR-25, FR-27, NFR-1, NFR-2, NFR-3 | `create(input)` validates with `{ acceptStatus: true }` and passes the validated `status` to `repository.create`; duplicate-email check unchanged and independent of status. `update` is unchanged (default option; status in body ignored, stored status preserved by the repository). New `setStatus(id, input)`: `requireStudent(id)` (`NotFoundError`) -> `validateStatusChange(input)` (`ValidationError`) -> `repository.setStatus(id, status)` -> returns the updated copy; fully synchronous (no `await`); no duplicate-email check; setting the current status succeeds through the same path (no no-op shortcut). Writer errors propagate untyped. | done |
| S-6 | Service status tests (incl. DR-19 create) | S-5 | P1 | FR-20, FR-22, FR-23, FR-24, FR-25, FR-27, NFR-2, AC-18, AC-20..AC-26, DR-19 | Additive tests in `tests/studentService.test.js` with an in-memory repository: `create` default -> `Active`; explicit `Active`; explicit `Inactive` is stored and returned as `Inactive`, never reset to `Active` (DR-19); invalid value (AC-20 table) -> `ValidationError` with a `status` field, nothing stored. `setStatus`: both directions return the full updated student with name/email/course/id unchanged and a later `get` agrees; same-status succeeds; unknown id with a bad status -> `NotFoundError` (404 before 422); missing/garbage status on an existing student -> `ValidationError` naming `status`, data unchanged; failing writer -> error, state unchanged. `update` with body `status` valid and garbage is ignored and `Inactive` is preserved (AC-24). An `Inactive` student still blocks a duplicate email on create and on update (any case) and is still listed, got and deleted (AC-26). | done |
| S-7 | `src/routes.js`: status path | S-5 | P1 | FR-22..FR-24, FR-26, NFR-1, NFR-2 | `ROUTE_RE` becomes `^/students(?:/([^/]*)(?:/(status))?)?/?$`. The status branch is tested after the static-asset check and before the collection/`segment === ''` branch. Status path (group 2 = `status`, including empty ID and optional trailing slash): any method other than `PATCH` -> `405 METHOD_NOT_ALLOWED`; `PATCH` order: `parseId` (400 `INVALID_ID`, empty segment -> "Student ID is required"; `%31` accepted) -> content type `application/json` else 415 -> body read with the 10 KB limit (413, `Connection: close`) -> JSON object else 400 `INVALID_JSON` (empty, invalid JSON, non-object) -> `service.setStatus` (404 before 422) -> `200` + student. Method check precedes ID validation. Unchanged: `PATCH /students`, `/students/status`, `/students//` and `/students/{id}` -> 405; `/students/1/x`, `/students/1/Status`, `/students/1/status/x`, `/students/1//` -> 404 `ROUTE_NOT_FOUND`; query string ignored. 415 rule now covers POST/PUT/PATCH. Only `status` is read from the PATCH body; unknown fields ignored. Logging unchanged (no body). Error mapper, `errors.js`, `server.js`, `staticFiles.js` untouched. | done |
| S-8 | API tests: PATCH behavior and status in all responses | S-7 | P1 | FR-19..FR-26, FR-27, NFR-1, NFR-2, NFR-3, AC-18..AC-22, AC-24..AC-26, DR-18, DR-19 | Additive tests in `tests/api.test.js` (real server, temp file). POST: no status -> 201 `Active`; `Inactive` stored and returned as `Inactive` and a later GET shows `Inactive` (DR-19); AC-20 value table -> 422 `VALIDATION_ERROR` with a `status` field, store unchanged; multi-field error lists `status` with the others. PATCH: `Inactive` then `Active` return the full student, a later GET agrees, name/email/course/id unchanged (AC-21); same-status -> 200; `{}` on an existing student -> 422 naming `status`; each AC-20 value -> 422, data unchanged; empty body, invalid JSON and array body, sent with `Content-Type: application/json` -> 400 `INVALID_JSON`; the same empty body with no content type -> 415 (DR-18b); `text/plain` -> 415; body over 10 KB -> 413; unknown id with `{"status":"nope"}` -> 404 `NOT_FOUND` while an invalid-JSON/empty/array body on an unknown id -> 400 `INVALID_JSON` (DR-18a); extra body fields `name`, `email`, `id` change nothing (DR-18c). PUT with body `status` (valid or garbage) is ignored and `Inactive` preserved (AC-24). `status` is present in list, get, create, update and PATCH responses (AC-25). `Inactive` student still blocks duplicate email on POST and PUT with 409 and still appears in list, get and delete (AC-26). Failing injected writer on PATCH -> 500 `INTERNAL_ERROR` with generic message, state and `nextId` unchanged. | done |
| S-9 | API tests: routing, ID edges, legacy data and log hygiene | S-7 | P1 | FR-21, FR-23, FR-24, NFR-1, NFR-2, AC-19, AC-22, AC-23, DR-17 | Additive tests in `tests/api.test.js`: `PATCH /students//status` -> 400 `INVALID_ID`; ids `abc`, `0`, `007`, `1e3`, `0x10`, `12abc`, `1%00`, `9007199254740993` on `/students/{id}/status` -> 400 `INVALID_ID`, `%31` valid; unknown id -> 404 (AC-23), data unchanged. DR-17 readings are pinned: `PATCH /students` -> 405, `PATCH /students/status` -> 405, `PATCH /students//` -> 405, `PATCH /students/1` -> 405. `GET`/`POST`/`PUT`/`DELETE` on `/students/1/status` -> 405 (including an invalid id such as `/students/abc/status`, method check first). `/students/1/Status`, `/students/1/status/x`, `/students/1//` -> 404 `ROUTE_NOT_FOUND`. Trailing slash and a query string on the status path accepted. A server started on a legacy data file (records without `status`) lists and gets every record as `Active`, and the file bytes are unchanged until the first successful save (AC-19, FR-21); an invalid present status in the file makes startup fail. Captured logs and error bodies for PATCH contain no request body. | done |
| S-10 | `public/app.js`: `createApi.setStatus` and its tests | S-7 | P1 | FR-23, FR-29, NFR-6, NFR-7 | `call(method, id, body, suffix)` builds `${base}/${id}/${suffix}` when `suffix` is given; adds `setStatus: (id, status) => call('PATCH', id, { status }, 'status')`; same `ApiError` mapping; the module export list is unchanged (`ApiError`, `createApi`, `filterStudents`). Additive tests in `tests/frontend.test.js` against a real server: `setStatus` success returns the updated student, unknown id -> `ApiError` code `NOT_FOUND`, bad status -> `ApiError` code `VALIDATION_ERROR` with `fields` naming `status`. Existing frontend tests still pass. | todo |
| S-11 | Dashboard: Status column and badge | S-10 | P1 | FR-26, FR-28, NFR-6, NFR-7, AC-27 | `index.html` table header gains `Status` between Course and Actions. `render` adds a cell with `<span class="badge badge-active|badge-inactive">`; label and class come from the fixed mapping `student.status === 'Inactive' ? 'Inactive' : 'Active'` (a record without status shows `Active`), set via `textContent`; no server text, no inline style/handler/script, no `innerHTML`, so the CSP is unchanged. `styles.css` defines `.badge`, `.badge-active`, `.badge-inactive` (label carries the meaning, not color alone); empty-state `colspan` matches the new column count. Additive contract tests in `tests/frontend.test.js`: `index.html` has the Status header, `styles.css` defines both badge classes, `app.js` still has no `innerHTML`/`eval`; CSP header test unchanged. Search still matches name/email/course only; no status filter. | todo |
| S-12 | Dashboard: per-row status toggle | S-11 | P1 | FR-29, NFR-1, NFR-2, NFR-6, AC-28, DR-21 | Third action button per row with `data-action="toggle"`, label `Mark Inactive` when Active and `Mark Active` when Inactive, `aria-label` including the student name set via `setAttribute`. The delegated click handler becomes an explicit three-way branch (edit / delete / toggle); toggle runs through `guarded(...)` so the existing `busy` guard covers it. `toggleStatus(student)`: calls `clearMessage()` first (as `save` and `removeStudent`); sends the explicit opposite target through `api.setStatus`; on success shows `<updated.name> is now <updated.status>.` using the server response, not the stale row (DR-21), as a `role=status` message, then `load()`; on `NOT_FOUND` shows `<err.message>. It may have been deleted.`, resets the edit form if that student was being edited, and `load()`; on any other `ApiError` shows `err.message` with no reload (row unchanged); on a non-`ApiError` shows `Unexpected error. Please try again.`. Add/edit form has no status input and edit does not send status. No inline handlers/styles; no `innerHTML`. Contract test in `tests/frontend.test.js` that `app.js` contains the `toggle` action and `setStatus` call and the Node-side checks still pass. | todo |
| S-13 | `scripts/browser-check.js`: status section (DR-21, DR-23) | S-12 | P2 | FR-21, FR-28, FR-29, AC-19, AC-27, AC-28, DR-21, DR-23 | New section after the existing edit/delete steps using the script's existing helpers and temp data file. Checks: a seeded legacy record (no `status` key in the file) shows badge `Active`; badges render for both statuses; the toggle flips the badge and the button label and shows the success message; a second toggle reverses; DR-21: after the page has loaded, rename the student through the API in the background, then toggle, and assert the success message uses the new name from the server response; a row whose student was deleted via the API in the background shows a readable error on toggle and disappears after the reload (AC-28); a previous error banner is cleared when a toggle starts. DR-23: no in-flight/busy-guard click case, and no duplicate `textContent`/CSP checks (those stay covered by the existing browser checks and the `frontend.test.js` contract tests). Existing 35 checks unchanged; the script still exits 3 ("SKIPPED") when no browser is installed; if no browser is available here, report it as not run, never as passed. | todo |
| S-14 | README: status | S-8, S-12 | P2 | FR-19..FR-29, NFR-4, NFR-7 | `README.md` documents the `status` field (`Active`/`Inactive`, case-sensitive, default `Active`, optional on `POST`, ignored on `PUT`), `PATCH /students/{id}/status` with copy-paste `curl` examples (set Inactive, set Active) and one `422` and one `404` example response, that existing records without `status` read as `Active`, the dashboard badge and toggle, that status has no effect on list, update, delete or email uniqueness, that there is no status filter, and (DR-20) a one-line note to back up `data/students.json` before rolling back to pre-status code. Existing content is edited in place and stays accurate (test count, endpoint table). | todo |
| S-15 | `docs/CHANGELOG.md`: status entry | S-12 | P2 | FR-19..FR-29, NFR-7 | A new `Unreleased` entry at the top for student status: Added (status field and default, `PATCH /students/{id}/status`, badge and toggle, N new tests), Changed (every student response now includes `status`; `PUT` preserves it; legacy records read as `Active`; first save after upgrade rewrites the data file with `status`). Counts match the real `npm test` output; earlier entries untouched. | todo |
| S-16 | Final check: full suite and clean tree | S-2, S-4, S-6, S-8, S-9, S-10, S-11, S-13, S-14, S-15 | P1 | NFR-7, AC-29, NFR-5, all FR-19..FR-29 | `npm test` passes with 0 failures; the 138 pre-existing tests are all still present and the only edits to existing tests are the added `status` lines (`git diff` of `tests/` shows no removed or weakened assertion; `tests/validation.test.js` has additions only). A matrix check confirms every FR-19..FR-29, AC-18..AC-29 and NFR-7 has at least one passing test or a documented check (AC-27/AC-28 via S-13 or reported as not run). `npm run test:browser` is run if a browser exists, else reported as SKIPPED. After running the server and tests, no `data/` or `.tmp` file is left tracked or visibly untracked. DR-19, DR-21 and DR-23 acceptance items are confirmed done. Any gap is reported, not hidden. | todo |

### Requirement coverage (Amendment 3)

| Req | Tasks |
|---|---|
| FR-19 | S-1, S-2, S-3, S-4, S-8 |
| FR-20 | S-1, S-2, S-5, S-6, S-8 |
| FR-21 | S-3, S-4, S-9, S-13 |
| FR-22 | S-1, S-2, S-5, S-6, S-7, S-8 |
| FR-23 | S-5, S-6, S-7, S-8, S-9, S-10 |
| FR-24 | S-5, S-6, S-7, S-8, S-9 |
| FR-25 | S-3, S-4, S-5, S-6, S-8 |
| FR-26 | S-3, S-7, S-8, S-11 |
| FR-27 | S-3, S-4, S-5, S-6, S-8 |
| FR-28 | S-11, S-13 |
| FR-29 | S-10, S-12, S-13 |
| NFR-7 | S-2, S-3, S-11, S-12, S-14, S-15, S-16 |
| AC-18 | S-6, S-8 |
| AC-19 | S-4, S-9, S-13 |
| AC-20 | S-2, S-6, S-8 |
| AC-21 | S-6, S-8 |
| AC-22 | S-8, S-9 |
| AC-23 | S-8, S-9 |
| AC-24 | S-4, S-6, S-8 |
| AC-25 | S-8, S-11 |
| AC-26 | S-4, S-6, S-8 |
| AC-27 | S-11, S-13 |
| AC-28 | S-12, S-13 |
| AC-29 | S-3, S-16 |

NFR-1, NFR-2, NFR-3 stay covered as in the baseline plan; Amendment 3 additions: NFR-1 (S-5, S-7, S-8, S-9, S-12), NFR-2 (S-3, S-4, S-5, S-6, S-7, S-8, S-9), NFR-3 (S-1, S-2, S-5, S-8).

Design-review items: DR-16 (doc-only, done in architecture; s4 415 rule applied in S-7), DR-17 (S-7, S-9), DR-18 (S-8), DR-19 (S-4, S-6, S-8), DR-20 (doc-only; README note in S-14), DR-21 (S-12, S-13), DR-22 (doc-only; behavior pinned in S-7, S-8), DR-23 (S-13).

### Blocked tasks

No external blockers and no open questions. Tasks are blocked only by their dependencies:

| Task | Blocked by |
|---|---|
| S-1 | none (requires T-1..T-20 in place) |
| S-2, S-3 | S-1 |
| S-4, S-5 | S-3 |
| S-6 | S-5 |
| S-7 | S-5 |
| S-8, S-9 | S-7 |
| S-10 | S-7 (needs the real PATCH endpoint) |
| S-11 | S-10 |
| S-12 | S-11 |
| S-13 | S-12 |
| S-14 | S-8, S-12 |
| S-15 | S-12 |
| S-16 | all test tasks and docs (S-2, S-4, S-6, S-8, S-9, S-10, S-11, S-13, S-14, S-15) |

Note: S-3 is intentionally not split from its test-assertion edits; a repository-only commit would leave the suite red.

### Execution order (Amendment 3)

Topological order (tasks in the same step can be done in any order):
1. S-1
2. S-2, S-3
3. S-4, S-5
4. S-6, S-7
5. S-8, S-9, S-10
6. S-11
7. S-12
8. S-13, S-14, S-15
9. S-16

Suggested single-thread sequence: S-1, S-2, S-3, S-4, S-5, S-6, S-7, S-8, S-9, S-10, S-11, S-12, S-13, S-14, S-15, S-16.

Commit after each task (local, on `feature/student-status`, once the phase is approved). Do not push or open a PR without explicit user OK.
