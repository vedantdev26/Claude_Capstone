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
