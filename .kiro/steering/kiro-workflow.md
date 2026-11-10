---
inclusion: always
---

# How we work with Kiro in this repository

How Kiro was used is documented as part of the project, so the way we build is part of the product. Follow these rules in every session.

## Spec-driven by default

- Every feature starts as a spec in `.kiro/specs/<feature>/` (`requirements.md` → `design.md` → `tasks.md`) and is implemented task by task.
- Requirements use EARS notation (`WHEN … THE <System> SHALL …`). Designs list correctness properties that become property-based tests.
- If implementation reveals a gap, update the spec first, then the code. Specs and code never disagree.
- Small fixes outside any spec (typos, dependency bumps) may be done directly ("vibe" mode), and they are noted in the journal.

## Keep the journal

After each meaningful session, append a dated entry to `docs/kiro-journal.md`:

```markdown
## YYYY-MM-DD — <short title>
- Kiro surface: IDE | CLI | Web | Crew
- Feature used: spec | hook | steering | MCP | custom agent | power | PBT
- What happened: <one or two sentences>
- Effect: <time saved, bug caught, decision changed>
```

The journal is the raw material for the write-up (`docs/KIRO.md`). Record failures and corrections too: they show real usage.

## Prompt history

`docs/prompt-history.md` holds every prompt sent to Kiro, in order. It is append-only: never edit, reorder or remove an entry. When asked to log a prompt, append it verbatim in the format at the top of the file, then fill the "Outcome" line after the work is done. Before appending, replace any secret or personal data in the prompt with a placeholder and say so.

## Hooks, agents and MCP

- Hooks and custom agents are created through Kiro so their files use Kiro's current native format. Their intended behavior is defined in the `kiro-workbench` spec.
- MCP server configuration lives in `.kiro/settings/mcp.json`. Credentials are environment variable references, never literal values.

## Parallel work

When a Kiro surface allows parallel agents (Crew), split work along package boundaries so agents never edit the same files: `packages/detector`, `apps/web/src/features/*`, `packages/model-lab`, `apps/engine`, `apps/landing`. Record in the journal how the work was split and what merged cleanly or not.

## Language

Code, specs, commits and docs are in English. Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
