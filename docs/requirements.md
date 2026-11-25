# Requirements: Student Management

## 1. Overview
An administrator manages student records: add, view all, view one by ID, update, and delete. Scope is limited to these operations plus validation and error handling.

User story: "As an administrator, I want to add, view, update, and delete student records so that I can manage student information efficiently."

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

## 3. Non-functional requirements
- NFR-1: Every failed request returns a clear, specific error message identifying the cause (validation, conflict, not found, invalid ID).
- NFR-2: A failed request never changes stored data.
- NFR-3: Validation rules are applied identically for add and update.
- NFR-4: The solution stays small and simple; no features beyond this story.
- NFR-5: Each requirement is independently testable via automated tests.

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

## 5. Assumptions and constraints
- A student has: name (required), email (required, valid format, unique), course (required).
- Student ID is assigned by the system, is a positive integer, and is never reused or supplied by the admin.
- The single user is the administrator; all operations are available to that user without access control.
- Duplicate means same email (case-insensitive, surrounding whitespace ignored); the same name alone is not a duplicate.
- Delete is permanent (no soft delete or undo).
- Stored data need not be shared across multiple concurrent users.

## 6. Out of scope
Authentication/authorization, payments, analytics, dashboards, reporting, search/filter/sort/pagination, bulk import/export, audit history, notifications, soft delete/restore.

## 7. Open questions
None. The field set and duplicate rule above are assumptions; the human may change them at the approval gate.
