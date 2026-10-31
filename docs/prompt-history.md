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

Outcome: tasks 1.1 to 4.1 done in 13 commits; `mise run check` and `check:all` pass. Stopped at 4.2 asking about the license allowlist (Requirement 4.4), fixture audio vs the forbidden-path rule, and four changes made without proposing them first (gitleaks command, Biome on Markdown, TypeScript 7 vs dependency-cruiser, command adjustments).

## 002 — 2026-10-30 — CLI — project-foundation

```text
Decisions:

1. License allowlist: (a). Accept your proposed text for Requirement 4.4, including the SPDX override list for packages that report a license category. Each override must cite the project's license file URL in a comment. Unknown licenses fail the check.

2. Fixture audio: don't commit any audio outside apps/web/public/replay/. Keep the security rule as it is. Generate synthetic fixtures (sine waves, noise, silence, chirps) at test time from seeded generators. When a tool needs a file (for example, Playwright's fake audio capture), write it to a git-ignored temporary directory during test setup. Cross-language golden vectors stay as JSON in packages/contracts/fixtures/golden/. Update the testing steering ("Fixture audio lives in…") to say this, and remove the packages/*/fixtures/ audio wording.

3. Unproposed changes:
   - gitleaks `git --pre-commit --staged`: OK.
   - Excluding *.md from Biome: OK. Markdown under .kiro/ and docs/ must never be auto-formatted, especially the append-only prompt history.
   - mypy on src/, check installing from lockfiles, lefthook through `mise x`: OK.
   - TypeScript: don't use the @swc/core workaround. Pin TypeScript 6.0.3 for ecosystem compatibility, revert dependency-cruiser to its normal parser, and record in ADR 0001 why we stay on 6.x and what would trigger moving to 7.
   Update project-foundation/design.md to match all of the above.
   From now on, propose deviations before implementing them, even small ones.

4. Commit hygiene (applies to every commit from now on):
   - No AI attribution of any kind in commit messages, PR descriptions, tags or code comments. That means no "Co-Authored-By" trailers for any AI tool, no "Generated with/by …" lines, and no mentions of AI assistants as authors. Kiro usage is documented in docs/kiro-journal.md and the write-up, not in commits.
   - Don't change git user.name or user.email, and don't pass --author.
   - Check the 13 existing commits now with `git log --format='%H%n%B' | grep -niE 'co-authored|generated (with|by)|assistant'`. If any match, rewrite those messages (nothing has been pushed yet) and show me the result.

5. Logging: fill in the "Outcome" line of entry 001 in docs/prompt-history.md, then append this message verbatim as entry 002 (CLI, project-foundation).

Then continue with task 4.2 and stop at the task 6 checkpoint as planned.
```

Outcome: Decisions applied (spec and testing steering updated, TypeScript 6.0.3, no AI attribution found in the 13 commits), tasks 4.2–5.2 done, checkpoint run on a clean clone; task 6 waits for the first Pages deploy. See the journal entries for groups 4 and 5–6.
