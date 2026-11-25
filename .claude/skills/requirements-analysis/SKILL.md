---
name: requirements-analysis
description: Template and checklist for writing docs/requirements.md from a user story.
---

# Requirements Analysis

## Template for docs/requirements.md
1. Overview (2-3 lines) and user story
2. Functional requirements: `FR-n` — one testable statement each
3. Non-functional requirements: `NFR-n` (validation, error handling, simplicity, testability)
4. Acceptance criteria: `AC-n` Given/When/Then, mapped to FR ids
5. Assumptions and constraints
6. Out of scope
7. Open questions (only if truly unanswerable from the story)

## Checklist
- Each FR has >=1 AC; no FR mentions technology.
- Covers: add, list, get by id, update, delete, required-field validation, duplicates, invalid/missing id.
- Nothing beyond the story (no auth, analytics, dashboards unless approved).
- Ask only essential questions.
