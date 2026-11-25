# Changelog

## [Unreleased] - Student status (2026-11-25)

### Added
- Student `status` field: `Active` or `Inactive` (case-sensitive), default `Active`, optional on `POST`.
- `PATCH /students/{id}/status` with body `{"status": ...}`; errors 400 `INVALID_ID`/`INVALID_JSON`, 415, 413, 404, 422 and 405 for other methods on the path.
- Dashboard: Active/Inactive badge per row and a Mark Active / Mark Inactive toggle with success and error messages.
- 82 new automated tests (220 total with the 138 existing) across validation, repository, service, API and dashboard; 12 new `npm run test:browser` checks (47 total).

### Changed
- Every student response (exact-shape) now includes `status`; `PUT` preserves the stored status and ignores a `status` in its body.
- Records saved without `status` read as `Active`; the first save after upgrade rewrites the data file with `status` (back up `data/students.json` before rolling back to pre-status code).
- `PATCH` requires `Content-Type: application/json`; `PATCH` on other `/students` paths returns 405.

## [Unreleased] - Frontend (2026-11-25)

### Added
- Browser dashboard served by the Node app at `/`: add form, students table, client-side search by name/email/course, edit, delete with a native confirmation dialog, field-level validation errors and success/error messages, responsive layout. HTML, CSS and vanilla JavaScript only (`public/`), no dependencies.
- `src/staticFiles.js`: serves only `/`, `/styles.css` and `/app.js` (GET/HEAD) from a fixed allow-list with nosniff and CSP headers.
- `tests/frontend.test.js` (25 tests): static serving and path allow-list, HTML/JS contract, search filter, and the real client code against a real server.
- `npm run test:browser` (`scripts/browser-check.js`): self-contained headless Chrome/Edge check of the dashboard (35 checks).
- Requirements FR-12..FR-18 / AC-12..AC-17 and architecture s11.

### Changed
- `GET /` now returns the dashboard instead of 404 `ROUTE_NOT_FOUND`. The REST API (`/students`), validation, persistence and error behavior are unchanged.

## [Unreleased] - 2026-11-25

### Added
- Student Management REST API (Node.js >=26, zero dependencies): `POST/GET /students`, `GET/PUT/DELETE /students/:id`.
- Validation shared by add and update: required name, email and course; email format; case-insensitive unique email (409).
- Specific error codes and messages for validation (422), conflict (409), not found (404), invalid ID (400), invalid JSON (400), method not allowed (405), payload too large (413), unsupported media type (415) and internal error (500).
- JSON file persistence with atomic writes; server refuses to start on an invalid data file without modifying it.
- Configuration through `PORT`, `HOST` and `DATA_FILE`; loopback bind by default.
- 113 automated tests across API, service, repository and validation layers.
- README with setup, usage and error examples; phase documents under `docs/`.

### Changed
- None.

### Fixed
- F-1 and F-2 fixed after code review; F-3/F-4 accepted deviations (architecture s10); F-5..F-7 open, minor. See `docs/pr-description.md`.
