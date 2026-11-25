---
name: implementation-planning
description: Template and checklist for dependency-ordered docs/impl-plan.md.
---

# Implementation Planning

## Template for docs/impl-plan.md
Table per task: `T-n | title | depends on | priority | covers (FR ids) | acceptance criteria | status (todo)`.
Then a "Blocked tasks" list and the execution order.

## Checklist
- Typical order: scaffold/config -> data model -> storage -> validation -> operations -> interface/API -> error handling -> tests -> README.
- Tasks are small (one commit-sized unit), each independently verifiable.
- Dependencies acyclic; blocked tasks name their blocker.
- Every FR covered; no task outside approved scope.
