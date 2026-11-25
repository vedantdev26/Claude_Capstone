# Verification Report: Student Status (Amendment 2)

Branch `feature/student-status`, HEAD `2d7d984`. Node v26.13.1, Windows 11. Phase 7. All results below are from real runs in this session. Source, tests, scripts and other docs were not modified.

**Overall verdict: PASSED.** No critical, major or minor failures. Four harness expectation mismatches in my first ad-hoc run were my own wrong guesses at error-code names and are explained under "Observations".

## 1. Automated suites

| Command | Result |
|---|---|
| `npm test` | `tests 220`, `suites 25`, `pass 220`, `fail 0`, `cancelled 0`, `skipped 0`. 220 = 138 existing + 82 new, as expected. |
| `npm run test:browser` | `48/48 browser checks passed` (headless browser was available; 35 existing + 13 status checks, incl. legacy-record badge, toggle both ways, deleted-in-background alert, HTTP 500 alert). Last line: `PASS  no JavaScript exceptions, CSP violations or console errors`. |

Both suites ran once and were not repeated.

## 2. Live end-to-end (real HTTP)

Setup: `node src/server.js` with `PORT=45871 HOST=127.0.0.1 DATA_FILE=<temp dir>/e2e-students.json` (temp dir outside the repo). Server output: `Listening on http://127.0.0.1:45871`. Driver: a throwaway node script using `node:http` in the temp dir. After each request the SHA-256 of the data file was compared before and after.

Result: 66 requests exercised. All returned the expected HTTP status. Every failed request left the data file byte-identical ("file:unchanged"). 62 also matched my expected error code; the other 4 are explained below.

| Scenario | Actual status / body (excerpt) | Result |
|---|---|---|
| POST without status | 201 `{"id":1,"name":"Ann Lee","email":"ann@example.com","course":"Math","status":"Active"}` | pass |
| POST `status:"Inactive"` | 201 `...,"status":"Inactive"` | pass |
| POST `status:"Active"` | 201 `...,"status":"Active"` | pass |
| POST invalid status: `active`, `INACTIVE`, ` Active`, `""`, `null`, `1`, `Suspended` | each 422 `{"error":{"code":"VALIDATION_ERROR","message":"status: must be \"Active\" or \"Inactive\"","fields":[{"field":"status",...}]}}`; file unchanged | pass (7/7) |
| PATCH with the same 7 invalid values | each 422 naming `status`; file unchanged | pass (7/7) |
| PATCH `{}` | 422 `status: is required`; file unchanged | pass |
| PATCH `{"status":true}`, `{"status":["Active"]}` | 422 naming `status`; file unchanged | pass |
| PATCH id 1 to `Inactive` | 200, full student, `status:"Inactive"`, id/name/email/course unchanged | pass |
| GET /students/1 afterwards | 200 `status:"Inactive"` | pass |
| PATCH id 1 to `Active` | 200 `status:"Active"` | pass |
| PATCH to the status it already has (Active on Active, Inactive on Inactive) | 200, student returned, file unchanged | pass |
| PATCH body with extra `name` field | 200, name unchanged | pass |
| PATCH unknown id 9999 | 404 `{"error":{"code":"NOT_FOUND","message":"Student 9999 not found"}}` | pass |
| PATCH `/students/abc/status`, `/0/`, `/-1/`, `/1.5/` | 400 `INVALID_ID` "Student ID must be a positive integer" | pass |
| PATCH `/students//status` | 400 `INVALID_ID` "Student ID is required" | pass |
| Empty body, no body, `not json`, `[1]`, `"Active"`, `null`, `5` (Content-Type json) | each 400 `INVALID_JSON` | pass (7/7) |
| No Content-Type, `text/plain`, `application/x-www-form-urlencoded` | each 415 `UNSUPPORTED_MEDIA_TYPE` | pass |
| 20 KB body | 413 `PAYLOAD_TOO_LARGE` "Request body exceeds the 10 KB limit" | pass |
| `application/json; charset=utf-8` | 200 | pass |
| GET, POST, PUT, DELETE on `/students/1/status` | each 405 `METHOD_NOT_ALLOWED` | pass (4/4) |
| PATCH on `/students`, `/students/`, `/students/1`, `/students/status` | each 405 `METHOD_NOT_ALLOWED` | pass (4/4) |
| GET and PATCH `/students/1/x`; PATCH `/students/1/Status`; PATCH `/students/1/status/extra` | each 404 `ROUTE_NOT_FOUND` | pass (4/4) |
| PUT on Inactive student with body `status:"Active"` | 200, `status:"Inactive"`, new name/course stored | pass |
| PUT on Inactive student with body `status:"bogus"` | 200, `status:"Inactive"` (body status ignored, not validated) | pass |
| GET list | 200, all 3 entries carry `status` (Active, Inactive, Active) | pass |
| GET by id of an Inactive student | 200 with `status:"Inactive"` | pass |
| POST email `BOB@Example.com` vs Inactive student | 409 `{"error":{"code":"CONFLICT","message":"Email already in use"}}`; file unchanged | pass |
| PUT another student to the Inactive student's email | 409 `CONFLICT`; file unchanged | pass |
| PUT Inactive student keeping its own email | 200, still Inactive | pass |
| DELETE Inactive student | 204; subsequent GET 404 `NOT_FOUND`; PATCH on it 404 `NOT_FOUND` | pass |

Final data file (pretty-printed by the app): `nextId:4`, students 1 and 3, each with `"status":"Active"`. Server log lines show only `METHOD path status code` (for example `POST /students 422 VALIDATION_ERROR`), no bodies. The server was killed; `netstat` shows no listener on the test ports (one `TIME_WAIT` socket only). Temp directory deleted.

## 3. Legacy and invalid data files

Legacy file (old format, no `status`; temp file, `{"nextId":3,"students":[{id 1 ...},{id 2 ...}]}`):

| Check | Evidence | Result |
|---|---|---|
| Server starts | `Listening on http://127.0.0.1:45872` | pass |
| API returns Active | GET list: both records `"status":"Active"`; GET /2 `"status":"Active"` | pass |
| Bytes unchanged by loading, reads, a failed PATCH (422) and a duplicate POST (409) | SHA-256 equal; file still contains no `status` | pass |
| First successful write adds status | PATCH /1 to Inactive -> 200; file changed; file now has `"status":"Inactive"` for id 1 and `"status":"Active"` for id 2 (every record) | pass |
| GET list after | id 1 Inactive, id 2 Active | pass |

Invalid present status: for each of `"bogus"`, `"active"`, `null`, `1`, `""` the process exited 1 with stdout empty and stderr `Startup failed: Invalid data file: record 1 failed validation`. The file was untouched (hash equal) in all 5 cases. The message names the record, not the field, and does not echo file contents. This matches architecture s12 ("same as any other bad field") and is consistent with the existing startup behaviour. **Pass.**

`data/students.json` (git-ignored, `!! data/`): md5 `28e9ced0f52e9169b9fcf6ff84628476` before the first run and after all runs. Unchanged. (The browser check and tests use their own temp files.)

## 4. Requirements trace

| Id | Result | Evidence |
|---|---|---|
| FR-19 status exactly Active/Inactive, case-sensitive | pass | Sec. 2: `active`, `INACTIVE`, ` Active` rejected; `Active`/`Inactive` accepted. |
| FR-20 default Active; POST accepts optional status | pass | POST with no status -> Active; with Inactive -> stored and returned. |
| FR-21 record without status is Active | pass | Sec. 3 legacy file: list and get return Active; browser check "legacy record ... shows badge Active". |
| FR-22 invalid status rejected, names `status` | pass | 7 values x POST and PATCH -> 422 with `fields[0].field = "status"`; file unchanged. |
| FR-23 PATCH status, status required, same-status OK | pass | Both directions, same-status 200, `{}` -> 422, other fields unchanged. |
| FR-24 PATCH not-found / invalid ID | pass | 9999 -> 404 NOT_FOUND; abc, 0, -1, 1.5, empty -> 400 INVALID_ID. |
| FR-25 PUT keeps status, ignores body status | pass | PUT with `Active` and `bogus` in body -> status stays Inactive. |
| FR-26 status in every returned student | pass | list, get, create, update, patch all showed `status`. |
| FR-27 Inactive stays visible, editable, deletable, counts for uniqueness | pass | Listed, got, PUT 200, DELETE 204; dup email POST and PUT -> 409. |
| FR-28 dashboard badge per row | pass | Browser checks: Status column; badges for both statuses; legacy shows Active (48/48). |
| FR-29 per-row toggle via PATCH with messages | pass | Browser checks: success message, flip, reverse, 500 alert, deleted-in-background alert (48/48). |
| AC-18 | pass | Sec. 2 POST rows. |
| AC-19 | pass | Sec. 3 legacy file; after a change the new status is returned. |
| AC-20 | pass | 7-value table on POST and PATCH; nothing stored (hash unchanged). |
| AC-21 | pass | PATCH both ways, later GET shows value, other fields unchanged, same-status succeeds. |
| AC-22 | pass | Missing `status` (`{}`) -> 422 naming status; empty body and non-JSON -> 400 INVALID_JSON; no change. Note: AC-22 allows "status (or the body)". |
| AC-23 | pass | Unknown -> 404; missing/empty/non-numeric ID -> 400; hash unchanged. |
| AC-24 | pass | PUT on Inactive student stores new details and keeps Inactive. |
| AC-25 | pass | All five operations return `status`. |
| AC-26 | pass | Dup email (any case) POST and PUT -> 409; Inactive student listed, viewed, deleted. |
| AC-27 | pass | Browser checks (badges, legacy Active). |
| AC-28 | pass | Browser checks (toggle flips badge/label, message; failures show alert, row unchanged). |
| AC-29 / NFR-7 | pass | `npm test` 220/220; the code review verified 28 changed lines in existing tests only add `status`. I did not re-diff the tests independently. XSS-as-text check passed in the browser suite (`XSS: markup is rendered as text`). NFR-1/NFR-2 verified in Sec. 2 (named error causes, file unchanged on every failure). |
| FR-1..FR-18 regression | pass | Covered by the green suites (138 pre-existing tests plus 35 pre-existing browser checks, all passing) and the live dup/404/validation checks above. |

## 5. Hygiene and docs

- `git status --short`: only ` M workflow/workflow-state.json` (the Orchestrator's own phase-7 state change `pending` -> `in_progress`; not mine) plus this report once written. No untracked files other than the report. `data/` is ignored. Temp files and directory removed; server stopped.
- `package.json` is unchanged (`git diff` empty): no dependencies, no new dependency fields, scripts `start`, `test`, `test:browser` only.
- Secrets: grep of `src`, `public`, `scripts`, `tests` and `package.json` for secret/password/token/api key found only fake sentinel strings in `tests/api.test.js` (they assert that bodies and query strings are not logged or echoed). No real secrets.
- `docs/code-review-student-status.md`: "No critical or major findings. No open findings". CR-1 and CR-2 (both minor) are RESOLVED. Verdict APPROVE.
- README spot check against observed responses: PATCH example output (`{"id":1,...,"status":"Inactive"}`), the 422 status body (character-for-character equal to the observed body), 409 `CONFLICT`, 404 `NOT_FOUND`, 400 `INVALID_ID`, the 405 list (GET/POST/PUT/DELETE on the status path; PATCH on `/students`, `/students/`, `/students/{id}`, `/students/status`), the 404 `ROUTE_NOT_FOUND` for `/students/1/x` and `/students/1/Status`, "a `status` in the PUT body is ignored", and the legacy-record statement all match observed behaviour. The README check order (INVALID_ID, 415, 413, INVALID_JSON, 404, 422) is consistent with the observed results but I did not probe every ordering combination live (covered by the 220-test suite).
- Not run: `npm start` on the default port 3000 (avoided to prevent colliding with a user's server; the same entry file `src/server.js` was run with `PORT`/`HOST`/`DATA_FILE` set). Windows-only run; no other OS or browser than the one used by the browser check.

## Observations (non-blocking)

1. My first live run reported 4 "FAIL" lines (`PATCH unknown id`, `POST dup email`, `PUT dup email`, `PATCH deleted student`). In each, the HTTP status was correct (404 / 409 / 409 / 404) and the file was unchanged. The mismatch was only my script expecting the made-up codes `STUDENT_NOT_FOUND` and `DUPLICATE_EMAIL`. The app returns `NOT_FOUND` and `CONFLICT`, which is what `src/errors.js`, the README, and the pre-existing behaviour specify. This is not a product defect; the tables above use the real codes.
2. Startup failure on a bad status names the record (`record 1 failed validation`), not the field. Intentional per architecture.

## Failures

None.
