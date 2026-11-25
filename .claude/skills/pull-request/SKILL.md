---
name: pull-request
description: PR description template, changelog format and safe PR creation steps.
---

# Pull Request

## Body (docs/pr-description.md), exactly these sections
1. Summary (2-3 sentences)
2. Changes Made (files added/modified, with reason)
3. Test Evidence (real output from docs/verification-report.md)
4. Known Limitations
5. Reviewer Checklist (tick-list: requirements met, tests pass, no secrets, docs updated, error cases handled)

## Changelog
Prepend to `docs/CHANGELOG.md`: `## [Unreleased] - YYYY-MM-DD` with Added/Changed/Fixed bullets.

## Steps
1. Check `gh auth status` and `git remote -v`; report exact blocker if missing.
2. Only with explicit user authorization: `git push -u origin <branch>`, then `gh pr create --base main --head <branch> --title ... --body-file docs/pr-description.md`.
3. Return the URL and number from `gh` output. Never merge.
