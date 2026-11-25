# Changelog

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
