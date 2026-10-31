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

Outcome: Decisions applied (spec and testing steering updated, TypeScript 6.0.3, no AI attribution found in the 13 commits), tasks 4.2–5.2 done, checkpoint run on a clean clone; task 6 waited for the first Pages deploy, which then passed (ci and pages green on e2a645d; both URLs load), and task 6 was ticked under prompt 003. See the journal entries for groups 4 and 5–6.

## 003 — 2026-10-30 — CLI — project-foundation + kiro-workbench

```text
The repository is created and main is pushed: brennocm/doppelganger. Pages source is set to GitHub Actions, and the github-pages environment is restricted to main.
Deploy result: ci passed, then pages deployed. Both https://brennocm.github.io/doppelganger/ and https://brennocm.github.io/doppelganger/app/ load the placeholder pages.

1. Replace the <owner>/<repo> placeholders in the README and the live-demo link with brennocm/doppelganger and https://brennocm.github.io/doppelganger/. Tick task 6 and fill in the Outcome of entry 002 if anything changed.
2. Go: start kiro-workbench Phase A, tasks 1 to 3, with the same working rules. Include task 1.6a (prompt-logger) if the trigger exists.
3. Logging: append this message as entry 003 (CLI, project-foundation + kiro-workbench). Re-read docs/prompt-history.md right before editing, so the duplicate from last time doesn't happen again.
4. Same commit rules as before: no AI attribution in any commit, and propose deviations before implementing them. Push to origin main after each task group, and check that ci passes.

Stop after Phase A task 3 and show me: the hooks and agents created (and which ones are pending for the IDE), the mcp.json without secrets, the environment variables I must export, and the journal entries.
```

Outcome: Placeholders replaced and task 6 ticked after an independent check of the deploy (commit 51a2234, push left to the developer). Stopped before kiro-workbench to propose P1–P9, because the installed CLI is 2.24 (V2 engine) while the current hook and agent formats target IDE 1.x and CLI V3.

## 004 — 2026-10-30 — CLI — kiro-workbench (Phase A)

```text
Decisions:

Pushing: I'll push myself after each task group (git push origin main). Don't set up credentials. A human gate before anything becomes public is intended; note it in the journal. When you finish a group, tell me it's ready to push, then check ci and pages once I confirm.

README sentence: keep it.

P1: OK. Single source of truth: v1 files in .kiro/hooks/ only, with no V2 copies. Use `kiro-cli --v3` for the rest of the project, not only for the dry runs. Record in the journal why we moved from V2 to V3 and what differed.
P2: OK. Implement privacy-audit as a manual steering file run as /privacy-audit. Update Requirement 2.3 and the design diagram. Use the same pattern for haunt-snapshots later.
P3: OK. The PII check must ignore documented placeholders (example.com and example.org e-mails, 127.0.0.1, 0.0.0.0, RFC 5737 documentation IPs, paths like /home/<user>). Add a test with true positives and these false positives.
P4: OK. Add the glossary line.
P5: OK. It must not loop: block at most once per turn, and never when the only changed files are docs/kiro-journal.md or docs/prompt-history.md. Add a test for the no-loop case.
P6: OK, with these rules:
  - Surface: write "CLI" when the hook runs from kiro-cli and "IDE" from the IDE, if an environment variable or the event payload reliably tells them apart. Otherwise write "set by hand".
  - Redaction runs before anything is written. If redaction fails for any reason, write nothing and print a warning. Never write the raw prompt.
  - Keep it disabled in this repository for now. After I enable it, the hook is the only writer of new entries: you stop appending entries by hand and only fill in "Outcome" lines.
P7: OK. If `agent validate` in 2.24 rejects the new schema, validate under --v3 and say so in the journal.
P8: OK. Pin versions, check licenses, no @latest. Document least privilege for the tokens in the journal, and give me the setup steps:
  - GITHUB_PERSONAL_ACCESS_TOKEN: fine-grained, only brennocm/doppelganger, read-only contents and metadata, read and write issues and pull requests, expiring 2026-12-31.
  - HF_TOKEN: read-only.
  - CONTEXT7_API_KEY: optional; leave it unset unless rate limits hit.
  Tokens live in my shell environment, never in the repository. Tell me which variables to approve under "Mcp Approved Env Vars" in the IDE.
P9: OK, leave it.

Order: spec updates first, then hooks, MCP and agents, each with its own commit and check run. Stop at the end of Phase A task 3 as planned, and show me the hooks and agents (and which are pending), mcp.json, the environment variables, and the journal entries.

Logging: append this message as entry 004 by hand (the prompt-logger is still disabled). Re-read the file right before editing.
```

Outcome: Spec updated, hooks (tasks 1.1–1.6a), MCP config (2.1) and agents (3.1–3.3) created and committed; 1.7 hook dry runs, 2.2 GitHub/Hugging Face/Playwright calls and 3.4 IDE comparison wait for a CLI update, tokens, a browser install and an IDE session. See the four kiro-workbench journal entries.

## 005 — 2026-10-30 — CLI — kiro-workbench (Phase A)

```text
New session on the V3 engine (kiro-cli updated). Re-read every file in .kiro/steering/, the kiro-workbench spec, and the last four entries of docs/kiro-journal.md before doing anything.

State: kiro-workbench Phase A tasks 1 to 3 are implemented and pushed. Only HF_TOKEN is exported. The Playwright browser is installed, and CONTEXT7_API_KEY is unset on purpose.

Decision: I won't create the GitHub token for now. We don't use issues or PRs, and I push by hand, so it would be an unused credential. Set the github MCP server to "disabled": true in mcp.json (keep its configuration for later), update the journal and the "environment variables" notes accordingly, and record the decision and the reason in the journal.

Finish the open verification tasks:
1. Task 1.7: dry-run every hook inside this V3 session (have the agent edit a scratch file in each watched path, then revert it), and run /privacy-audit once. Record each hook's real output in the journal. List any hook that still doesn't fire.
2. Task 2.2: one real tool call per enabled MCP server (Hugging Face: search for an anti-spoofing model; Playwright: open https://brennocm.github.io/doppelganger/ and take a screenshot; Context7: already done). GitHub is skipped because it's disabled; note that in the task.
3. Agent permissions: prove that exorcist's deny rules fire on their own, not only because the model refuses. For example, temporarily give it an instruction that conflicts with its role in a throwaway test, and show the permission denial. Record the evidence.
4. Enable prompt-logger ("enabled": true). From the next prompt on it is the only writer of new entries. Verify that it logs exactly one entry for the next prompt I send, with redaction working, then report.

Same rules: one commit per item, no AI attribution, propose deviations first, stop when items 1 to 4 are done and tell me it's ready to push. Task 3.4 (the IDE comparison) stays open for me to do in the IDE.

Logging: append this message by hand as entry 005 (prompt-logger is still disabled at this point). Re-read the file right before editing
```

Outcome: Stopped during item 1 and proposed P10–P14. The dry run showed that V3 does not fill in `{{filePath}}`, so secret-sentinel and test-affected skipped every file. Output from PostFileSave and PostToolUse command hooks never reached the agent. Kiro blocked agent writes to `.kiro/settings/mcp.json`. Nothing was committed.

## 006 — 2026-10-30 — CLI — kiro-workbench (Phase A)

```text
Decisions:

P10: OK. Remove {{filePath}} from the commands, make resolve-path.sh ignore unfilled {{…}} arguments, and add the test.

P11: OK. Implement the state file and Stop hook approach whatever my terminal shows. It's deterministic and costs no model call per save. Update requirements 1.x and 2.1 and the design first. Rules:
  - Findings must never contain the secret itself. Report the type, file, line and a masked snippet (first 4 characters + "…"). This applies to the state file, the Stop message and the journal. Add a test that the raw value never appears in any output.
  - Deliver findings at most once per turn, then clear them. Cap the file at 50 findings plus a "…and N more" line.
  - Keep the state file under .git/kiro-hooks/, so it is never committed.
  For the journal: <paste here whether your terminal showed hook output, or write "not checked">.

P12: Done by me. github now has "disabled": true in .kiro/settings/mcp.json (uncommitted). Commit it with the P13 journal entry.

P13: OK. HF_TOKEN (read-only) is exported. CONTEXT7_API_KEY stays unset.

P14: OK.

Then finish item 1 (contracts-codegen, both test-affected cases, journal-keeper, /privacy-audit) and continue with items 2 to 4 as planned. Same rules: one commit per item, propose deviations first, stop when done and tell me it's ready to push.

Note: Kiro blocking agent writes to mcp.json is a good finding for the write-up. Record it in the journal as a platform guardrail, along with the fact that you didn't work around it.

Este prompt também precisa entrar no histórico como entrada 006. O prompt-logger ainda está desativado, então peça ao Kiro para adicioná-lo à mão, como nas vezes anteriores, ou cole a linha abaixo no fim da mensagem:

Logging: append this message by hand as entry 006. Re-read the file right before editing.
```

Outcome: _pending_
