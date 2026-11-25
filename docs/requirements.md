# Requirements: Student Management

## 1. Overview
An administrator manages student records: add, view all, view one by ID, update, and delete. Scope is limited to these operations plus validation and error handling. Amendment 1 (2026-11-25, user-approved) adds a browser frontend served by the same application; the REST API is unchanged. Amendment 2 (2026-11-25, user-approved) adds an Active/Inactive enrollment status per student, a dedicated status-change endpoint and a status badge/toggle on the dashboard.

User story: "As an administrator, I want to add, view, update, and delete student records so that I can manage student information efficiently."

Amendment 2 user story: "As an administrator, I want to mark a student as Active or Inactive so that I can manage student enrollment status."

## 2. Functional requirements
- FR-1: The system shall add a new student record from the supplied student details.
- FR-2: The system shall assign each new student a unique student ID and return it on creation.
- FR-3: The system shall list all student records (an empty list when none exist).
- FR-4: The system shall return a single student record when given an existing student ID.
- FR-5: The system shall update the details of an existing student identified by student ID.
- FR-6: The system shall delete an existing student record identified by student ID.
- FR-7: The system shall reject add and update requests that omit a required field or leave it blank.
- FR-8: The system shall reject add and update requests whose values are malformed (e.g. invalid email format).
- FR-9: The system shall reject an add or update that would duplicate another student's email (case-insensitive) and shall report a conflict.
- FR-10: The system shall report "not found" when a view, update, or delete references a student ID that does not exist.
- FR-11: The system shall report an invalid-ID error when the student ID is missing or not in a valid format.

Amendment 1: frontend (the API requirements above are unchanged)
- FR-12: The application shall serve an HTML dashboard at `/` (with its CSS and JavaScript) from the same server and origin as the API; unknown non-API paths still return `ROUTE_NOT_FOUND`.
- FR-13: The dashboard shall list all students in a table (with a student count and an empty state), loaded from `GET /students`.
- FR-14: The dashboard shall provide an Add Student form that creates a student through `POST /students` and then shows it in the table.
- FR-15: The dashboard shall let the admin edit a student (form pre-filled; saved through `PUT /students/{id}`) and cancel an edit.
- FR-16: The dashboard shall delete a student through `DELETE /students/{id}` only after the admin confirms in a dialog.
- FR-17: The dashboard shall filter the displayed students client-side by name, email or course (case-insensitive, no API change).
- FR-18: The dashboard shall show success messages, show API validation errors next to the offending fields, and show conflict, not-found and server errors as readable messages.

Amendment 2: student status (FR-1..FR-18 are unchanged; this only adds to them)
- FR-19: Each student shall have a status that is exactly `Active` or `Inactive` (case-sensitive).
- FR-20: A new student shall default to `Active`; the add request (`POST /students`) shall accept an optional `status` and store it when valid.
- FR-21: A stored student record that has no status (created before this amendment) shall be treated as `Active` and returned as `Active`.
- FR-22: The system shall reject any status value other than `Active` or `Inactive` (wrong case, surrounding whitespace, empty, null, non-text, or any other text) with a validation error naming the `status` field. This applies to add and to the status-change request.
- FR-23: The system shall provide `PATCH /students/{id}/status` with body `{ "status": "Active"|"Inactive" }` that changes only that student's status and returns the updated student. `status` is required in this request; setting the status a student already has succeeds.
- FR-24: The status-change request shall report "not found" for an ID that does not exist and an invalid-ID error for an ID that is missing or not in a valid format.
- FR-25: `PUT /students/{id}` shall remain a full replacement of name, email and course only and shall preserve the student's current status.
- FR-26: Every student returned by the API (list, get by ID, create, update, status change) shall include its `status`.
- FR-27: Marking a student `Inactive` shall not delete or hide the student: an inactive student is still listed, viewable, updatable and deletable, and still counts for email uniqueness (FR-9).
- FR-28: The dashboard shall show each student's status as a badge in its table row.
- FR-29: The dashboard shall provide a per-row toggle that changes that student's status through `PATCH /students/{id}/status`, updates the row on success, and shows a readable message on success or failure.

## 3. Non-functional requirements
- NFR-1: Every failed request returns a clear, specific error message identifying the cause (validation, conflict, not found, invalid ID).
- NFR-2: A failed request never changes stored data.
- NFR-3: Validation rules are applied identically for add and update.
- NFR-4: The solution stays small and simple; no features beyond this story.
- NFR-5: Each requirement is independently testable via automated tests.
- NFR-6 (frontend): HTML, CSS and vanilla JavaScript only (no frameworks or dependencies); responsive layout; student data is rendered as text, never as HTML; no change to API validation, persistence or error behavior.
- NFR-7 (Amendment 2, regression): All existing add, view, update and delete behavior stays intact; all existing automated tests (138) keep passing, no test is removed or weakened, and tests asserting the exact student shape `{id, name, email, course}` may only be minimally updated to include `status: "Active"` (the exact-shape change required by FR-26); status-change failures obey NFR-1 and NFR-2 (error names the cause; stored data unchanged); the status is rendered on the dashboard as text, never as HTML (NFR-6 applies to the new UI).

## 4. Acceptance criteria
- AC-1 (FR-1, FR-2): Given valid student details, when the admin adds a student, then the record is stored and returned with a unique student ID.
- AC-2 (FR-3): Given N stored students, when the admin views all, then all N records are returned; given none, an empty list is returned.
- AC-3 (FR-4): Given an existing ID, when the admin views by ID, then that student's record is returned.
- AC-4 (FR-5): Given an existing ID and valid new details, when the admin updates, then the stored record reflects the new details and the ID is unchanged.
- AC-5 (FR-6): Given an existing ID, when the admin deletes, then the record is removed and a later view by that ID reports not found.
- AC-6 (FR-7): Given an add or update with a required field missing or blank, when submitted, then it is rejected with an error naming the field and nothing is stored or changed.
- AC-7 (FR-8): Given an add or update with a malformed value (e.g. "abc" as email), when submitted, then it is rejected with an error naming the field.
- AC-8 (FR-9): Given a student with email X exists, when the admin adds another student with email X (any letter case), then it is rejected with a conflict error. The same applies when updating a different student to email X. Updating a student while keeping their own email is allowed.
- AC-9 (FR-10): Given an ID that does not exist, when the admin views, updates, or deletes it, then a not-found error is returned and no data changes.
- AC-10 (FR-11): Given a missing, empty, or non-numeric student ID, when the admin views, updates, or deletes, then an invalid-ID error is returned and no data changes.
- AC-11 (NFR-1, NFR-2): Given any rejected request, then the error message states the cause and stored data is identical to before the request.

Amendment 1 acceptance criteria
- AC-12 (FR-12): Given the server is running, when a browser opens `/`, then the dashboard HTML loads with its CSS and JS; `/other` still returns 404 `ROUTE_NOT_FOUND`.
- AC-13 (FR-13, FR-14): Given the dashboard, when the admin submits valid details, then the student appears in the table with an ID and a success message is shown; the table shows an empty state when there are no students.
- AC-14 (FR-14, FR-18): Given invalid details or a duplicate email, when submitted, then the API error is shown (field errors beside the fields), and the table is unchanged.
- AC-15 (FR-15): Given an existing student, when the admin edits and saves, then the table shows the new details with the same ID.
- AC-16 (FR-16): Given an existing student, when the admin chooses Delete and cancels, then nothing changes; when they confirm, the student is removed.
- AC-17 (FR-17): Given several students, when the admin types in the search box, then only students whose name, email or course contains the text (any case) are shown; clearing it shows all.

Amendment 2 acceptance criteria
- AC-18 (FR-19, FR-20): Given valid details with no `status`, when the admin adds a student, then the returned and stored student has status `Active`; given valid details with `status` `Inactive` (or `Active`), then that status is stored and returned.
- AC-19 (FR-21): Given a stored record with no status, when the admin lists it or views it by ID, then it is returned with status `Active`; after a status change it is returned with the new status.
- AC-20 (FR-22, NFR-2): Given a status of `active`, `INACTIVE`, ` Active`, `""`, `null`, `1`, or `Suspended`, when sent on add or on the status-change request, then it is rejected with a validation error naming `status` and nothing is stored or changed.
- AC-21 (FR-23): Given an existing student, when the admin sends `PATCH /students/{id}/status` with `Inactive`, then the response is the updated student with status `Inactive`, a later get by ID shows `Inactive`, and name, email, course and ID are unchanged; sending `Active` reverses it; sending the current status succeeds with no other change.
- AC-22 (FR-23, FR-22): Given a status-change request whose body omits `status`, is empty, or is not valid JSON, when sent, then it is rejected with a validation error naming `status` (or the body) and nothing changes.
- AC-23 (FR-24, NFR-2): Given an ID that does not exist, when a status change is sent, then a not-found error is returned; given a missing, empty, or non-numeric ID, then an invalid-ID error is returned; in both cases no data changes.
- AC-24 (FR-25): Given an `Inactive` student, when the admin updates name, email or course through `PUT`, then the new details are stored and the status is still `Inactive`.
- AC-25 (FR-26): Given students of both statuses, when the admin lists, gets, creates, updates, or changes status, then every returned student includes `status`.
- AC-26 (FR-27, FR-9): Given an `Inactive` student with email X, when the admin adds another student with email X (any case) or updates another student to email X, then a conflict error is returned; the inactive student still appears in the list and can be viewed and deleted.
- AC-27 (FR-28): Given students of both statuses, when the dashboard loads, then each row shows a badge reading `Active` or `Inactive` (a record without status shows `Active`).
- AC-28 (FR-29): Given a row, when the admin uses its toggle, then the student's status flips to the other value, the badge updates and a success message is shown; when the request fails (e.g. the student was already deleted), then a readable error is shown and the row's status is unchanged.
- AC-29 (NFR-7): Given the existing automated tests (138) run after this amendment, then all pass; no test is removed or weakened, and the only permitted edits to existing tests are minimal updates adding `status: "Active"` to assertions on the exact student shape `{id, name, email, course}` (required by FR-26).

## 5. Assumptions and constraints
- A student has: name (required), email (required, valid format, unique), course (required).
- Student ID is assigned by the system, is a positive integer, and is never reused or supplied by the admin.
- The single user is the administrator; all operations are available to that user without access control.
- Duplicate means same email (case-insensitive, surrounding whitespace ignored); the same name alone is not a duplicate.
- Delete is permanent (no soft delete or undo).
- Stored data need not be shared across multiple concurrent users.

Amendment 2 assumptions
- Status is a student attribute with exactly two values; it is not a deletion state, so "Delete is permanent" (above) is unchanged.
- Existing stored records without a status are treated as `Active`; no one-off data migration is required for them to work.
- A `status` value sent in a `PUT` body does not change the student's status (status changes only through the status-change request) and is not rejected.
- Setting a student to the status they already have is allowed and returns success.
- The admin may change the status of any student at any time; no rules restrict the transition.

## 6. Out of scope
Authentication/authorization, payments, analytics and reporting, server-side search/filter/sort/pagination, bulk import/export, audit history, notifications, soft delete/restore. (Amendment 1 brings in the single-page student dashboard and client-side search only.)

Amendment 2 out of scope: filtering or searching by status (server- or client-side), status history or audit trail, bulk status change, any behavior that depends on status (e.g. blocking updates, hiding or excluding inactive students from lists or from email uniqueness), statuses other than Active/Inactive, soft-delete semantics, notifications on status change, and reason/date fields for a status change.

## 7. Open questions
None. The field set and duplicate rule above are assumptions; the human may change them at the approval gate.
