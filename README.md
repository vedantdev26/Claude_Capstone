# Student Management API

A small REST API for managing student records (add, list, view, update, delete). Node.js, CommonJS, no runtime dependencies. Data is kept in a JSON file.

## Requirements
- Node.js 26 or newer. Nothing to install: `npm install` is not needed.

## Run
```sh
npm start
```
The server listens on `http://127.0.0.1:3000` (loopback only) and prints the address when ready.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Bind address. Set `HOST=0.0.0.0` only if you accept unauthenticated access from the network |
| `DATA_FILE` | `data/students.json` | Path of the JSON data file (created on first save) |

```sh
PORT=8080 DATA_FILE=/tmp/students.json npm start
```
If the data file exists but is invalid, the server refuses to start and does not modify the file. `data/` is git-ignored.

## Test
```sh
npm test
```

## API
A student is `{ "id", "name", "email", "course" }`. `name` and `course` are 1-100 characters; `email` must be a valid address (max 254 characters) and unique, ignoring letter case. `id` is assigned by the server. `POST` and `PUT` need `Content-Type: application/json`; request bodies are limited to 10 KB.

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

Update (200, full replacement; the id never changes):
```sh
curl -X PUT http://127.0.0.1:3000/students/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada King","email":"ada@example.com","course":"Computing"}'
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

Other codes: `INVALID_JSON` (400), `ROUTE_NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `UNSUPPORTED_MEDIA_TYPE` (415), `PAYLOAD_TOO_LARGE` (413), `INTERNAL_ERROR` (500).
