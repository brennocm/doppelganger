# Prompt history

Every prompt sent to Kiro while building Doppelgänger, in order, pasted as written. Append-only: entries are never edited or removed, including prompts that did not work.

Format:

````markdown
## NNN — YYYY-MM-DD — <Kiro surface: IDE | CLI | Web | Crew> — <spec or "vibe">

```text
<prompt, pasted as is>
```

Outcome: <one line: what happened, link to commit or journal entry>
````

---

## 001 — 2026-10-30 — CLI — project-foundation, kiro-workbench (Phase A)

```text
You are starting the Doppelgänger project for Kiroween 2026. Everything you need is in .kiro/.

Before writing any code:
1. Read every file in .kiro/steering/ and follow them as binding rules. security.md and kiro-workflow.md override convenience.
2. Read .kiro/steering/structure.md for the spec order.
3. Read all three files of .kiro/specs/project-foundation/ and .kiro/specs/kiro-workbench/.

Then implement, in this order:
A. project-foundation: every task in tasks.md, top to bottom.
B. kiro-workbench Phase A only (tasks 1 to 3). Leave task 4 and Phase B for later, as the spec says.

Working rules:
- Start with `git init` on branch main if the folder isn't a repository yet. The .gitignore from task 1.2 must exist before the first commit, and .kiro/ must stay tracked.
- Do one task at a time. After each task, run `mise run check` (or the narrowest check that exists at that point), fix any failure, mark the task as [x] in tasks.md, and make one Conventional Commit that contains only that task's files. Never use `git add -A`; add explicit paths.
- Pin real, current stable versions of every tool and dependency. Check them with the docs MCP or the official sources, never from memory. Record each pinned version and why in ADR 0001.
- If a requirement is ambiguous or turns out to be impossible, stop and ask me. Do not guess. If the spec itself needs to change, propose the change to requirements.md or design.md first, wait for my OK, then implement.
- Hooks and custom agents: create them in Kiro's current native format. Check the Kiro documentation first. If a hook type is only available in the Kiro IDE, create the file in the documented format if you can; otherwise list it as pending for the IDE and tell me.
- MCP: write .kiro/settings/mcp.json with environment variable references for every credential. Never write a literal token. Tell me which environment variables I must export.
- Never write personal data (names, e-mails, local paths, IPs) into any file or commit.
- After each finished task group, append an entry to docs/kiro-journal.md using the template in kiro-workflow.md. Be factual and include problems.

Stop at the project-foundation checkpoint (task 6) and show me:
- the output of `mise run check`,
- the list of commits,
- anything left pending or that needs my action (accounts, tokens, GitHub repository, Pages settings).
Continue with kiro-workbench Phase A only after I say "go".
```

Outcome: _pending_
