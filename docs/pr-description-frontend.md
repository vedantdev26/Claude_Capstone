**Title:** Add student management dashboard (HTML/CSS/vanilla JS) served by the Node app

**Base:** `main`  **Head:** `feature/frontend`

## Summary
Adds the missing browser frontend. Opening the app now shows a Student Management dashboard instead of `ROUTE_NOT_FOUND`: an Add/Edit form, a students table, client-side search by name, email or course, edit, delete with a native confirmation dialog, field-level validation errors and success/error messages, and a responsive layout. It is plain HTML, CSS and JavaScript (no frameworks, no new dependencies), served by the existing Node server and wired to the existing REST API with `fetch()`. The API, validation and JSON persistence are unchanged. Requirements and architecture were amended with the user's approval (FR-12..FR-18, architecture s11).

## Changes Made
Added:
- `public/index.html`, `public/styles.css`, `public/app.js`: the dashboard. Student data is rendered with `textContent` only; no inline script, style or handlers.
- `src/staticFiles.js`: serves only `/`, `/styles.css` and `/app.js` (GET/HEAD) from a fixed allow-list, with `nosniff` and a CSP (`default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`). Other methods on those paths are a JSON 405. No path is ever joined to a directory.
- `tests/frontend.test.js` (25 tests): static serving and allow-list, HTML/JS contract, search filter, and the real client code against a real server.
- `scripts/browser-check.js` and `npm run test:browser`: 35 checks driving the real dashboard in headless Chrome/Edge over the DevTools protocol (Node built-ins only). It starts its own server on a free port with a temporary data file. Not part of `npm test`, because it needs an installed browser.
- `docs/code-review-frontend.md`, `docs/verification-report-frontend.md`.

Modified:
- `src/routes.js`: checks the asset allow-list before the `/students` routing rule (5 lines). `/students` behavior is unchanged.
- `tests/api.test.js`: removed `'/'` from the list of paths expected to be `ROUTE_NOT_FOUND`, because `/` is now the dashboard (approved FR-12). The other paths still assert `ROUTE_NOT_FOUND`.
- `docs/requirements.md`, `docs/architecture.md`, `README.md`, `docs/CHANGELOG.md`, `package.json` (`test:browser` script), `workflow/workflow-state.json`.

Diff vs `main`: 15 files, +1204 / -17 (before this description file).

## Test Evidence
Sources: `docs/verification-report-frontend.md`, `docs/code-review-frontend.md` (Windows 11, Node v26.13.1, Chrome).
- `npm test`: 138 tests, 138 pass, 0 fail (113 existing backend tests + 25 frontend tests).
- `npm run test:browser`: 35 checks covering load, validation errors, add, duplicate email, search (name, email, course, no match), edit, edit-cancel, delete with cancel and confirm, XSS-as-text, persistence across reload, API still reachable from the page, mobile stacked layout without overflow, and no console/CSP errors.
- The verification took three rounds, recorded as they happened. Round 1 FAILED: a race in the check script (it clicked again while the app's busy guard still held the button disabled). Round 2 passed 14 of 16 runs, with an intermittent `reload` failure under load. Round 3, after fixing how the script reloads the page: 18 of 18 runs passed, including 12 under parallel `npm test` load. Eighteen clean runs are strong evidence, not proof, that the intermittent failure is gone.
- HTTP checks on a free port with a temporary data file: dashboard and asset headers, 404/405 cases (including traversal attempts), and the whole REST API (201/200/204, 422, 409, 404, 400, 415, 413, 405), persistence across a restart, invalid `PORT` exits 1.
- Code review: approved with changes; all findings fixed except two minor ones listed below. See the Disposition section.

## Known Limitations
- Verified in Chrome only. Firefox, Safari and screen readers are unverified.
- Port 3000 was occupied by an older, unrelated server process during verification, so the page was checked on other ports. The code path is identical; run `npm start` on a free port 3000 to see it there.
- `/favicon.ico` returns 404, which shows as a cosmetic console line.
- Accepted code-review items: a 404 on edit (the student was deleted elsewhere) clears what the admin typed; focus after a successful save is not moved explicitly.
- No CI exists in this repository, so the evidence above is from local runs. `npm audit` was not run (no lockfile, no dependencies).
- Search is client-side only (as approved); delete is permanent.

## Reviewer Checklist
- [ ] Requirements met: FR-12..FR-18 and AC-12..AC-17 (verification report tables)
- [ ] `npm test` passes (138) and, with Chrome installed, `npm run test:browser` passes (35)
- [ ] `/students` API, validation and persistence unchanged (only the `routes.js` hunk and `src/staticFiles.js` touch `src/`)
- [ ] No secrets in code, logs or docs; no `data/` committed
- [ ] The `tests/api.test.js` change (`/` no longer expected to 404) is acceptable
- [ ] Docs updated: README Dashboard section, architecture s11, changelog
- [ ] Accepted limitations above are fine, or follow-up issues are opened

🤖 Generated with [Claude Code](https://claude.com/claude-code)
