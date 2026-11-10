# Requirements Document

## Introduction

This spec covers what a visitor of the finished project receives: the public repository, the live demo URL and the write-up on how Kiro was used. Every claim in these materials must be backed by the repository, the journal or an evaluation report.

## Glossary

- **Write_Up**: `docs/KIRO.md`, the detailed account of how Kiro was used.
- **Journal**: `docs/kiro-journal.md`.

## Requirements

### Requirement 1: Repository readiness

**User Story:** As a visitor, I want a repository I can understand and run.

#### Acceptance Criteria

1. THE repository SHALL be public, with an OSI-approved license (MIT) detected by GitHub and shown in the About section.
2. THE `.kiro/` directory SHALL be committed with its steering, specs, hooks, agents and MCP settings, and SHALL NOT be git-ignored.
3. THE `README.md` SHALL include: the one-line description, the live demo link, a screenshot, the three tiers with run instructions, the limits, and links to the Write_Up and model card.
4. THE repository history SHALL contain no secrets or personal data, verified by a full-history gitleaks run.

### Requirement 2: Write-up

**User Story:** As a developer curious about Kiro, I want to understand how deeply and effectively it was used.

#### Acceptance Criteria

1. THE Write_Up SHALL contain one section per Kiro feature:
   1. Kiro surfaces (IDE, CLI, Web, Crew): which were used and how they differed.
   2. Custom agents: which ones, in which Kiro app, and their impact.
   3. Agent hooks: which workflows were automated and how they changed development.
   4. Spec-driven development: how specs were structured, how it improved development, and how it compared to vibe coding.
   5. Steering: how it improved responses and which strategy made the biggest difference.
   6. MCP: how the servers (third-party and the custom Doppelganger MCP) extended Kiro, and what they made possible.
   7. Property-based testing: which requirements had properties and which bugs PBT caught that unit tests missed.
   8. Kiro powers: which powers were used, and the custom Doppelgänger power.
2. EACH section SHALL cite at least one concrete example with a link to a file, commit or journal entry.
3. THE Write_Up SHALL include setbacks and what was changed because of them.
4. THE Write_Up SHALL contain only facts recorded in the Journal or verifiable in the repository.

### Requirement 3: Public reachability

**User Story:** As a visitor, I want every published link to work.

#### Acceptance Criteria

1. WHEN a release is checked, THE live demo and the repository SHALL be publicly reachable from a logged-out browser.
