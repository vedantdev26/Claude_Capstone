---
name: architecture-design
description: Template for docs/architecture.md and review checklist for docs/design-review.md.
---

# Architecture Design

## Template for docs/architecture.md
1. Stack recommendation (one choice, 3-5 line rationale, based on repo + installed runtimes)
2. Components and responsibilities (table)
3. Data model (fields, types, constraints, uniqueness rule for duplicates)
4. API/interface contract: operations, inputs, outputs, error codes/messages
5. Interaction flow (short list or small mermaid diagram)
6. Error handling and validation strategy
7. Testing approach and project layout (`src/`, `tests/`)
8. Requirement traceability (FR id -> component)

## Review section (Design Review Agent)
Check: coverage of all FRs, security (input validation, injection, error leakage), missing components, maintainability, over-engineering, testability, duplicate/ID edge cases.
Output `docs/design-review.md`: findings table (id, severity, section, issue, recommendation), then verdict.
