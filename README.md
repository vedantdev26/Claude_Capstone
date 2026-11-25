# Student Management API

A small full-stack app for managing student records: a Node.js REST API plus a browser dashboard (HTML, CSS and vanilla JavaScript, no frameworks). Node.js, CommonJS, no runtime dependencies. Data is kept in a JSON file.

## Requirements
- Node.js 26 or newer. Nothing to install: `npm install` is not needed.

## Run
```sh
npm start
```
The server listens on `http://127.0.0.1:3000` (loopback only) and prints the address when ready. Open that address in a browser to use the dashboard. If the page still shows `ROUTE_NOT_FOUND`, an older server is still running on that port: stop it and run `npm start` again.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on (integer 0-65535; an invalid value, or a port already in use, stops startup with an error) |
| `HOST` | `127.0.0.1` | Bind address. Set `HOST=0.0.0.0` only if you accept unauthenticated access from the network |
| `DATA_FILE` | `data/students.json` | Path of the JSON data file (created on first save) |

```sh
PORT=8080 DATA_FILE=/tmp/students.json npm start
```
On Windows PowerShell: `$env:PORT=8080; $env:DATA_FILE="$env:TEMP\students.json"; npm start`.
If the data file exists but is invalid, the server refuses to start and does not modify the file. `data/` is git-ignored.

## Test
```sh
npm test
```
`npm test` needs nothing but Node. To also exercise the dashboard in a real browser, run `npm run test:browser` (needs Chrome, Chromium or Edge installed; set `CHROME_PATH` if it is not found; it uses its own port and a temporary data file).

## Dashboard
Open `http://127.0.0.1:3000/`:
- **Add Student**: fill name, email and course. Validation errors from the API appear next to the fields, and a success message confirms the save.
- **Students table**: lists every student with a live count and an empty state.
- **Search**: type in the search box to filter by name, email or course (case-insensitive, done in the browser).
- **Edit**: click Edit to load a student into the form, change it, then Save Changes (or Cancel).
- **Delete**: click Delete and confirm in the dialog; Cancel leaves the student untouched.
- **Status**: each row shows an Active or Inactive badge. Click Mark Inactive / Mark Active to flip it; a message confirms the change. There is no status filter, and search does not look at status.

The layout is responsive: on narrow screens the table becomes stacked cards. The files live in `public/` and are served by the same Node app (only `/`, `/styles.css` and `/app.js`); the dashboard calls the REST API below with `fetch()`.

## API
A student is `{ "id", "name", "email", "course", "status" }`. `name` and `course` are 1-100 characters; `email` must be a valid address (max 254 characters) and unique, ignoring letter case. `id` is assigned by the server. `status` is exactly `Active` or `Inactive` (case-sensitive, not trimmed) and defaults to `Active`; `POST` accepts it as an optional field. Status has no effect on list, update, delete or email uniqueness. Records saved before this field existed read as `Active`, and the data file gets `status` on its next save (back up `data/students.json` before rolling back to pre-status code). `POST`, `PUT` and `PATCH` need `Content-Type: application/json`; request bodies are limited to 10 KB.

Add (201, returns the student and a `Location` header):
```sh
curl -i -X POST http://127.0.0.1:3000/students \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","course":"Mathematics"}'
```

List (200, `[]` when empty):
```sh
curl http://127.0.0.1:3000/students
```

Get one (200):
```sh
curl http://127.0.0.1:3000/students/1
```

Update (200, full replacement; the id never changes, and `status` is preserved: a `status` in the `PUT` body is ignored):
```sh
curl -X PUT http://127.0.0.1:3000/students/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada King","email":"ada@example.com","course":"Computing"}'
```

Change status (200, returns the updated student; body is `{"status":"Active"}` or `{"status":"Inactive"}`):
```sh
curl -X PATCH http://127.0.0.1:3000/students/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"Inactive"}'
```
```json
{"id":1,"name":"Ada King","email":"ada@example.com","course":"Computing","status":"Inactive"}
```

Delete (204, no body):
```sh
curl -i -X DELETE http://127.0.0.1:3000/students/1
```

## Errors
Failures return JSON: `{ "error": { "code", "message", "fields"? } }`.

Validation, 422 (`fields` lists each offending field):
```sh
curl -i -X POST http://127.0.0.1:3000/students \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"abc","course":"Art"}'
```
```json
{"error":{"code":"VALIDATION_ERROR","message":"email: must be a valid email address","fields":[{"field":"email","message":"must be a valid email address"}]}}
```

Conflict, 409 (adding an email that is already used, any letter case):
```sh
curl -i -X POST http://127.0.0.1:3000/students \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Two","email":"ADA@example.com","course":"Art"}'
```
```json
{"error":{"code":"CONFLICT","message":"Email already in use"}}
```

Not found, 404:
```sh
curl -i http://127.0.0.1:3000/students/999
```
```json
{"error":{"code":"NOT_FOUND","message":"Student 999 not found"}}
```

Invalid ID, 400 (also returned for `PUT`/`DELETE` with no ID):
```sh
curl -i http://127.0.0.1:3000/students/abc
```
```json
{"error":{"code":"INVALID_ID","message":"Student ID must be a positive integer"}}
```

Status errors (`PATCH /students/{id}/status`, checked in this order):
- 400 `INVALID_ID` (bad id), 415 `UNSUPPORTED_MEDIA_TYPE` (not JSON), 413 `PAYLOAD_TOO_LARGE` (over 10 KB), 400 `INVALID_JSON` (body is not a JSON object), 404 `NOT_FOUND` (no such student).
- 422 `VALIDATION_ERROR` for a missing or wrong `status` (for example `"inactive"`):
```json
{"error":{"code":"VALIDATION_ERROR","message":"status: must be \"Active\" or \"Inactive\"","fields":[{"field":"status","message":"must be \"Active\" or \"Inactive\""}]}}
```
- 405 `METHOD_NOT_ALLOWED` for any other method on the status path (`GET`, `POST`, `PUT`, `DELETE`) and for `PATCH` on any other `/students` path.

Other codes: `INVALID_JSON` (400), `ROUTE_NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `UNSUPPORTED_MEDIA_TYPE` (415), `PAYLOAD_TOO_LARGE` (413), `INTERNAL_ERROR` (500).
