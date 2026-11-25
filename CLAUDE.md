# Agentic SDLC Framework

Reusable, Markdown-driven multi-agent SDLC. Entry point: `claude --agent orchestrator` (or tell a plain session: "act as the orchestrator per .claude/agents/orchestrator.md").

## Layout
- `.claude/agents/` orchestrator + 8 specialists. `.claude/skills/` per-phase checklists/templates.
- `docs/` phase artifacts. `workflow/workflow-state.json` single source of progress (Orchestrator writes only).
- Demo app (Student Management System) lives in `src/` and `tests/`. Stack is chosen by the Architecture Agent, never hardcoded here.

## Phases (strict order, each ends with a human approval gate)
1 requirements -> 2 architecture -> 3 design-review -> 4 planning -> 5 implementation -> 6 code-review -> 7 verification -> 8 pull-request

## Shared rules (all agents)
- Read only the files your phase needs. Edit artifacts in place; never regenerate approved ones.
- Be terse. No filler docs, no unrequested features, no comments that restate code.
- Subagents cannot ask the user: put questions under `QUESTIONS:` in your final reply; the Orchestrator relays them.
- Final reply format: `STATUS: done|blocked`, `ARTIFACT: <path>`, `SUMMARY:` (<=8 lines), optional `QUESTIONS:`.
- Never fabricate test results, never expose secrets, never change approved requirements/architecture silently.
- Git: local commits on `feature/student-management` after each approved phase are authorized. Push and PR creation need explicit user OK. Never merge.
