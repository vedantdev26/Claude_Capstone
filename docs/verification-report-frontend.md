# Verification Report: Frontend iteration (branch feature/frontend)

Date: 2026-11-25. Environment: Windows 11, Node (engines >=26), Chrome 158 (`C:\Program Files\Google\Chrome`). The earlier backend report is `docs/verification-report.md` (unchanged).

Round 1 verified HEAD 97afa1e. Round 2 verified HEAD 6c6d857 ("Fix race in browser check: wait for the busy guard to release before each action"), which changes only `scripts/browser-check.js`. Round 3 verified HEAD f6fcdac ("Browser check: navigate via about:blank, longer waits, richer failure detail"), which also changes only `scripts/browser-check.js`.

## Overall verdict (after Round 3): PASSED

- No critical or product defects. `npm test` 138/138. The unmodified committed `npm run test:browser` at HEAD f6fcdac passed 35/35 with exit 0 in all 18 of 18 runs (8 with a parallel `npm test`, 4 with a continuous `npm test` loop for the whole run, 6 idle). Details in Round 3.
- Round 1's deterministic busy-guard race stays fixed. Round 2's intermittent `reload: data persists on the server` failure (2 of 16 runs) did not recur in 18 runs, 12 of them under load. Finding R2-1 is closed as "not reproduced after the fix", not as "root cause proven" (see Round 3 section 2).
- The Round 2 verdict ("PASSED, with one non-critical finding: intermittent failure of one browser check, 14 of 16 runs") is superseded by this one. The Round 2 and Round 1 sections below are kept as recorded.

## Round 3 (HEAD f6fcdac)

### 1. Review of the script diff (`git show HEAD`)
Only `scripts/browser-check.js` changed (+14/-3). Read in full:
- `open(url)` now navigates to `about:blank`, polls until `location.href === 'about:blank'` and `readyState === 'complete'`, then navigates to the target and polls until `location.href === url` and `readyState === 'complete'` (`settleOn`: up to 300 x 50 ms = 15 s, throws a clear error on timeout), then injects the helpers. Before, `open()` polled only `readyState === 'complete'` right after `Page.navigate`.
- Is this a real script race? Plausibly yes. For a same-URL navigation (the reload check calls `open(APP)` while already on APP), `Page.navigate` can return before the old document is swapped out. The old document is still `complete`, so the poll could succeed at once and inject `window.T` into the document about to be discarded. The new page then has no helpers, or the wait ran against the old DOM. The earlier failure value `[]` is consistent with that. Going through `about:blank` and requiring the exact `location.href` removes the ambiguity. I did not observe the old failure in this round, so I cannot prove this was the cause. The change is sound on its own merits.
- Default `waitFor` ceiling 3 s -> 15 s. This only gives slow operations more time. `waitFor` still returns `false` on timeout rather than throwing. In the script it is used as a precondition, or as an expression that must become true (for example the "empty state shown" check). It is never used to assert that something stays false, so a longer ceiling cannot turn a failing check into a pass. It does lengthen the time to fail in a real defect case.
- The reload check's failure detail now evaluates rows, `#message` text, `#result-count` text, `readyState` and a fresh `fetch('/students')`. The pass condition (`JSON.stringify(rows.map(r => r[0])) === '["1","2","4"]'`) is unchanged. The detail is evaluated on every run, and a throw there is caught by `.catch(e => String(e))`, so it cannot fail or pass the check.
- Assertions: no `check(...)` was added or removed, and no pass condition was edited. `grep -o "check('"` gives 35 at HEAD~1 and 35 at HEAD. None became trivially true.
- Residual (minor, not applied): `settleOn` needs `location.href === href` exactly, so a server-side redirect or URL normalisation would time out. `APP` is used as is and all runs passed. `idle()` and the precondition `waitFor` calls still do not throw on timeout.

### 2. `npm run test:browser`, run unmodified, 18 runs in total
Chrome was found each time (no SKIPPED). Every run exited 0 and printed `35/35 browser checks passed`. A search for `FAIL` and `ERROR` lines in all 18 logs found none. Each run took 14-25 s.

| Group | Runs | Condition | Result per run | Exit |
|---|---|---|---|---|
| A | 8 | `npm test` started in parallel with each run. It lasted about 9 s of the 15 s run, and the reload check is near the end, so overlap at that point was partial. | 35/35 each | 0 each |
| B | 4 | A continuous `npm test` loop for the whole duration of each run | 35/35 each | 0 each |
| C | 6 | Nothing else running | 35/35 each | 0 each |

Totals: 18 passed, 0 failed. Each parallel `npm test` in group A also exited 0.

What this does and does not prove: 18 of 18 including 12 loaded runs is consistent with the fix. R2-1 occurred in 2 of 16 runs earlier, so if the failure rate had stayed at about 12 percent, 18 clean runs would have a probability of about 0.88^18, around 10 percent. That is suggestive, not proof. I did not run the old script (HEAD~1) in this round, so I did not reproduce the failure on the old code. I cannot say whether the about:blank change or the 15 s ceiling removed it. The failure rate on slower machines or in CI is not measured.

### 3. `npm test`
Fresh run, nothing else running: `tests 138, suites 16, pass 138, fail 0, cancelled 0, skipped 0`, exit 0 (duration 9.5 s; the machine was slower than in Round 1). The first parallel `npm test` from group A showed the same 138/138 counts, and all 8 exited 0.

### 4. Repo state
`git status --short` shows only this report as untracked, and `git diff --stat` is empty. No source, test, `public/` or `scripts/` files were modified. Temp logs are in `/tmp`. I started no servers in this round (the check script starts and stops its own).

## Round 2 (HEAD 6c6d857)

### 1. Review of the script diff (`git show HEAD`)
Only `scripts/browser-check.js` changed (+15/-11). Read in full:
- Added `idle()` = `T.waitFor(() => !T.$("submit-button").disabled)` and `act(code)` = `await idle(); await ev(code)`. `add()` now runs through `act()` and calls `idle()` again after the message appears.
- 13 `ev(...)` click/fill calls were swapped for `act(...)` (empty submit, malformed-email submit, edit click, edit save, edit-cancel, duplicate-email edit, cancel-edit, delete click, confirm-cancel, confirm-delete). The code string in each is unchanged.
- No assertion line was touched. No `check(...)` was added, removed or edited. `grep -o "check('"` gives 35 in HEAD~1 and 35 in HEAD. Each `check()` still compares against concrete values (row id lists, exact text, `aria-invalid`, focus ids, computed style, overflow). None became trivially true.
- Observation (not a weakening): `T.waitFor` returns `false` on timeout instead of throwing. So `idle()` timing out would be silent, and the later `check()` would then catch the problem. In practice the fix did what it says: Round 1's 5 failures did not recur.

### 2. `npm run test:browser`, run unmodified, 16 runs in total
Chrome was found each time (no SKIPPED). Runs 1-3 are the required fresh runs. Runs 4-16 were extra, added after seeing a failure.

| Run | Result | Exit | Note |
|---|---|---|---|
| 1 | 35/35 browser checks passed | 0 | `npm test` was running in parallel (my mistake) |
| 2 | 35/35 | 0 | same |
| 3 | 34/35, `FAIL  reload: data persists on the server  ::  []` | 1 | same |
| 4 | 34/35, `FAIL  reload: data persists on the server  ::  []` | 1 | same |
| 5-10 | 35/35 each | 0 | nothing else running |
| 11-16 | 35/35 each | 0 | nothing else running |

Totals: 14 passed (35/35, exit 0), 2 failed (34/35, exit 1). No `BROWSER CHECK ERROR`, no crash, and no repeat of the 5 Round 1 failures.

Verbatim failing line (runs 3 and 4):
```
FAIL  reload: data persists on the server  ::  []
34/35 browser checks passed
```
All 26 earlier checks (including add, duplicate, search, edit, delete, XSS) passed in those runs. The 3 mobile checks and the console-health check that follow also passed.

Finding R2-1 (minor, intermittent): `scripts/browser-check.js:171-173` calls `open(APP)` (navigate, poll `document.readyState === 'complete'`, inject helpers) and then `T.waitFor(() => T.rows().length === 3)` with the default 3000 ms limit. The `[]` shows that the table was still empty when the wait gave up (`waitFor` returns false silently). Likely causes are slow page load or fetch under CPU load, or `readyState` still describing the old document right after `Page.navigate`. I did not isolate which. Evidence for load sensitivity: both failures came in two consecutive runs while `npm test` was running at the same time, and `npm test` itself took 6.7-7.0 s instead of 1.7 s in Round 1, so the machine was slower. I did not reproduce the failure on an idle machine in 12 tries, so the cause stays unconfirmed. Suggested hardening (for the owner, not applied): wait for a longer limit or for `#total-count` to equal 3 after `open()`. I did not modify the script.

### 3. `npm test`
First run (in parallel with browser runs 1-4): `tests 138, suites 16, pass 138, fail 0, cancelled 0, skipped 0`. A second run alone, after all browser runs: `tests 138, pass 138, fail 0` (duration 6.7 s).

### 4. HTTP re-check, `PORT=3458`, temp `DATA_FILE` (port 3000 still held by foreign node.exe PID 11456, per netstat, not touched)
- Server printed `Listening on http://127.0.0.1:3458`.
- `GET /`: 200, `text/html; charset=utf-8`, `Content-Length: 3716`, `<title>Student Management</title>`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-cache`, CSP `default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`.
- `POST /students`: 201, `Location: /students/1`, body `{"id":1,"name":"Zed",...}`. `GET /students`: list with the record. `GET /students/1`: 200. `PUT /students/1`: 200, name "Zed2", same id.
- `POST` with email `Z@X.io` (existing `z@x.io`): 409 `CONFLICT`.
- `DELETE /students/1`: 204. Then `GET /students/1`: 404 `NOT_FOUND`. `GET /students/abc`: 400 `INVALID_ID`.
- Cleanup: killed only my server (PID 22248). Afterwards 3000 was still listening on 11456. Temp directory and temp files deleted. `git status --short` shows only the untracked report.

## Round 1 (FAILED: race in the check script), HEAD 97afa1e

Verdict at that time: FAILED (no critical product defect; 1 major defect in the committed browser check). Real numbers:

| # | Command | Result |
|---|---|---|
| 1 | `npm test` | `tests 138, suites 16, pass 138, fail 0, cancelled 0, skipped 0` (duration 1.7 s) |
| 2 | `npm run test:browser` (3 runs) | Each run: 18 PASS, 5 FAIL, then `BROWSER CHECK ERROR ... TypeError: Cannot read properties of null (reading 'click')`, EXIT=2. 12 of 35 checks never ran (delete, XSS, persistence, mobile, console health). |
| 3 | Diagnostic only: temp copy of the script with one added wait in `add` | `35/35`, EXIT=0 (repo file untouched) |
| 4 | `PORT=3457 DATA_FILE=<temp> npm start`, curl checks, restart, invalid `PORT` | All as expected (details below) |
| 5 | Own headless-Chrome script (temp, outside repo) against 3457 | See below |

Failing lines in Round 1, verbatim:
```
FAIL  list shows 3 rows ordered by id  ::
FAIL  duplicate email: conflict shown on the email field and in an alert, focus moves to email  ::
FAIL  search by course matches several  ::
FAIL  search result count text  ::
FAIL  clearing search restores all rows  ::
BROWSER CHECK ERROR: {... "TypeError: Cannot read properties of null (reading 'click')" ...}   EXIT=2
```
Root cause: `add()` clicked submit and waited for `#message`. The app shows the message before `await load()`, and `guarded()` keeps `busy = true` and `#submit-button` disabled until `load()` returns, so the next `add()` clicked a disabled button. The busy guard is intended behavior (review F-3/F-4). The fix is the Round 2 `idle()`/`act()` change. Status: fixed in HEAD 6c6d857, confirmed by Round 2.

### HTTP checks (Round 1, server on 127.0.0.1:3457, temp DATA_FILE)

| Check | Observed |
|---|---|
| `GET /` | 200, `Content-Type: text/html; charset=utf-8`, `<title>Student Management</title>` |
| `GET /styles.css`, `GET /app.js` | 200, `text/css; charset=utf-8`, `text/javascript; charset=utf-8` |
| Security headers (all three assets) | `X-Content-Type-Options: nosniff`; CSP `default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` (exact); `Cache-Control: no-cache` |
| `HEAD /` | 200, same headers, `Content-Length: 3716`, no body |
| `POST /`, `DELETE /app.js` | 405 JSON `METHOD_NOT_ALLOWED` (no asset headers) |
| `/index.html`, `/app.js/x`, `/../package.json` (--path-as-is), `/%2e%2e/package.json`, `/src/server.js`, `/other` | each 404 JSON `ROUTE_NOT_FOUND` |
| `POST /students` valid | 201, `Location: /students/1`, body with id |
| `GET /students`, `GET /students/1` | 200 |
| `PUT /students/1` | 200, same id |
| `DELETE /students/2` | 204; a following GET gives 404 |
| `POST` blank name, bad email, missing course | 422 `VALIDATION_ERROR` with `fields` array |
| `POST` email `ADA@Example.com` (existing `ada@example.com`) | 409 `CONFLICT` "Email already in use" |
| `GET/PUT/DELETE /students/999` | 404 `NOT_FOUND` |
| `GET /students/abc`, `/students/0`, `DELETE /students/-1`, `DELETE /students`, `PUT /students` | 400 `INVALID_ID` |
| `POST` body `{bad` | 400 `INVALID_JSON` |
| `POST` `Content-Type: text/plain` | 415 `UNSUPPORTED_MEDIA_TYPE` |
| `POST` 2 MB JSON body | 413 `PAYLOAD_TOO_LARGE`, `Connection: close` |
| `PATCH /students`, `POST /students/1` | 405 |
| Persistence | After stop and restart on the same file the records were intact. A new `POST` got id 3, so the deleted id 2 was not reused. |
| Invalid `PORT` | `abc`, `70000`, `-1`: exit 1 with `Startup failed: PORT must be an integer from 0 to 65535`. `PORT=""` falls back to 3000 and exited 1 with `EADDRINUSE` (foreign server). |

Own real-browser check on 3457 (temp DevTools script, Chrome 158 headless): title `Student Management`; 2 persisted rows rendered; UI add showed `Student added.` and 3 rows; `GET /students` then contained the new record (id 4); no uncaught exceptions, no CSP violations, no `console.error`. One network-level console error: `GET /favicon.ico` 404 (cosmetic; the committed check filters network-source errors).

## Requirement and acceptance mapping (final, after Round 3)

"Committed" = unmodified `npm run test:browser`. Round 3, HEAD f6fcdac: 35/35 in 18 of 18 runs. The evidence wording below was recorded in Round 2 (HEAD 6c6d857, 14 of 16 runs, the 2 failures only on the reload check). Round 3 re-ran the same 35 checks and every one passed in every run; `npm test` 138/138 again.

| ID | Result | Executed evidence |
|---|---|---|
| FR-12 / AC-12 | PASS | HTTP tables (assets, headers, `/other` 404 `ROUTE_NOT_FOUND`); `tests/frontend.test.js` in `npm test` (138/138); committed PASS "dashboard loads", "stylesheet applied", "unknown path is still JSON ROUTE_NOT_FOUND". |
| FR-13 | PASS | Committed PASS "empty state shown with 0 students", "add: row shows id and data", "add: form is reset and counter is 1", "list shows 3 rows ordered by id". |
| FR-14 / AC-13 | PASS | Committed PASS "add: success message", "add: row shows id and data"; HTTP `POST` 201 and `GET`. |
| FR-15 / AC-15 | PASS | Committed PASS: edit form pre-filled, saved with same id and "Student updated.", cancel discards, duplicate email on edit rejected with data unchanged. |
| FR-16 / AC-16 | PASS | Committed PASS: "delete: confirmation dialog opens naming the student", "dialog is described by its text and Cancel is focused first", "cancel keeps the student", "confirm removes the student and shows a message" (focus to search). API `DELETE` 204/404 via curl. Now backed by the unmodified committed script (Round 1 could not reach it). |
| FR-17 / AC-17 | PASS | Committed PASS: search by name, by email (case-insensitive), by course, result count text, no-match message, clearing restores all rows. `filterStudents` unit tests pass in `npm test`. |
| FR-18 / AC-14 | PASS | Committed PASS: empty submit shows a field error under each field and focuses the first, error alert with table unchanged, `aria-invalid`, malformed email only on the email field, duplicate email on add (conflict on the email field and in an alert, focus to email) and on edit. 409 and 422 shapes verified via curl. |
| NFR-6 | PASS | `package.json` has no dependencies; CSP header verified exactly; API unchanged (curl tables, `tests/api.test.js`). Committed PASS: "XSS: markup is rendered as text, nothing injected or executed", "mobile: table rows become stacked cards", "mobile: no horizontal overflow", "mobile: layout is a single column", "no JavaScript exceptions, CSP violations or console errors". Persistence on reload: committed PASS in 18 of 18 runs in Round 3 (14 of 16 in Round 2; see R2-1). |

## Known issues (accepted, from `docs/code-review-frontend.md` Disposition)
- F-5(d): a 404 on edit still clears what the admin typed.
- F-7(a): focus after a successful save is not moved explicitly.
- `/favicon.ico` returns 404 JSON, which shows as a console network error in browsers. Cosmetic, not a requirement failure.
- R2-1 (Round 2): `test:browser` "reload: data persists on the server" failed intermittently (2 of 16 runs, both under load from my parallel `npm test`). Round 3: not reproduced in 18 runs at HEAD f6fcdac (12 under load). Treated as fixed by the about:blank change, but the cause was never isolated and the old script was not re-run.

## Not run / unverified
- Browsers other than Chrome 158 (Edge, Firefox, Safari), touch devices, real mobile devices. The mobile layout was emulated at 390 px in Chrome only.
- Screen-reader behavior (live regions, focus announcements): not run.
- `npm audit`: not run (no lockfile; zero dependencies).
- README setup/run instructions were not re-read in either round. The commands `npm start`, `npm test` and `npm run test:browser` ran as documented in `package.json`.
- Port 3000: not tested, because a foreign process (node.exe PID 11456) holds it. Ports 3457 (Round 1) and 3458 (Round 2) were used.
- Root cause of R2-1, and whether the old script (HEAD~1) still fails on this machine: not determined, because the old script was not re-run in Round 3. A failure rate below about 1 in 18 cannot be excluded, including on slower machines or CI.
- README setup/run instructions: still not re-read in Round 3. No HTTP/API re-check in Round 3 (only `scripts/browser-check.js` changed since Round 2; the Round 1 and 2 HTTP results were not repeated at HEAD f6fcdac, though the browser check exercises the API through the page and passed).

## Cleanup
Only my own server processes were stopped (Round 1: PIDs 3192 and 11220; Round 2: PID 22248; Round 3: none started by me). The foreign node PID 11456 on port 3000 was left running. Temp dirs and Chrome profiles were removed. `git status --short` shows only this report as untracked. `data/` is ignored and pre-dates this session. No source, test, `public/` or `scripts/` files were modified.
