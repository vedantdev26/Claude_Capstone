---
name: code-review
description: Checklist and report template for docs/code-review.md.
---

# Code Review

## Areas (verdict each: pass / issues)
Correctness vs FR/AC - Security (input validation, injection, secrets, error leakage) - Error handling (duplicates, invalid/missing id, empty data) - Code quality/clarity - Maintainability and DRY - Dependency safety (run the ecosystem audit if available, e.g. `npm audit` / `pip-audit`; else say "not run") - Test coverage (happy path + error cases).

## Report template
Verdict table (area, result), findings table (id, severity critical/major/minor, file:line, issue, suggested fix), overall verdict. Only list real issues; no style nitpicks.
