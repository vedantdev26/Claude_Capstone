---
name: verification
description: Procedure and report template for docs/verification-report.md. Real execution only.
---

# Verification

## Procedure
1. Install deps if needed; run build/startup check.
2. Run the full test suite once; capture the command and result counts.
3. Exercise edge cases against the running app or via integration tests: create, list, get, update, delete; missing required fields; duplicate create; unknown/invalid id on get/update/delete.
4. Check README: setup and run instructions work as written.

## Report template
Commands run (verbatim) - result excerpts - table of AC id -> pass/fail/evidence - failures with repro - docs check - overall verdict (passed / failed, with critical list).
If a check was not executed, mark it "not run" and say why. Never infer a pass.
